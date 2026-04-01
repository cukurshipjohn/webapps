import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';

/**
 * GET /api/superadmin/affiliates/[id]
 * Detail lengkap satu affiliator: profil, komisi, referral, klik per minggu.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const user = getUserFromToken(request);
    if (!user) return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 });
    try { requireRole('superadmin', user.role); }
    catch { return NextResponse.json({ message: 'Akses ditolak.' }, { status: 403 }); }

    const affiliateId = params.id;

    try {
        // ─── 1. Profil affiliator ─────────────────────────────────────────────
        const { data: profile, error: profErr } = await supabaseAdmin
            .from('affiliates')
            .select('*')
            .eq('id', affiliateId)
            .single();

        if (profErr || !profile) {
            return NextResponse.json({ message: 'Affiliator tidak ditemukan.' }, { status: 404 });
        }

        // ─── 2. Semua komisi ──────────────────────────────────────────────────
        const { data: commissions } = await supabaseAdmin
            .from('affiliate_commissions')
            .select('id, amount, commission_rate, transaction_amount, status, type, available_at, paid_at, created_at, tenants(shop_name, slug)')
            .eq('affiliate_id', affiliateId)
            .order('created_at', { ascending: false });

        const totalEarned = (commissions || [])
            .filter((c: any) => c.status !== 'cancelled')
            .reduce((s: number, c: any) => s + Number(c.amount), 0);

        const pendingBalance = (commissions || [])
            .filter((c: any) => ['pending', 'available'].includes(c.status))
            .reduce((s: number, c: any) => s + Number(c.amount), 0);

        // ─── 3. Semua referral ────────────────────────────────────────────────
        const { data: referrals } = await supabaseAdmin
            .from('affiliate_referrals')
            .select('id, status, referral_code, registered_at, first_paid_at, tenants(shop_name, slug, plan, is_active)')
            .eq('affiliate_id', affiliateId)
            .order('registered_at', { ascending: false });

        // ─── 4. Klik per minggu (8 minggu terakhir) ───────────────────────────
        const eightWeeksAgo = new Date();
        eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

        const { data: clicks } = await supabaseAdmin
            .from('affiliate_clicks')
            .select('clicked_at, converted')
            .eq('affiliate_id', affiliateId)
            .gte('clicked_at', eightWeeksAgo.toISOString())
            .order('clicked_at', { ascending: true });

        // Group by week
        const weekMap: Record<string, { week: string; clicks: number; conversions: number }> = {};
        (clicks || []).forEach((c: any) => {
            const d = new Date(c.clicked_at);
            const weekStart = new Date(d);
            weekStart.setDate(d.getDate() - d.getDay()); // Minggu dimulai hari Minggu
            const weekKey = weekStart.toISOString().split('T')[0];
            if (!weekMap[weekKey]) {
                weekMap[weekKey] = {
                    week: weekStart.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
                    clicks: 0,
                    conversions: 0,
                };
            }
            weekMap[weekKey].clicks++;
            if (c.converted) weekMap[weekKey].conversions++;
        });
        const clicksByWeek = Object.values(weekMap);

        // ─── 5. Riwayat pencairan ─────────────────────────────────────────────
        const { data: withdrawals } = await supabaseAdmin
            .from('affiliate_withdrawals')
            .select('id, amount, status, bank_name, bank_account_number, requested_at, processed_at, admin_notes')
            .eq('affiliate_id', affiliateId)
            .order('requested_at', { ascending: false });

        return NextResponse.json({
            profile: {
                ...profile,
                total_earned: totalEarned,
                pending_balance: pendingBalance,
                conversion_rate: profile.total_referrals > 0
                    ? Math.round((profile.total_paid_referrals / profile.total_referrals) * 100)
                    : 0,
            },
            commissions: commissions || [],
            referrals: referrals || [],
            clicks_by_week: clicksByWeek,
            withdrawals: withdrawals || [],
        });

    } catch (error: any) {
        console.error('[SA Affiliate Detail] Error:', error);
        return NextResponse.json({ message: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
