import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';
import { dateRangeToUTC, getTodayInTZ } from '@/lib/timezone';

export async function GET(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        
        const tenantId = user.tenant_id!;

        // --- 1. Fetch Tenant Timezone ---
        const { data: tenantData } = await supabaseAdmin
            .from('tenants')
            .select('timezone')
            .eq('id', tenantId)
            .single();
        const tenantTimezone = tenantData?.timezone ?? 'Asia/Jakarta';

        // --- 2. DateTime Calculation for Tenant Timezone ---
        const todayStr = getTodayInTZ(tenantTimezone);
        const { start: todayStart, end: todayEnd } = dateRangeToUTC(todayStr, tenantTimezone);

        const [y, m, d] = todayStr.split('-');
        
        // Start Month
        const daysInMon = new Date(parseInt(y), parseInt(m), 0).getDate();
        const startOfMonthStr = `${y}-${m}-01`;
        const endOfMonthStr = `${y}-${m}-${String(daysInMon).padStart(2, '0')}`;
        const { start: monthStart } = dateRangeToUTC(startOfMonthStr, tenantTimezone);
        const { end: monthEnd } = dateRangeToUTC(endOfMonthStr, tenantTimezone);
        
        // Start Week (Senin ke Minggu)
        const dummyDate = new Date(`${todayStr}T00:00:00.000Z`); // dummy utc math
        const dayOfWeek = dummyDate.getUTCDay(); // 0(Ming)=7, 1(Sen)=1
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const startOfWeekDummy = new Date(dummyDate.getTime() - diff * 24 * 60 * 60 * 1000);
        const w_y = startOfWeekDummy.getUTCFullYear();
        const w_m = String(startOfWeekDummy.getUTCMonth() + 1).padStart(2, '0');
        const w_d = String(startOfWeekDummy.getUTCDate()).padStart(2, '0');
        const startOfWeekStr = `${w_y}-${w_m}-${w_d}`;
        const { start: weekStart } = dateRangeToUTC(startOfWeekStr, tenantTimezone);

        // Sunday end of week
        const endOfWeekDummy = new Date(startOfWeekDummy.getTime() + 6 * 24 * 60 * 60 * 1000);
        const ew_y = endOfWeekDummy.getUTCFullYear();
        const ew_m = String(endOfWeekDummy.getUTCMonth() + 1).padStart(2, '0');
        const ew_d = String(endOfWeekDummy.getUTCDate()).padStart(2, '0');
        const endOfWeekStr = `${ew_y}-${ew_m}-${ew_d}`;
        const { end: weekEnd } = dateRangeToUTC(endOfWeekStr, tenantTimezone);
        
        const now = new Date();

        // --- 2. Parallel Supabase Queries (tenant-isolated with explicit .eq) ---
        const bookingsPromises = [
            // [0] Total Bookings Today (confirmed, completed)
            supabaseAdmin.from('bookings').select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .in('status', ['confirmed', 'completed'])
                .gte('start_time', todayStart)
                .lte('start_time', todayEnd),
                
            // [1] Total Bookings This Week
            supabaseAdmin.from('bookings').select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .in('status', ['confirmed', 'completed'])
                .gte('start_time', weekStart)
                .lte('start_time', weekEnd),

            // [2] Revenue Today (Completed only)
            supabaseAdmin.from('bookings').select('final_price, payment_method, booking_source, services(price)')
                .eq('tenant_id', tenantId)
                .eq('status', 'completed')
                .gte('start_time', todayStart)
                .lte('start_time', todayEnd),

            // [3] Revenue This Month (Completed only)
            supabaseAdmin.from('bookings').select('final_price, services(price)')
                .eq('tenant_id', tenantId)
                .eq('status', 'completed')
                .gte('start_time', monthStart)
                .lte('start_time', monthEnd),

            // [4] Active Barbers
            supabaseAdmin.from('barbers').select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId),

            // [5] Upcoming Bookings (Confirmed, > Now)
            supabaseAdmin.from('bookings').select(`
                id, start_time, end_time, service_type, final_price,
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
        const revenue_today_breakdown = { cash: 0, qris: 0, transfer: 0, online: 0, pos: 0 };
        const revenue_today = revTodayData.reduce((sum: number, row: any) => {
            const price = row.final_price ?? row.services?.price ?? 0;
            if (row.payment_method === 'cash') revenue_today_breakdown.cash += price;
            else if (row.payment_method === 'qris') revenue_today_breakdown.qris += price;
            else if (row.payment_method === 'transfer') revenue_today_breakdown.transfer += price;
            
            if (row.booking_source === 'pos_kasir') revenue_today_breakdown.pos += 1;
            else revenue_today_breakdown.online += 1;
            
            return sum + price;
        }, 0);
        
        // Sum revenue month
        const revMonthData = results[3].data || [];
        const revenue_this_month = revMonthData.reduce((sum: number, row: any) => {
            const price = row.final_price ?? row.services?.price ?? 0;
            return sum + price;
        }, 0);
        
        const upcoming_bookings = results[5].data || [];
        const barbers_list = results[6].data || [];

        // --- 4. Fetch tenant info (slug, shop_name & logo) ---
        const { data: tenantInfo } = await supabaseAdmin
            .from('tenants')
            .select(`
                slug,
                effective_slug,
                shop_name,
                tenant_settings(logo_url)
            `)
            .eq('id', user.tenant_id!)
            .single();

        // Build Final JSON
        const responseData = {
            bookings_today,
            bookings_this_week,
            revenue_today,
            revenue_today_breakdown,
            revenue_this_month,
            active_barbers: active_barbers_count,
            upcoming_bookings,
            barbers_list,
            slug: tenantInfo?.slug || null,
            effective_slug: (tenantInfo as any)?.effective_slug || tenantInfo?.slug || null,
            shop_name: tenantInfo?.shop_name || null,
            logo_url: (tenantInfo?.tenant_settings as any)?.[0]?.logo_url 
                        || (tenantInfo?.tenant_settings as any)?.logo_url 
                        || null,
            meta: {
                timezone: tenantTimezone,
                date: todayStr,
            }
        };
        
        return NextResponse.json(responseData);
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: error.message.includes('403') ? 403 : 500 });
    }
}
