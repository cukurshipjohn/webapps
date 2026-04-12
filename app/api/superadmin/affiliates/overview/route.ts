import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';

/**
 * GET /api/superadmin/affiliates/overview
 * Statistik keseluruhan program affiliate untuk dashboard superadmin.
 */
export async function GET(request: NextRequest) {
    const user = getUserFromToken(request);
    if (!user) return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 });
    try { requireRole('superadmin', user.role); }
    catch { return NextResponse.json({ message: 'Akses ditolak.' }, { status: 403 }); }

    try {
        // ─── 1. Statistik affiliator ─────────────────────────────────────────
        const { data: affiliates } = await supabaseAdmin
            .from('affiliates')
            .select('id, status, total_clicks, total_referrals, total_paid_referrals');

        const totalAffiliates   = (affiliates || []).length;
        const activeAffiliates  = (affiliates || []).filter((a: any) => a.status === 'active').length;

        // BUG #2 FIX: Status affiliator baru setelah daftar adalah 'unverified' (bukan 'pending').
        // Filter lama .filter(a => a.status === 'pending') selalu menghasilkan 0 karena
        // register/route.ts menyimpan status = 'unverified'.
        // Sekarang filter mencakup KEDUA status agar superadmin mendapat hitungan akurat:
        //   'unverified' — baru daftar, belum klik link WA
        //   'pending'    — sudah verifikasi WA tapi menunggu manual review (jika ditambahkan di masa depan)
        const pendingApproval   = (affiliates || []).filter((a: any) => ['unverified', 'pending'].includes(a.status)).length;
        const totalClicksAll    = (affiliates || []).reduce((s: number, a: any) => s + (a.total_clicks || 0), 0);
        const totalReferralsAll = (affiliates || []).reduce((s: number, a: any) => s + (a.total_referrals || 0), 0);
        const totalPaidReferrals = (affiliates || []).reduce((s: number, a: any) => s + (a.total_paid_referrals || 0), 0);

        const overallConversionRate = totalReferralsAll > 0
            ? Math.round((totalPaidReferrals / totalReferralsAll) * 100)
            : 0;

        // ─── 2. Statistik komisi — exclude trial ─────────────────────────────
        const { data: commissions } = await supabaseAdmin
            .from('affiliate_commissions')
            .select('amount, status, tenant_id, tenants!inner(plan)')
            .not('tenants.plan', 'eq', 'trial');

        const totalCommissionPaid = (commissions || [])
            .filter((c: any) => c.status === 'paid')
            .reduce((s: number, c: any) => s + Number(c.amount), 0);

        const totalCommissionPending = (commissions || [])
            .filter((c: any) => ['pending', 'available', 'processing'].includes(c.status))
            .reduce((s: number, c: any) => s + Number(c.amount), 0);

        // ─── 3. Pending withdrawals ──────────────────────────────────────────
        const { data: pendingWithdrawals } = await supabaseAdmin
            .from('affiliate_withdrawals')
            .select('id, amount')
            .eq('status', 'requested');

        const pendingWithdrawalsCount  = (pendingWithdrawals || []).length;
        const pendingWithdrawalsAmount = (pendingWithdrawals || []).reduce((s: number, w: any) => s + Number(w.amount), 0);

        // ─── 4. Top 5 affiliator ─────────────────────────────────────────────
        const { data: topRaw } = await supabaseAdmin
            .from('affiliates')
            .select(`
                id, name, referral_code, total_paid_referrals,
                affiliate_commissions ( amount, status )
            `)
            .eq('status', 'active')
            .order('total_paid_referrals', { ascending: false })
            .limit(5);

        const topAffiliates = (topRaw || []).map((a: any) => {
            const earned = (a.affiliate_commissions || [])
                .filter((c: any) => c.status !== 'cancelled')
                .reduce((s: number, c: any) => s + Number(c.amount), 0);
            return {
                name: a.name,
                referral_code: a.referral_code,
                total_paid_referrals: a.total_paid_referrals,
                total_earned: earned,
            };
        });

        return NextResponse.json({
            total_affiliates: totalAffiliates,
            active_affiliates: activeAffiliates,
            pending_approval: pendingApproval,
            total_clicks_all_time: totalClicksAll,
            total_referrals_all_time: totalReferralsAll,
            total_paid_referrals: totalPaidReferrals,
            overall_conversion_rate: overallConversionRate,
            total_commission_paid: totalCommissionPaid,
            total_commission_pending: totalCommissionPending,
            pending_withdrawals: pendingWithdrawalsCount,
            pending_withdrawals_amount: pendingWithdrawalsAmount,
            top_affiliates: topAffiliates,
        });

    } catch (error: any) {
        console.error('[SA Overview] Error:', error);
        return NextResponse.json({ message: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
