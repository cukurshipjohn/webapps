import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAffiliateFromToken, formatRupiah } from '@/lib/affiliate';

function sendWA(phone: string, message: string) {
    let waUrl = process.env.WHATSAPP_SERVICE_URL;
    const waSecret = process.env.WHATSAPP_SERVICE_SECRET;
    if (!waUrl || !waSecret) return;
    if (!waUrl.startsWith('http')) waUrl = `https://${waUrl}`;
    fetch(`${waUrl}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': waSecret },
        body: JSON.stringify({ phoneNumber: phone, message }),
    }).catch(err => console.error('[Affiliate Withdraw] WA error:', err));
}

// ─── GET: Riwayat pencairan ──────────────────────────────────────────────────
export async function GET(request: NextRequest) {
    const aff = getAffiliateFromToken(request);
    if (!aff) return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 });

    const { data, error } = await supabaseAdmin
        .from('affiliate_withdrawals')
        .select('*')
        .eq('affiliate_id', aff.affiliateId)
        .order('requested_at', { ascending: false });

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ withdrawals: data || [] });
}

// ─── POST: Request pencairan baru ────────────────────────────────────────────
export async function POST(request: NextRequest) {
    try {
        const aff = getAffiliateFromToken(request);
        if (!aff) return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 });

        const body = await request.json();
        const { amount } = body;

        if (!amount || typeof amount !== 'number') {
            return NextResponse.json({ message: 'Jumlah pencairan tidak valid.' }, { status: 400 });
        }

        // ─── 1. Ambil data affiliat ──────────────────────────────────────────
        const { data: affiliate, error: affErr } = await supabaseAdmin
            .from('affiliates')
            .select('id, name, phone, bank_name, bank_account_number, bank_account_name')
            .eq('id', aff.affiliateId)
            .single();

        if (affErr || !affiliate) return NextResponse.json({ message: 'Data affiliat tidak ditemukan.' }, { status: 404 });

        // ─── 2. Validasi rekening ────────────────────────────────────────────
        if (!affiliate.bank_account_number) {
            return NextResponse.json({ message: 'Lengkapi data rekening dulu di tab Profil.' }, { status: 400 });
        }

        // ─── 3. Hitung saldo available ───────────────────────────────────────
        const { data: commissions } = await supabaseAdmin
            .from('affiliate_commissions')
            .select('id, amount')
            .eq('affiliate_id', aff.affiliateId)
            .eq('status', 'available')
            .order('created_at', { ascending: true }); // FIFO

        const availableBalance = (commissions || []).reduce((sum: number, c: any) => sum + Number(c.amount), 0);

        // ─── 4. Validasi amount ──────────────────────────────────────────────
        if (amount < 50000) {
            return NextResponse.json({ message: `Minimum pencairan adalah ${formatRupiah(50000)}.` }, { status: 400 });
        }
        if (amount > availableBalance) {
            return NextResponse.json({
                message: `Jumlah melebihi saldo tersedia (${formatRupiah(availableBalance)}).`
            }, { status: 400 });
        }

        // ─── 5. Pilih komisi FIFO sampai cukup (greedy selection) ───────────
        let running = 0;
        const selectedIds: string[] = [];
        for (const c of (commissions || []) as any[]) {
            if (running >= amount) break;
            selectedIds.push(c.id);
            running += Number(c.amount);
        }

        // ─── 6. Insert ke affiliate_withdrawals ──────────────────────────────
        // Gunakan `running` sebagai actual amount agar saldo komisi yang dicairkan presisi
        const actualWithdrawalAmount = running;

        const { data: withdrawal, error: wErr } = await supabaseAdmin
            .from('affiliate_withdrawals')
            .insert({
                affiliate_id: aff.affiliateId,
                amount: actualWithdrawalAmount,
                bank_name: affiliate.bank_name,
                bank_account_number: affiliate.bank_account_number,
                bank_account_name: affiliate.bank_account_name,
                status: 'requested',
                commission_ids: selectedIds,
            })
            .select('id')
            .single();

        if (wErr) throw wErr;

        // ─── 7. Update komisi → status 'processing' ──────────────────────────
        // Cegah race condition: hanya update yang statusnya benar-benar 'available'
        await supabaseAdmin
            .from('affiliate_commissions')
            .update({ status: 'processing' })
            .in('id', selectedIds)
            .eq('status', 'available');

        // ─── 8. WA ke affiliator ─────────────────────────────────────────────
        sendWA(affiliate.phone,
            `✅ *Request pencairan diterima!*\n\n` +
            `Detail:\n` +
            `• Jumlah: ${formatRupiah(actualWithdrawalAmount)}\n` +
            `• Rekening: ${affiliate.bank_name} ${affiliate.bank_account_number}\n` +
            `• A.N.: ${affiliate.bank_account_name}\n\n` +
            `Proses pencairan 1-2 hari kerja.\nKamu akan dihubungi setelah transfer dilakukan. 🙏`
        );

        // ─── 9. WA ke superadmin ─────────────────────────────────────────────
        const superadminPhone = process.env.SUPERADMIN_PHONE;
        if (superadminPhone) {
            sendWA(superadminPhone,
                `💸 *Request Pencairan Affiliator*\n\n` +
                `Nama   : ${affiliate.name}\n` +
                `WA     : ${affiliate.phone}\n` +
                `Jumlah : ${formatRupiah(actualWithdrawalAmount)}\n` +
                `Rekening: ${affiliate.bank_name} ${affiliate.bank_account_number} a.n. ${affiliate.bank_account_name}\n\n` +
                `Setujui di: https://cukurship.id/superadmin/affiliates/withdrawals`
            );
        }

        return NextResponse.json({ success: true, withdrawal_id: withdrawal.id });

    } catch (error: any) {
        console.error('[Affiliate Withdraw] Error:', error);
        return NextResponse.json({ message: error.message || 'Terjadi kesalahan.' }, { status: 500 });
    }
}
