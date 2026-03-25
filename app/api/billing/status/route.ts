import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken } from '@/lib/auth';
import {
    getPlanById,
    isAnnualPlan,
    getHomeServiceLimit,
    getAnnualSavings,
    canCustomSubdomain,
} from '@/lib/billing-plans';

export async function GET(request: NextRequest) {
    try {
        // ─── 1. Auth ────────────────────────────────────────────────────────────
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        if (!user.tenant_id) return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 403 });

        const tenantId = user.tenant_id;

        // ─── 2. Ambil info tenant (termasuk kolom baru annual/subdomain) ─────────
        const { data: tenant, error: tenantError } = await supabaseAdmin
            .from('tenants')
            .select(`
                plan, plan_expires_at, is_active,
                max_barbers, max_bookings_per_month,
                billing_cycle,
                effective_slug, custom_slug,
                subdomain_revisions_remaining
            `)
            .eq('id', tenantId)   // ← WAJIB
            .single();

        if (tenantError || !tenant) {
            return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 404 });
        }

        const planId = tenant.plan || 'starter';
        const plan   = getPlanById(planId);
        const annual = isAnnualPlan(planId);

        // ─── 3. Usage: barber aktif ──────────────────────────────────────────────
        const { count: barberCount } = await supabaseAdmin
            .from('barbers')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId);

        // ─── 4. Usage: booking bulan ini ────────────────────────────────────────
        const now           = new Date();
        const startOfMonth  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const endOfMonth    = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

        const { count: bookingCount } = await supabaseAdmin
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .gte('created_at', startOfMonth)
            .lte('created_at', endOfMonth);

        // ─── 5. Usage: home service bulan ini ───────────────────────────────────
        const { count: homeServiceCount } = await supabaseAdmin
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('service_type', 'home')
            .gte('created_at', startOfMonth)
            .lte('created_at', endOfMonth);

        // ─── 6. Riwayat transaksi (10 terakhir) ─────────────────────────────────
        const { data: transactions } = await supabaseAdmin
            .from('subscription_transactions')
            .select('id, plan, amount, billing_cycle, discount_percent, original_amount, status, paid_at, period_start, period_end, created_at')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(10);

        // ─── 7. Hitung sisa hari aktif ───────────────────────────────────────────
        const expiresAt     = tenant.plan_expires_at ? new Date(tenant.plan_expires_at) : null;
        const daysRemaining = expiresAt
            ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
            : 0;

        // ─── 8. Savings info untuk plan tahunan ─────────────────────────────────
        const savedAmount  = getAnnualSavings(planId);  // 0 jika bukan annual
        const savings = annual && plan && savedAmount > 0
            ? {
                discount_percent: plan.discount_percent,
                saved_amount: savedAmount,
              }
            : null;

        // ─── 9. Build response ───────────────────────────────────────────────────
        return NextResponse.json({
            // Status plan
            plan: planId,
            is_active: tenant.is_active,
            plan_expires_at: tenant.plan_expires_at,

            // Info billing cycle
            billing_cycle: tenant.billing_cycle || 'monthly',
            is_annual: annual,
            days_remaining: daysRemaining,

            // Custom subdomain
            can_custom_subdomain: canCustomSubdomain(planId),
            subdomain_revisions_remaining: tenant.subdomain_revisions_remaining ?? 0,
            effective_slug: tenant.effective_slug,
            custom_slug: tenant.custom_slug ?? null,

            // Penghematan (null jika bukan plan tahunan)
            savings,

            // Limits dari plan (bukan dari DB — single source of truth billing-plans.ts)
            limits: {
                max_barbers: plan?.max_barbers ?? tenant.max_barbers ?? 2,
                max_bookings_per_month: plan?.max_bookings_per_month ?? tenant.max_bookings_per_month ?? 50,
                max_home_service_per_month: getHomeServiceLimit(planId),
            },

            // Pemakaian bulan ini
            usage: {
                barbers: barberCount ?? 0,
                bookings_this_month: bookingCount ?? 0,
                home_service_this_month: homeServiceCount ?? 0,
            },

            // Riwayat pembayaran
            transactions: transactions ?? [],
        });

    } catch (error: any) {
        console.error('[Billing Status] Error:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
