import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        
        // --- 1. DateTime Calculation for Asia/Jakarta ---
        const now = new Date();
        const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
        const [y, m, d] = fmt.split('-');
        
        // Start Today
        const startOfTodayWIB = new Date(`${y}-${m}-${d}T00:00:00.000+07:00`);
        const endOfTodayWIB = new Date(`${y}-${m}-${d}T23:59:59.999+07:00`);
        
        // Start Month
        const daysInMon = new Date(parseInt(y), parseInt(m), 0).getDate();
        const startOfMonthWIB = new Date(`${y}-${m}-01T00:00:00.000+07:00`);
        const endOfMonthWIB = new Date(`${y}-${m}-${daysInMon}T23:59:59.999+07:00`);
        
        // Start Week (Senin ke Minggu)
        const dummyDate = new Date(`${y}-${m}-${d}T00:00:00.000Z`); // dummy utc math
        const dayOfWeek = dummyDate.getUTCDay(); // 0(Ming)=7, 1(Sen)=1
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const startOfWeekDummy = new Date(dummyDate.getTime() - diff * 24 * 60 * 60 * 1000);
        const w_y = startOfWeekDummy.getUTCFullYear();
        const w_m = String(startOfWeekDummy.getUTCMonth() + 1).padStart(2, '0');
        const w_d = String(startOfWeekDummy.getUTCDate()).padStart(2, '0');
        const startOfWeekWIB = new Date(`${w_y}-${w_m}-${w_d}T00:00:00.000+07:00`);
        // Let's get Sunday end of week
        const endOfWeekDummy = new Date(startOfWeekDummy.getTime() + 6 * 24 * 60 * 60 * 1000);
        const ew_y = endOfWeekDummy.getUTCFullYear();
        const ew_m = String(endOfWeekDummy.getUTCMonth() + 1).padStart(2, '0');
        const ew_d = String(endOfWeekDummy.getUTCDate()).padStart(2, '0');
        const endOfWeekWIB = new Date(`${ew_y}-${ew_m}-${ew_d}T23:59:59.999+07:00`);
        
        const tenantId = user.tenant_id!;

        // --- 2. Parallel Supabase Queries (tenant-isolated with explicit .eq) ---
        const bookingsPromises = [
            // [0] Total Bookings Today (confirmed, completed)
            supabaseAdmin.from('bookings').select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .in('status', ['confirmed', 'completed'])
                .gte('start_time', startOfTodayWIB.toISOString())
                .lte('start_time', endOfTodayWIB.toISOString()),
                
            // [1] Total Bookings This Week
            supabaseAdmin.from('bookings').select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .in('status', ['confirmed', 'completed'])
                .gte('start_time', startOfWeekWIB.toISOString())
                .lte('start_time', endOfWeekWIB.toISOString()),

            // [2] Revenue Today (Completed only)
            supabaseAdmin.from('bookings').select('services(price)')
                .eq('tenant_id', tenantId)
                .eq('status', 'completed')
                .gte('start_time', startOfTodayWIB.toISOString())
                .lte('start_time', endOfTodayWIB.toISOString()),

            // [3] Revenue This Month (Completed only)
            supabaseAdmin.from('bookings').select('services(price)')
                .eq('tenant_id', tenantId)
                .eq('status', 'completed')
                .gte('start_time', startOfMonthWIB.toISOString())
                .lte('start_time', endOfMonthWIB.toISOString()),

            // [4] Active Barbers
            supabaseAdmin.from('barbers').select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId),

            // [5] Upcoming Bookings (Confirmed, > Now)
            supabaseAdmin.from('bookings').select(`
                id, start_time, end_time, service_type,
                users(name, phone_number),
                barbers(name),
                services(name, price)
            `)
            .eq('tenant_id', tenantId)
            .eq('status', 'confirmed')
            .gte('start_time', now.toISOString())
            .order('start_time', { ascending: true })
            .limit(5),
            
            // [6] Get Barbers Info for 'Active Barbers' section list
            supabaseAdmin.from('barbers').select('id, name, specialty, photo_url')
                .eq('tenant_id', tenantId)
                .order('name', { ascending: true })
        ];

        const results = await Promise.all(bookingsPromises);
        
        // --- 3. Extract and Process Data ---
        const bookings_today = results[0].count || 0;
        const bookings_this_week = results[1].count || 0;
        const active_barbers_count = results[4].count || 0;
        
        // Sum revenue today
        const revTodayData = results[2].data || [];
        const revenue_today = revTodayData.reduce((sum: number, row: any) => {
            return sum + (row.services?.price || 0);
        }, 0);
        
        // Sum revenue month
        const revMonthData = results[3].data || [];
        const revenue_this_month = revMonthData.reduce((sum: number, row: any) => {
            return sum + (row.services?.price || 0);
        }, 0);
        
        const upcoming_bookings = results[5].data || [];
        const barbers_list = results[6].data || [];

        // --- 4. Fetch tenant info (slug & shop_name) ---
        const { data: tenantInfo } = await supabaseAdmin
            .from('tenants')
            .select('slug, shop_name')
            .eq('id', user.tenant_id!)
            .single();

        // Build Final JSON
        const responseData = {
            bookings_today,
            bookings_this_week,
            revenue_today,
            revenue_this_month,
            active_barbers: active_barbers_count,
            upcoming_bookings,
            barbers_list,
            slug: tenantInfo?.slug || null,
            shop_name: tenantInfo?.shop_name || null,
        };
        
        return NextResponse.json(responseData);
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: error.message.includes('403') ? 403 : 500 });
    }
}
