import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAffiliateFromToken } from '@/lib/affiliate';

/**
 * GET /api/affiliate/dashboard
 * Mengambil semua data yang diperlukan untuk halaman dashboard affiliator.
 * Auth: Bearer token dengan role 'affiliate' (JWT khusus affiliator)
 */
export async function GET(request: NextRequest) {
    try {
        // ─── 1. Auth Check ──────────────────────────────────────────────────
        const affiliate = getAffiliateFromToken(request);
        if (!affiliate) {
            return NextResponse.json({ message: 'Unauthorized. Token affiliator tidak valid.' }, { status: 401 });
        }

        const { affiliateId } = affiliate;

        // ─── 2. Ambil profil affiliator ─────────────────────────────────────
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('affiliates')
            .select('id, name, email, phone, referral_code, tier, commission_rate, commission_type, status, bank_name, bank_account_number, bank_account_name, total_clicks, total_referrals, total_paid_referrals')
            .eq('id', affiliateId)
            .single();

        if (profileError || !profile) {
            return NextResponse.json({ message: 'Profil affiliator tidak ditemukan.' }, { status: 404 });
        }

        // ─── 3. Hitung saldo komisi ──────────────────────────────────────────
        const { data: commissions } = await supabaseAdmin
            .from('affiliate_commissions')
            .select('amount, status')
            .eq('affiliate_id', affiliateId);

        const balance = {
            pending: 0,
            available: 0,
            paid_out: 0,
            total_earned: 0,
        };

        (commissions || []).forEach((c: any) => {
            const amt = Number(c.amount);
            if (c.status === 'pending')   balance.pending   += amt;
            if (c.status === 'available') balance.available += amt;
            if (c.status === 'paid')      balance.paid_out  += amt;
        });
        balance.total_earned = balance.pending + balance.available + balance.paid_out;

        // ─── 4. Komisi terbaru (10 terakhir + nama toko) ─────────────────────
        const { data: recentCommissions } = await supabaseAdmin
            .from('affiliate_commissions')
            .select('id, amount, commission_rate, transaction_amount, type, status, available_at, paid_at, created_at, tenants(shop_name, slug)')
            .eq('affiliate_id', affiliateId)
            .order('created_at', { ascending: false })
            .limit(10);

        // ─── 5. Referral terbaru (10 terakhir) ──────────────────────────────
        const { data: recentReferrals } = await supabaseAdmin
            .from('affiliate_referrals')
            .select('id, status, referral_code, registered_at, first_paid_at, tenants(shop_name, slug)')
            .eq('affiliate_id', affiliateId)
            .order('registered_at', { ascending: false })
            .limit(10);

        // ─── 6. Pencairan terbaru (5 terakhir) ──────────────────────────────
        const { data: withdrawals } = await supabaseAdmin
            .from('affiliate_withdrawals')
            .select('id, amount, status, bank_name, bank_account_number, requested_at, processed_at, admin_notes')
            .eq('affiliate_id', affiliateId)
            .order('requested_at', { ascending: false })
            .limit(5);

        // ─── 7. Hitung conversion rate ──────────────────────────────────────
        const conversionRate = profile.total_referrals > 0
            ? Math.round((profile.total_paid_referrals / profile.total_referrals) * 100)
            : 0;

        return NextResponse.json({
            profile,
            balance,
            recent_commissions: recentCommissions || [],
            recent_referrals: recentReferrals || [],
            conversion_rate: conversionRate,
            withdrawals: withdrawals || [],
        });

    } catch (error: any) {
        console.error('[Affiliate Dashboard] Error:', error);
        return NextResponse.json({ message: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
