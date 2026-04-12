import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { formatRupiah } from '@/lib/affiliate';
import { getUserFromToken } from '@/lib/auth';

function sendWA(phone: string, message: string) {
    let waUrl = process.env.WHATSAPP_SERVICE_URL;
    const waSecret = process.env.WHATSAPP_SERVICE_SECRET;
    if (!waUrl || !waSecret) return;
    if (!waUrl.startsWith('http')) waUrl = `https://${waUrl}`;
    fetch(`${waUrl}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': waSecret },
        body: JSON.stringify({ phoneNumber: phone, message }),
    }).catch(err => console.error('[SA Withdrawals] WA error:', err));
}

// ─── GET: List semua request pencairan ──────────────────────────────────────
export async function GET(request: NextRequest) {
    const user = getUserFromToken(request);
    if (!user || user.role !== 'superadmin') {
        return NextResponse.json({ message: 'Akses ditolak.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');

    let query = supabaseAdmin
        .from('affiliate_withdrawals')
        .select(`
            *,
            affiliates ( id, name, phone, tier )
        `)
        .order('requested_at', { ascending: false });

    if (statusFilter) query = query.eq('status', statusFilter);

    const { data, error } = await query;
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });

    return NextResponse.json({ withdrawals: data || [] });
}

// ─── PATCH: Approve atau Reject ──────────────────────────────────────────────
export async function PATCH(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user || user.role !== 'superadmin') {
            return NextResponse.json({ message: 'Akses ditolak.' }, { status: 403 });
        }

        const body = await request.json();
        const { withdrawal_id, action, admin_notes, transfer_proof_url } = body;

        if (!withdrawal_id || !action || !['approve', 'reject'].includes(action)) {
            return NextResponse.json({ message: 'Parameter tidak valid.' }, { status: 400 });
        }

        // Ambil data withdrawal + affiliat
        const { data: withdrawal, error: wErr } = await supabaseAdmin
            .from('affiliate_withdrawals')
            .select('*, affiliates ( id, name, phone )')
            .eq('id', withdrawal_id)
            .single();

        if (wErr || !withdrawal) return NextResponse.json({ message: 'Request tidak ditemukan.' }, { status: 404 });
        if (withdrawal.status !== 'requested' && withdrawal.status !== 'processing') {
            return NextResponse.json({ message: 'Request ini sudah diproses.' }, { status: 409 });
        }

        const affiliate = withdrawal.affiliates as any;
        const commissionIds: string[] = withdrawal.commission_ids || [];

        if (action === 'approve') {
            // ── Update withdrawal ──
            await supabaseAdmin
                .from('affiliate_withdrawals')
                .update({
                    status: 'paid',
                    processed_at: new Date().toISOString(),
                    transfer_proof_url: transfer_proof_url || null,
                    admin_notes: admin_notes || null,
                })
                .eq('id', withdrawal_id);

            // ── Tandai komisi sebagai paid ──
            if (commissionIds.length > 0) {
                await supabaseAdmin
                    .from('affiliate_commissions')
                    .update({ status: 'paid', paid_at: new Date().toISOString() })
                    .in('id', commissionIds);
            }

            // ── WA ke affiliator ──
            sendWA(affiliate.phone,
                `✅ *Pencairan berhasil!*\n\n` +
                `Jumlah: ${formatRupiah(Number(withdrawal.amount))}\n` +
                `Rekening: ${withdrawal.bank_name} ${withdrawal.bank_account_number}\n\n` +
                `Silakan cek rekening kamu. Jika ada pertanyaan, hubungi kami. 🙏`
            );

        } else {
            // action === 'reject'
            if (!admin_notes) return NextResponse.json({ message: 'Alasan penolakan wajib diisi.' }, { status: 400 });

            // ── Update withdrawal ──
            await supabaseAdmin
                .from('affiliate_withdrawals')
                .update({
                    status: 'rejected',
                    admin_notes,
                    processed_at: new Date().toISOString(),
                })
                .eq('id', withdrawal_id);

            // ── Kembalikan komisi ke 'available' ──
            if (commissionIds.length > 0) {
                await supabaseAdmin
                    .from('affiliate_commissions')
                    .update({ status: 'available' })
                    .in('id', commissionIds);
            }

            // ── WA ke affiliator ──
            sendWA(affiliate.phone,
                `❌ *Request pencairan ditolak.*\n\n` +
                `Alasan: ${admin_notes}\n\n` +
                `Saldo kamu telah dikembalikan. Hubungi kami jika ada pertanyaan.`
            );
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('[SA Withdrawals] Error:', error);
        return NextResponse.json({ message: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
