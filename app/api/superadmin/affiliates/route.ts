import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';

function sendWA(phone: string, message: string) {
    let waUrl = process.env.WHATSAPP_SERVICE_URL;
    const waSecret = process.env.WHATSAPP_SERVICE_SECRET;
    if (!waUrl || !waSecret) return;
    if (!waUrl.startsWith('http')) waUrl = `https://${waUrl}`;
    fetch(`${waUrl}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': waSecret },
        body: JSON.stringify({ phoneNumber: phone, message }),
    }).catch(err => console.error('[SA Affiliates] WA error:', err));
}

// ─── GET: List semua affiliator ────────────────────────────────────────────────
export async function GET(request: NextRequest) {
    const user = getUserFromToken(request);
    if (!user) return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 });
    try { requireRole('superadmin', user.role); }
    catch { return NextResponse.json({ message: 'Akses ditolak.' }, { status: 403 }); }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');
    const tierFilter   = searchParams.get('tier');

    let query = supabaseAdmin
        .from('affiliates')
        .select(`
            id, name, phone, referral_code, tier, commission_rate, commission_type,
            status, total_clicks, total_referrals, total_paid_referrals,
            created_at, approved_at,
            affiliate_commissions ( amount, status )
        `)
        .order('created_at', { ascending: false });

    if (statusFilter) query = query.eq('status', statusFilter);
    if (tierFilter)   query = query.eq('tier', tierFilter);

    const { data, error } = await query;
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });

    const affiliates = (data || []).map((a: any) => {
        const commissions = a.affiliate_commissions || [];
        const totalEarned = commissions
            .filter((c: any) => c.status !== 'cancelled')
            .reduce((sum: number, c: any) => sum + Number(c.amount), 0);
        const pendingBalance = commissions
            .filter((c: any) => ['pending', 'available'].includes(c.status))
            .reduce((sum: number, c: any) => sum + Number(c.amount), 0);
        const conversionRate = a.total_referrals > 0
            ? Math.round((a.total_paid_referrals / a.total_referrals) * 100)
            : 0;

        const { affiliate_commissions, ...rest } = a;
        return { ...rest, total_earned: totalEarned, pending_balance: pendingBalance, conversion_rate: conversionRate };
    });

    return NextResponse.json({ affiliates });
}

// ─── PATCH: Update status / commission_rate ────────────────────────────────────
export async function PATCH(request: NextRequest) {
    const user = getUserFromToken(request);
    if (!user) return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 });
    try { requireRole('superadmin', user.role); }
    catch { return NextResponse.json({ message: 'Akses ditolak.' }, { status: 403 }); }

    try {
        const body = await request.json();
        const { affiliate_id, action, commission_rate } = body;

        if (!affiliate_id || !action) {
            return NextResponse.json({ message: 'Parameter tidak valid.' }, { status: 400 });
        }

        // Ambil data affiliate
        const { data: affiliate, error: affErr } = await supabaseAdmin
            .from('affiliates')
            .select('id, name, phone, referral_code, status, tier')
            .eq('id', affiliate_id)
            .single();

        if (affErr || !affiliate) {
            return NextResponse.json({ message: 'Affiliator tidak ditemukan.' }, { status: 404 });
        }

        if (action === 'approve') {
            if (affiliate.tier !== 'reseller' || affiliate.status !== 'pending') {
                return NextResponse.json({ message: 'Hanya reseller berstatus pending yang bisa di-approve.' }, { status: 409 });
            }

            const updatePayload: Record<string, any> = {
                status: 'active',
                approved_at: new Date().toISOString(),
                commission_type: 'recurring',
            };
            if (commission_rate !== undefined && commission_rate !== null) {
                updatePayload.commission_rate = commission_rate;
            }

            const { error: updateErr } = await supabaseAdmin
                .from('affiliates')
                .update(updatePayload)
                .eq('id', affiliate_id);

            if (updateErr) throw updateErr;

            const rootDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || 'cukurship.id';
            const rate = commission_rate ?? 20;
            sendWA(affiliate.phone,
                `✅ *Pendaftaran Reseller kamu disetujui!*\n\n` +
                `Kode Referral: *${affiliate.referral_code}*\n` +
                `Komisi: *${rate}% recurring* setiap bulan\n\n` +
                `Link referral aktif:\nhttps://${rootDomain}/register?ref=${affiliate.referral_code}\n\n` +
                `Selamat berjualan! 💪`
            );

        } else if (action === 'suspend') {
            const { error: updateErr } = await supabaseAdmin
                .from('affiliates')
                .update({ status: 'suspended' })
                .eq('id', affiliate_id);

            if (updateErr) throw updateErr;

            sendWA(affiliate.phone,
                `⚠️ Akun affiliate kamu telah dinonaktifkan sementara. Hubungi tim kami untuk informasi lebih lanjut.`
            );

        } else if (action === 'activate') {
            const { error: updateErr } = await supabaseAdmin
                .from('affiliates')
                .update({ status: 'active' })
                .eq('id', affiliate_id);

            if (updateErr) throw updateErr;

            sendWA(affiliate.phone, `✅ Akun affiliate kamu telah diaktifkan kembali. Selamat berjualan! 💪`);

        } else if (action === 'update_rate') {
            if (commission_rate === undefined || commission_rate === null) {
                return NextResponse.json({ message: 'commission_rate wajib diisi.' }, { status: 400 });
            }
            const { error: updateErr } = await supabaseAdmin
                .from('affiliates')
                .update({ commission_rate })
                .eq('id', affiliate_id);

            if (updateErr) throw updateErr;

        } else {
            return NextResponse.json({ message: `Action '${action}' tidak dikenal.` }, { status: 400 });
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('[SA Affiliates] PATCH error:', error);
        return NextResponse.json({ message: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
