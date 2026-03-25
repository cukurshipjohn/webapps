import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { PLANS, type PlanId } from '@/lib/billing-plans';

function requireSuperAdmin(request: NextRequest) {
    const user = getUserFromToken(request);
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'superadmin') return NextResponse.json({ message: 'Forbidden: Superadmin only' }, { status: 403 });
    return user;
}

export async function GET(request: NextRequest) {
    try {
        const user = requireSuperAdmin(request);
        if (user instanceof NextResponse) return user;

        const now = new Date();
        const startOfMonth   = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const sevenDaysLater = new Date(now.getTime() + 7  * 24 * 60 * 60 * 1000).toISOString();
        const fourteenDays   = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

        // ─── 1. Ambil semua tenant beserta field baru ─────────────────────────────
        const { data: allTenants } = await supabaseAdmin
            .from('tenants')
            .select('id, plan, is_active, plan_expires_at, shop_name, slug, effective_slug, custom_slug, billing_cycle, created_at, owner_user_id');

        if (!allTenants) return NextResponse.json({ message: 'Failed to fetch tenants' }, { status: 500 });

        // ─── 2. Stat dasar ───────────────────────────────────────────────────────
        const totalTenants    = allTenants.length;
        const trialTenants    = allTenants.filter(t => t.plan === 'trial').length;
        const paidTenants     = allTenants.filter(t => t.plan !== 'trial' && t.is_active).length;
        const inactiveTenants = allTenants.filter(t => !t.is_active).length;

        // ─── 3. Stat plan tahunan vs bulanan ─────────────────────────────────────
        const annualSubscribers  = allTenants.filter(t => t.is_active && t.plan?.endsWith('_annual')).length;
        const monthlySubscribers = allTenants.filter(t => t.is_active && t.plan && !t.plan.endsWith('_annual') && t.plan !== 'trial').length;
        const customSubdomainCount = allTenants.filter(t => t.custom_slug != null).length;

        // ─── 4. ARR Estimate (Annual Revenue Run Rate) ───────────────────────────
        // Sum harga plan tahunan untuk semua tenant annual aktif
        const arrEstimate = allTenants
            .filter(t => t.is_active && t.plan?.endsWith('_annual'))
            .reduce((sum, t) => {
                const plan = PLANS[t.plan as PlanId];
                return sum + (plan?.price ?? 0);
            }, 0);

        // ─── 5. MRR dari transaksi bulan ini ────────────────────────────────────
        const { data: monthlyPaid } = await supabaseAdmin
            .from('subscription_transactions')
            .select('amount')
            .eq('status', 'paid')
            .gte('paid_at', startOfMonth);

        const mrr = (monthlyPaid || []).reduce((sum, tx) => sum + (tx.amount || 0), 0);

        // ─── 6. Tenant yang expired dalam 7 hari (semua plan) ─────────────────
        const expiringTenants = allTenants.filter(t => {
            if (!t.plan_expires_at) return false;
            const exp = new Date(t.plan_expires_at);
            return exp > now && exp <= new Date(sevenDaysLater) && t.plan !== 'trial';
        });

        // ─── 7. Tenant TAHUNAN yang akan expired dalam 14 hari ───────────────────
        const expiringAnnual14Days = allTenants.filter(t => {
            if (!t.plan_expires_at || !t.plan?.endsWith('_annual')) return false;
            const exp = new Date(t.plan_expires_at);
            return exp > now && exp <= new Date(fourteenDays);
        });

        // ─── 8. Ambil nomor owner untuk kedua list ───────────────────────────────
        const allExpiringIds = [...new Set([
            ...expiringTenants.map(t => t.owner_user_id),
            ...expiringAnnual14Days.map(t => t.owner_user_id),
        ])].filter(Boolean);

        let ownerMap: Record<string, any> = {};
        if (allExpiringIds.length > 0) {
            const { data: owners } = await supabaseAdmin
                .from('users')
                .select('id, phone_number, name')
                .in('id', allExpiringIds);
            ownerMap = Object.fromEntries((owners || []).map(o => [o.id, o]));
        }

        // Enrich dengan owner + days_remaining
        const enrichExpiring = (arr: typeof expiringTenants) =>
            arr.map((t: any) => ({
                ...t,
                owner_phone: ownerMap[t.owner_user_id]?.phone_number ?? null,
                days_remaining: Math.ceil((new Date(t.plan_expires_at).getTime() - Date.now()) / 86400000),
            }));

        const enrichedExpiring       = enrichExpiring(expiringTenants);
        const enrichedAnnual14Days   = enrichExpiring(expiringAnnual14Days);

        // ─── 9. 5 tenant terbaru ──────────────────────────────────────────────
        const newestTenants = allTenants
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 5);

        // ─── 10. Weekly stats (4 minggu terakhir) ───────────────────────────────
        const weeklyStats = [];
        for (let i = 3; i >= 0; i--) {
            const weekStart = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
            const weekEnd   = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
            const count = allTenants.filter(t => {
                const created = new Date(t.created_at);
                return created >= weekStart && created < weekEnd;
            }).length;
            weeklyStats.push({
                week: `${weekStart.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}`,
                count,
            });
        }

        return NextResponse.json({
            stats: {
                totalTenants,
                trialTenants,
                paidTenants,
                inactiveTenants,
                mrr,
                // ── BARU ──
                annual_subscribers:    annualSubscribers,
                monthly_subscribers:   monthlySubscribers,
                arr_estimate:          arrEstimate,
                custom_subdomain_count: customSubdomainCount,
            },
            newestTenants,
            expiringTenants: enrichedExpiring,
            expiring_annual_14days: enrichedAnnual14Days,   // ← BARU
            weeklyStats,
        });

    } catch (error: any) {
        console.error('[Superadmin Overview] Error:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
