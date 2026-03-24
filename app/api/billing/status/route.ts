import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken } from '@/lib/auth';
import { supabaseAdmin as db } from '@/lib/supabase';

export async function GET(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        if (!user.tenant_id) return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 403 });

        const tenantId = user.tenant_id;

        // Ambil info tenant (plan, expiry, limits)
        const { data: tenant, error: tenantError } = await db
            .from('tenants')
            .select('plan, plan_expires_at, max_barbers, max_bookings_per_month, is_active')
            .eq('id', tenantId)
            .single();

        if (tenantError || !tenant) {
            return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 404 });
        }

        // Hitung barber aktif
        const { count: barberCount } = await db
            .from('barbers')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId);

        // Hitung booking bulan ini
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

        const { count: bookingCount } = await db
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .gte('created_at', startOfMonth)
            .lte('created_at', endOfMonth);

        // Hitung home service bulan ini
        const { count: homeServiceCount } = await db
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('service_type', 'home')
            .gte('created_at', startOfMonth)
            .lte('created_at', endOfMonth);

        // Riwayat transaksi (maks 10 terakhir)
        const { data: transactions } = await db
            .from('subscription_transactions')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(10);

        // Hitung sisa hari
        const expiresAt = tenant.plan_expires_at ? new Date(tenant.plan_expires_at) : null;
        const daysRemaining = expiresAt
            ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
            : 0;

        const { getHomeServiceLimit } = await import('@/lib/billing-plans');
        
        return NextResponse.json({
            plan: tenant.plan || 'trial',
            is_active: tenant.is_active,
            plan_expires_at: tenant.plan_expires_at,
            days_remaining: daysRemaining,
            limits: {
                max_barbers: tenant.max_barbers ?? 2,
                max_bookings_per_month: tenant.max_bookings_per_month ?? 50,
                max_home_service_per_month: getHomeServiceLimit(tenant.plan || 'starter'),
            },
            usage: {
                barbers: barberCount ?? 0,
                bookings_this_month: bookingCount ?? 0,
                home_service_this_month: homeServiceCount ?? 0,
            },
            transactions: transactions ?? [],
        });

    } catch (error: any) {
        console.error('[Billing Status] Error:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
