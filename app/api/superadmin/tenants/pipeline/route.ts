import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken } from '@/lib/auth';
import { getPlanPrice, isInPromo } from '@/lib/billing-plans';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const user = getUserFromToken(request);
    if (!user || user.role !== 'superadmin') {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const filterStatus = searchParams.get('status');

        // 1. Ambil semua tenant beserta owner phone
        const { data: tenants, error: tenantsErr } = await supabaseAdmin
            .from('tenants')
            .select('*, users!owner_user_id(phone_number)');
            
        if (tenantsErr) throw tenantsErr;

        // Ambil semua transaksi settled/paid untuk hitung paid_cycles
        const { data: transactions, error: transErr } = await supabaseAdmin
            .from('subscription_transactions')
            .select('tenant_id')
            .in('status', ['settled', 'paid']);
            
        if (transErr) throw transErr;

        // Ambil follow-up data untuk semua tenant
        const { data: followups, error: followupsErr } = await supabaseAdmin
            .from('superadmin_followups')
            .select('*')
            .order('created_at', { ascending: false });

        if (followupsErr) throw followupsErr;

        let processedTenants = [];
        let summary = { total: 0, healthy: 0, expiring_soon: 0, at_risk: 0, churned: 0, trial: 0 };

        for (const tenant of (tenants || [])) {
            // Hitung paid_cycles
            const paidCycles = transactions?.filter(t => t.tenant_id === tenant.id).length || 0;
            
            // Hitung current_price & is_in_promo
            const currentPrice = getPlanPrice(tenant.plan, paidCycles);
            const inPromo = isInPromo(tenant.plan, paidCycles);

            // Tentukan lifecycle
            let lifecycleStatus = 'healthy';
            let daysUntilExpiry = 0;
            const now = new Date().getTime();

            if (tenant.plan === 'trial') {
                lifecycleStatus = 'trial';
            } else if (tenant.plan_expires_at) {
                const expiresAt = new Date(tenant.plan_expires_at).getTime();
                daysUntilExpiry = Math.ceil((expiresAt - now) / 86400000);

                if (!tenant.is_active && expiresAt < now) {
                    lifecycleStatus = 'churned';
                } else if (tenant.is_active && daysUntilExpiry >= 0 && daysUntilExpiry <= 7) {
                    lifecycleStatus = 'expiring_soon';
                } else if (tenant.is_active && daysUntilExpiry > 7 && daysUntilExpiry <= 30) {
                    lifecycleStatus = 'at_risk';
                }
            } else {
                // If no plan_expires_at (maybe trial or uninitialized)
                if (tenant.plan === 'trial') lifecycleStatus = 'trial';
            }

            // Hitung summary
            summary.total++;
            if (lifecycleStatus === 'healthy') summary.healthy++;
            else if (lifecycleStatus === 'expiring_soon') summary.expiring_soon++;
            else if (lifecycleStatus === 'at_risk') summary.at_risk++;
            else if (lifecycleStatus === 'churned') summary.churned++;
            else if (lifecycleStatus === 'trial') summary.trial++;

            // Jika ada filterStatus dan lifecycle tidak sesuai, skip dari result array
            if (filterStatus && lifecycleStatus !== filterStatus) {
                continue;
            }

            // Hitung followups
            const tenantFollowups = followups?.filter(f => f.tenant_id === tenant.id) || [];
            const lastFollowup = tenantFollowups.length > 0 ? {
                id: tenantFollowups[0].id,
                case_type: tenantFollowups[0].case_type,
                outcome: tenantFollowups[0].outcome,
                created_at: tenantFollowups[0].created_at
            } : null;

            const openFollowupCount = tenantFollowups.filter(f => f.outcome === 'pending').length;
            const ownerPhone = (tenant as any).users?.phone_number || null;

            processedTenants.push({
                id: tenant.id,
                shop_name: tenant.shop_name,
                slug: tenant.slug,
                plan: tenant.plan,
                plan_expires_at: tenant.plan_expires_at,
                is_active: tenant.is_active,
                owner_phone: ownerPhone,
                paid_cycles: paidCycles,
                current_price: currentPrice,
                is_in_promo: inPromo,
                lifecycle_status: lifecycleStatus,
                days_until_expiry: daysUntilExpiry,
                last_followup: lastFollowup,
                open_followup_count: openFollowupCount,
                created_at: tenant.created_at
            });
        }

        return NextResponse.json({
            tenants: processedTenants,
            summary
        });

    } catch (err: any) {
        console.error('[Pipeline GET] Error:', err);
        return NextResponse.json({ message: err.message || 'Internal Server Error' }, { status: 500 });
    }
}
