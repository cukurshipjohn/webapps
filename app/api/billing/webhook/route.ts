import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getPlan } from '@/lib/billing-plans';
import crypto from 'crypto';

/**
 * Midtrans Webhook Handler
 * Midtrans mengirimkan HTTP POST ke endpoint ini setiap kali status transaksi berubah.
 * Wajib dapat diakses publik (no auth header) — keamanan dilakukan via signature verification.
 * 
 * Di Midtrans Dashboard → Settings → Configuration → Payment Notification URL:
 * Set ke: https://[slug].cukurship.id/api/billing/webhook
 * atau: https://[domain-utama]/api/billing/webhook
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            order_id,
            status_code,
            gross_amount,
            signature_key,
            transaction_status,
            fraud_status,
        } = body;

        // ─── 1. VERIFIKASI SIGNATURE ────────────────────────────────
        // Signature: SHA512(order_id + status_code + gross_amount + server_key)
        const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
        const expectedSignature = crypto
            .createHash('sha512')
            .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
            .digest('hex');

        if (signature_key !== expectedSignature) {
            console.warn('[Billing Webhook] Invalid signature for order:', order_id);
            return NextResponse.json({ message: 'Invalid signature' }, { status: 403 });
        }

        // ─── 2. CARI TRANSAKSI ────────────────────────────────────────
        const { data: transaction, error: txError } = await supabaseAdmin
            .from('subscription_transactions')
            .select('*, tenants(id, slug, shop_name, owner_user_id)')
            .eq('midtrans_order_id', order_id)
            .single();

        if (txError || !transaction) {
            console.warn('[Billing Webhook] Transaction not found:', order_id);
            return NextResponse.json({ message: 'Transaction not found' }, { status: 404 });
        }

        const tenantId = transaction.tenant_id;
        const planKey = transaction.plan;
        const plan = getPlan(planKey);

        // ─── 3. PROSES STATUS ────────────────────────────────────────
        const isSuccess = (transaction_status === 'settlement') ||
            (transaction_status === 'capture' && fraud_status === 'accept');

        const isExpiredOrCancel = ['expire', 'cancel', 'deny'].includes(transaction_status);
        const isFailed = transaction_status === 'failure';

        if (isSuccess && plan) {
            const now = new Date();
            const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 hari

            console.log(`[Billing Webhook] ✅ Payment success for order ${order_id}, plan=${planKey}, tenant=${tenantId}`);

            // Update transaksi
            const { error: txUpdateError } = await supabaseAdmin
                .from('subscription_transactions')
                .update({
                    status: 'paid',
                    paid_at: now.toISOString(),
                    period_start: now.toISOString(),
                    period_end: periodEnd.toISOString(),
                })
                .eq('id', transaction.id);

            if (txUpdateError) {
                console.error('[Billing Webhook] ❌ Failed to update transaction:', txUpdateError);
                return NextResponse.json({ message: 'Failed to update transaction' }, { status: 500 });
            }

            // Update tenant plan — gunakan only columns yang pasti ada
            const tenantUpdate: Record<string, any> = {
                plan: planKey,
                plan_expires_at: periodEnd.toISOString(),
                is_active: true,
            };

            // max_barbers dan max_bookings_per_month sudah ada dari migration_08
            // Hindari meng-update 9999 karena beberapa plan pakai nilai batas yang sangat besar
            if (plan.max_barbers !== 9999) {
                tenantUpdate.max_barbers = plan.max_barbers;
            } else {
                tenantUpdate.max_barbers = 999; // praktis "unlimited" tanpa overflow
            }

            if (plan.max_bookings_per_month !== 9999) {
                tenantUpdate.max_bookings_per_month = plan.max_bookings_per_month;
            } else {
                tenantUpdate.max_bookings_per_month = 99999;
            }

            const { error: tenantUpdateError } = await supabaseAdmin
                .from('tenants')
                .update(tenantUpdate)
                .eq('id', tenantId);

            if (tenantUpdateError) {
                console.error('[Billing Webhook] ❌ Failed to update tenant:', tenantUpdateError);
                // Kembalikan transaksi ke status awal agar bisa dicoba ulang
                await supabaseAdmin
                    .from('subscription_transactions')
                    .update({ status: 'pending' })
                    .eq('id', transaction.id);
                return NextResponse.json({ message: 'Failed to update tenant plan' }, { status: 500 });
            }

            console.log(`[Billing Webhook] ✅ Tenant ${tenantId} updated to plan=${planKey}, expires=${periodEnd.toISOString()}`);

            // Kirim WA konfirmasi ke owner (non-blocking – error tidak gagalkan response)
            sendWhatsApp(transaction, `✅ *Pembayaran Berhasil!*\n\nHalo! Langganan *${plan.name}* untuk toko *${transaction.tenants?.shop_name}* sudah aktif.\n\n📅 Aktif hingga: *${periodEnd.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}*\n\nTerima kasih sudah memilih CukurShip! ✂️`);

        } else if (isExpiredOrCancel || isFailed) {
            const newStatus = isExpiredOrCancel ? 'expired' : 'failed';

            await supabaseAdmin
                .from('subscription_transactions')
                .update({ status: newStatus })
                .eq('id', transaction.id);

            if (isExpiredOrCancel) {
                sendWhatsApp(transaction, `⚠️ *Pembayaran Kedaluwarsa*\n\nPembayaran perpanjangan langganan *${transaction.tenants?.shop_name}* telah kedaluwarsa.\n\nSilakan lakukan pembayaran kembali dari Panel Admin untuk menjaga toko Anda tetap aktif.`);
            }

            console.log(`[Billing Webhook] ⚠️ Transaction ${order_id} marked as ${newStatus}`);
        } else {
            // Status lain (pending, authorize, dll) — tidak lakukan apa-apa, tunggu notif berikutnya
            console.log(`[Billing Webhook] ℹ️ Ignoring status=${transaction_status} for order=${order_id}`);
        }

        return NextResponse.json({ status: 'ok' });

    } catch (error: any) {
        console.error('[Billing Webhook] Error:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

async function sendWhatsApp(transaction: any, message: string) {
    try {
        if (!transaction.tenants?.owner_user_id) return;

        const { data: owner } = await supabaseAdmin
            .from('users')
            .select('phone_number')
            .eq('id', transaction.tenants.owner_user_id)
            .single();

        if (!owner?.phone_number) return;

        let waUrl = process.env.WHATSAPP_SERVICE_URL;
        const waSecret = process.env.WHATSAPP_SERVICE_SECRET;
        if (!waUrl || !waSecret) return;
        if (!waUrl.startsWith('http')) waUrl = `https://${waUrl}`;

        await fetch(`${waUrl}/send-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-secret': waSecret },
            body: JSON.stringify({ phoneNumber: owner.phone_number, message }),
        });
    } catch (err) {
        console.error('[Billing Webhook] WA send error:', err);
    }
}
