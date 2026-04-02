import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getPlanById, getPlanDurationDays, isAnnualPlan } from '@/lib/billing-plans';
import { calculateCommission, getCommissionAvailableDate, formatRupiah } from '@/lib/affiliate';
import crypto from 'crypto';

/**
 * Midtrans Webhook Handler
 * Midtrans mengirimkan HTTP POST ke endpoint ini setiap kali status transaksi berubah.
 * Wajib dapat diakses publik (no auth header) — keamanan dilakukan via signature verification.
 *
 * Midtrans Dashboard → Settings → Configuration → Payment Notification URL:
 * Set ke: https://[domain-utama]/api/billing/webhook
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

        // ─── 1. Verifikasi Signature Midtrans ────────────────────────────────────
        // SHA512(order_id + status_code + gross_amount + server_key)
        const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
        const expectedSignature = crypto
            .createHash('sha512')
            .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
            .digest('hex');

        if (signature_key !== expectedSignature) {
            console.warn('[Billing Webhook] Invalid signature for order:', order_id);
            return NextResponse.json({ message: 'Invalid signature' }, { status: 403 });
        }

        // ─── 2. Cari Transaksi ───────────────────────────────────────────────────
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
        const planId   = transaction.plan;
        const plan     = getPlanById(planId);
        const annual   = isAnnualPlan(planId);

        // ─── 3. Proses Status Midtrans ───────────────────────────────────────────
        const isSuccess =
            transaction_status === 'settlement' ||
            (transaction_status === 'capture' && fraud_status === 'accept');

        const isExpiredOrCancel = ['expire', 'cancel', 'deny'].includes(transaction_status);
        const isFailed = transaction_status === 'failure';

        if (isSuccess && plan) {
            const now = new Date();

            // Hitung masa aktif dari lib/billing-plans.ts (30 hari / 365 hari)
            const durationDays = getPlanDurationDays(planId);
            const periodEnd    = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

            console.log(
                `[Billing Webhook] ✅ Payment success | order=${order_id} | plan=${planId} | ` +
                `billing=${plan.billing_cycle} | tenant=${tenantId} | expires=${periodEnd.toISOString()}`
            );

            // ── 3a. Update subscription_transactions ──────────────────────────────
            const { error: txUpdateError } = await supabaseAdmin
                .from('subscription_transactions')
                .update({
                    status: 'paid',
                    paid_at: now.toISOString(),
                    period_start: now.toISOString(),
                    period_end: periodEnd.toISOString(),
                    // Isi original_amount hanya jika belum ada (backward compat)
                    ...(transaction.original_amount == null && {
                        original_amount: Math.round(Number(gross_amount))
                    })
                })
                .eq('id', transaction.id);

            if (txUpdateError) {
                console.error('[Billing Webhook] ❌ Failed to update transaction:', txUpdateError);
                return NextResponse.json({ message: 'Failed to update transaction' }, { status: 500 });
            }

            // ── 3b. Update tenants — WAJIB .eq('id', tenantId) ───────────────────
            const tenantUpdate: Record<string, any> = {
                plan: planId,
                billing_cycle: plan.billing_cycle,
                plan_expires_at: periodEnd.toISOString(),
                is_active: true,
                // Isi jatah revisi custom subdomain dari billing-plans.ts
                // Paket bulanan → 0, paket tahunan → sesuai plan
                subdomain_revisions_remaining: plan.subdomain_revisions,
            };

            // Set max_barbers & max_bookings_per_month (999 = "unlimited" praktis)
            tenantUpdate.max_barbers = plan.max_barbers >= 999999 ? 999 : plan.max_barbers;
            tenantUpdate.max_bookings_per_month = plan.max_bookings_per_month >= 999999
                ? 99999
                : plan.max_bookings_per_month;

            const { error: tenantUpdateError } = await supabaseAdmin
                .from('tenants')
                .update(tenantUpdate)
                .eq('id', tenantId);   // ← WAJIB

            if (tenantUpdateError) {
                console.error('[Billing Webhook] ❌ Failed to update tenant:', tenantUpdateError);
                // Rollback transaksi agar bisa dicoba ulang oleh Midtrans
                await supabaseAdmin
                    .from('subscription_transactions')
                    .update({ status: 'pending' })
                    .eq('id', transaction.id);
                return NextResponse.json({ message: 'Failed to update tenant plan' }, { status: 500 });
            }

            console.log(`[Billing Webhook] ✅ Tenant ${tenantId} → plan=${planId}, expires=${periodEnd.toISOString()}`);

            // === AFFILIATE COMMISSION ===
            // Skip komisi jika plan adalah 'trial'
            if (planId !== 'trial') {
                const { data: referral } = await supabaseAdmin
                    .from('affiliate_referrals')
                    .select(`
                        id, affiliate_id, status,
                        affiliates (
                            id, name, phone, commission_rate, commission_type, status,
                            total_paid_referrals
                        )
                    `)
                    .eq('tenant_id', tenantId)
                    .single();

                const affiliate = Array.isArray(referral?.affiliates) 
                    ? referral.affiliates[0] 
                    : referral?.affiliates;

                if (referral && affiliate?.status === 'active') {
                    const isFirstPayment = referral.status === 'registered';
                    
                    const shouldCreateCommission =
                        affiliate.commission_type === 'recurring' ||
                        (affiliate.commission_type === 'one-time' && isFirstPayment);

                    if (shouldCreateCommission) {
                        // Midtrans sering mengirim gross_amount sebagai sting dengan trailing nol (".00")
                        const transactionAmount = Math.round(Number(gross_amount));

                        const commissionAmount = calculateCommission(
                            transactionAmount,
                            affiliate.commission_rate
                        );
                        const availableAt = getCommissionAvailableDate();

                        const { error: commissionError } = await supabaseAdmin
                            .from('affiliate_commissions')
                            .insert({
                                affiliate_id: affiliate.id,
                                referral_id: referral.id,
                                transaction_id: transaction.id,
                                tenant_id: tenantId,
                                amount: commissionAmount,
                                commission_rate: affiliate.commission_rate,
                                transaction_amount: transactionAmount,
                                type: 'subscription',
                                status: 'pending',
                                available_at: availableAt.toISOString()
                            });

                        if (commissionError) {
                            console.error('[Billing Webhook] ❌ Failed to insert commission:', commissionError);
                            // Kegagalan tidak memblokir aktivasi Tenant, tapi menghentikan alur penguncian Referral.
                        } else {
                            if (isFirstPayment) {
                                await supabaseAdmin
                                    .from('affiliate_referrals')
                                    .update({ status: 'converted', first_paid_at: now.toISOString() })
                                    .eq('id', referral.id);

                                await supabaseAdmin
                                    .from('affiliates')
                                    .update({ total_paid_referrals: affiliate.total_paid_referrals + 1 })
                                    .eq('id', affiliate.id);
                            }

                            // Kirim WA notifikasi ke affiliator
                            if (process.env.WHATSAPP_SERVICE_URL && process.env.WHATSAPP_SERVICE_SECRET) {
                                const baseUrl = process.env.WHATSAPP_SERVICE_URL.startsWith('http') 
                                    ? process.env.WHATSAPP_SERVICE_URL 
                                    : `https://${process.env.WHATSAPP_SERVICE_URL}`;
                                
                                const planName = plan?.name ?? planId;
                                await fetch(`${baseUrl}/send-message`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': process.env.WHATSAPP_SERVICE_SECRET!
                                    },
                                    body: JSON.stringify({
                                        phoneNumber: affiliate.phone,
                                        message: `💰 *Komisi baru!*\n\nPaket: ${planName}\nTransaksi: ${formatRupiah(transactionAmount)}\nKomisi (${affiliate.commission_rate}%): ${formatRupiah(commissionAmount)}\n\nBisa dicairkan: ${availableAt.toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'})}`
                                    })
                                }).catch(err => console.error('[Billing Webhook] WA send error for affiliate:', err));
                            }
                        }
                    }
                }
            }
            // === END AFFILIATE COMMISSION ===

            // ── 3c. Kirim WA konfirmasi ke owner (non-blocking) ────────────────────
            const shopName      = transaction.tenants?.shop_name || 'Toko Anda';
            const periodEndStr  = periodEnd.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
            const amountFormatted = `Rp ${transaction.amount.toLocaleString('id-ID')}`;

            let waMessage: string;

            if (!annual) {
                // Pesan untuk paket BULANAN
                waMessage =
                    `✅ *Pembayaran Berhasil!*\n\n` +
                    `Paket: *${plan.name}*\n` +
                    `Aktif hingga: *${periodEndStr}*\n` +
                    `Total: *${amountFormatted}*\n\n` +
                    `Terima kasih! 🙏`;
            } else {
                // Pesan untuk paket TAHUNAN — tampilkan penghematan
                // transaction.original_amount menyimpan harga asli tahunan sebelum diskon
                const originalAmount = transaction.original_amount ?? plan.original_annual_price ?? transaction.amount;
                const savedAmount    = (originalAmount - transaction.amount).toLocaleString('id-ID');
                const subdomainNote  = plan.custom_subdomain
                    ? `\n\n💡 *Custom Subdomain Aktif!*\nKamu bisa mengatur subdomain toko di:\nPanel Admin → Pengaturan → Subdomain`
                    : '';

                waMessage =
                    `✅ *Pembayaran Berhasil!*\n\n` +
                    `🎉 Selamat berlangganan paket tahunan!\n\n` +
                    `Paket: *${plan.name}*\n` +
                    `Diskon: *${plan.discount_percent}%*\n` +
                    `Total dibayar: *${amountFormatted}*\n` +
                    `Hemat: *Rp ${savedAmount}*\n` +
                    `Aktif hingga: *${periodEndStr}*` +
                    subdomainNote;
            }

            // Non-blocking — error tidak gagalkan response ke Midtrans
            sendWhatsApp(transaction, waMessage).catch((err) =>
                console.error('[Billing Webhook] WA send error:', err)
            );

        } else if (isExpiredOrCancel || isFailed) {
            const newStatus = isExpiredOrCancel ? 'expired' : 'failed';

            await supabaseAdmin
                .from('subscription_transactions')
                .update({ status: newStatus })
                .eq('id', transaction.id);

            if (isExpiredOrCancel) {
                const shopName = transaction.tenants?.shop_name || 'Toko Anda';
                sendWhatsApp(
                    transaction,
                    `⚠️ *Pembayaran Kedaluwarsa*\n\n` +
                    `Pembayaran perpanjangan langganan *${shopName}* telah kedaluwarsa.\n\n` +
                    `Silakan lakukan pembayaran kembali dari Panel Admin untuk menjaga toko Anda tetap aktif.`
                ).catch(() => {});
            }

            console.log(`[Billing Webhook] ⚠️ Order ${order_id} → ${newStatus}`);
        } else {
            // Status pending/authorize/dll — tunggu notifikasi berikutnya dari Midtrans
            console.log(`[Billing Webhook] ℹ️ Ignoring status=${transaction_status} for order=${order_id}`);
        }

        // Selalu return 200 OK ke Midtrans agar tidak di-retry terus
        return NextResponse.json({ status: 'ok' });

    } catch (error: any) {
        console.error('[Billing Webhook] Error:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

// ─── Helper: Kirim pesan WhatsApp ke owner tenant ────────────────────────────
async function sendWhatsApp(transaction: any, message: string): Promise<void> {
    if (!transaction.tenants?.owner_user_id) return;

    const { data: owner } = await supabaseAdmin
        .from('users')
        .select('phone_number')
        .eq('id', transaction.tenants.owner_user_id)
        .single();

    if (!owner?.phone_number) return;

    const waUrl    = process.env.WHATSAPP_SERVICE_URL;
    const waSecret = process.env.WHATSAPP_SERVICE_SECRET;
    if (!waUrl || !waSecret) return;

    const baseUrl = waUrl.startsWith('http') ? waUrl : `https://${waUrl}`;

    await fetch(`${baseUrl}/send-message`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': waSecret,
        },
        body: JSON.stringify({ phoneNumber: owner.phone_number, message }),
    });
}
