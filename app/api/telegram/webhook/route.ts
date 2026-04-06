import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { canUseKasir } from '@/lib/billing-plans';
import { SERVICE_TYPES } from '@/lib/service-types';
import {
  formatReceiptDateTime,
  getTodayInTZ,
  dateRangeToUTC,
  getTimezoneLabel,
} from '@/lib/timezone';
import { 
  getSession, upsertSession, clearSession,
  addToCart, removeFromCart, 
  getCartTotal, formatCart,
  type BotContext, type CartItem
} from '@/lib/bot-session';
import crypto from 'crypto';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// ── Format harga IDR ──
const formatIDR = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
const formatRupiah = (n: number) => new Intl.NumberFormat('id-ID').format(n);

// Helpers untuk menghubungi Telegram API
async function sendTelegramMessage(chatId: string | number, text: string, replyMarkup?: any) {
    if (!BOT_TOKEN) return;
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML',
            reply_markup: replyMarkup
        })
    });
}

async function editTelegramMessage(chatId: string | number, messageId: number, text: string, replyMarkup?: any) {
    if (!BOT_TOKEN) return;
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: text,
            parse_mode: 'HTML',
            ...(replyMarkup ? { reply_markup: replyMarkup } : {})
        })
    });
}

async function sendChatAction(chatId: string | number, action: string = 'typing') {
    if (!BOT_TOKEN) return;
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action })
    });
}

async function answerCallbackQuery(callbackId: string, text?: string) {
    if (!BOT_TOKEN) return;
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackId, text })
    });
}

// ═══════════════════════════════════════════════════════════════
// Helper: Ambil layanan POS kasir dengan barber pricing
// ═══════════════════════════════════════════════════════════════
async function getPosServicesForBarber(tenantId: string, barberId: string) {
    const { data: posServices } = await supabaseAdmin
        .from('services')
        .select(`
            id, name, price, price_type, price_min, price_max, duration_minutes,
            service_barber_pricing!left(
                price_override, price_min_override,
                price_max_override, is_visible, sort_order
            )
        `)
        .eq('tenant_id', tenantId)
        .eq('service_type', SERVICE_TYPES.POS_KASIR)
        .eq('is_active', true)
        .eq('service_barber_pricing.barber_id', barberId)
        .order('name');

    if (!posServices || posServices.length === 0) return [];

    const hasConfig = posServices.some((s: any) =>
        s.service_barber_pricing && s.service_barber_pricing.length > 0
    );

    const displayServices = hasConfig
        ? posServices.filter((s: any) => {
            const config = s.service_barber_pricing?.[0];
            return config ? config.is_visible : true;
        })
        : posServices; 

    return displayServices.map((s: any) => {
        const config = s.service_barber_pricing?.[0];
        return {
            id: s.id,
            name: s.name,
            price: s.price,
            price_type: s.price_type || 'fixed',
            price_min: s.price_min,
            price_max: s.price_max,
            duration_minutes: s.duration_minutes,
            final_price: config?.price_override ?? s.price,
            final_price_min: config?.price_min_override ?? s.price_min,
            final_price_max: config?.price_max_override ?? s.price_max,
            sort_order: config?.sort_order ?? 0,
        };
    }).sort((a: any, b: any) => a.sort_order - b.sort_order);
}

// Menampilkan menu layanan (digunakan berulang)
async function showServicesMenu(chatId: string, messageId: number | null, tenantId: string, barber: any, tz: string) {
    const services = await getPosServicesForBarber(tenantId, barber.id);

    if (services.length === 0) {
        const msg = `Halo <b>${barber.name}</b>! 💈\n\nBelum ada layanan kasir yang tersedia.\nMinta Owner untuk menambahkan layanan tipe <b>${SERVICE_TYPES.POS_KASIR}</b> di menu Admin → Layanan.`;
        if (messageId) await editTelegramMessage(chatId, messageId, msg);
        else await sendTelegramMessage(chatId, msg);
        return;
    }

    const inline_keyboard = services.map((srv: any) => {
        let priceLabel: string;
        if (srv.price_type === 'range') {
            priceLabel = `${formatIDR(srv.final_price_min || 0)} – ${formatIDR(srv.final_price_max || 0)}`;
        } else if (srv.price_type === 'custom') {
            priceLabel = 'Harga Custom';
        } else {
            priceLabel = formatIDR(srv.final_price);
        }

        return [{
            text: `${srv.name} - ${priceLabel}`,
            callback_data: `pos_${srv.id}`
        }];
    });

    inline_keyboard.push([{ text: "❌ Batalkan", callback_data: "cancel_pos" }]);

    const text = `Halo <b>${barber.name}</b>! 💈\nPilih layanan yang baru saja Anda kerjakan untuk dicatat ke kasir:`;
    if (messageId) {
        await editTelegramMessage(chatId, messageId, text, { inline_keyboard });
    } else {
        await sendTelegramMessage(chatId, text, { inline_keyboard });
    }
}

// Helper untuk checkout ke database
async function finalizeTransaction(
    chatId: string, 
    messageId: number | null, 
    tenant: any, 
    barber: any, 
    sessionContext: BotContext, 
    paymentMethod: string, 
    kembalian: number = 0
) {
    const cart = sessionContext.cart || [];
    if (cart.length === 0) return;

    const groupId = crypto.randomUUID();
    
    // Insert bookings
    for (const item of cart) {
        await supabaseAdmin
            .from('bookings')
            .insert({
                tenant_id: tenant.id,
                barber_id: barber.id,
                service_id: item.service_id,
                service_type: SERVICE_TYPES.POS_KASIR,
                customer_id: sessionContext.customer_id || null,
                start_time: new Date().toISOString(),
                end_time: new Date(Date.now() + 30 * 60000).toISOString(),
                status: 'completed',
                final_price: item.price,
                payment_method: paymentMethod,
                booking_source: 'telegram_walk_in',
                booking_group_id: groupId
            });
    }

    // Update Customer visits CRM Level 3
    if (sessionContext.customer_id) {
        const { data: cust } = await supabaseAdmin.from('customers').select('total_visits').eq('id', sessionContext.customer_id).single();
        if (cust) {
            await supabaseAdmin.from('customers').update({
                total_visits: (cust.total_visits || 0) + 1,
                last_visit_at: new Date().toISOString()
            }).eq('id', sessionContext.customer_id);
        }
    }

    const tz = tenant.timezone ?? 'Asia/Jakarta';
    const total = getCartTotal(cart);
    let receiptMessage = `🧾 <b>TRANSAKSI TERSIMPAN</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n`;
    
    for (const item of cart) {
        receiptMessage += `${item.service_name.padEnd(20)} Rp ${formatRupiah(item.price)}${item.qty > 1 ? ` x${item.qty}` : ''}\n`;
    }
    
    receiptMessage += `━━━━━━━━━━━━━━━━━━━━\n` +
        `<b>TOTAL: Rp ${formatRupiah(total)}</b>\n` +
        `Metode: ${paymentMethod.toUpperCase()}\n`;
        
    if (paymentMethod === 'cash' && kembalian > 0) {
        receiptMessage += `Kembalian: Rp ${formatRupiah(kembalian)}\n`;
    }
    
    receiptMessage += `Waktu : ${formatReceiptDateTime(tz)}\n`;
    
    if (sessionContext.customer_name && sessionContext.customer_name !== 'Pelanggan Umum') {
        const { data: cData } = await supabaseAdmin.from('customers').select('total_visits').eq('id', sessionContext.customer_id).single();
        const visits = cData?.total_visits || 1;
        receiptMessage += `\n⭐ Terima kasih, ${sessionContext.customer_name}!\nKunjungan ke-${visits} kamu hari ini 🎉\n`;
    }

    receiptMessage += `━━━━━━━━━━━━━━━━━━━━\nTerima kasih! 💈`;

    const replyMarkup = {
        inline_keyboard: [[
            { text: '↩️ Batalkan Transaksi Ini', callback_data: `void_req_${groupId}` }
        ]]
    };

    if (messageId) {
        await editTelegramMessage(chatId, messageId, receiptMessage, replyMarkup);
    } else {
        await sendTelegramMessage(chatId, receiptMessage, replyMarkup);
    }

    await clearSession(chatId.toString(), tenant.id);
}

// Mock WA Gateway (Logging for Void Approval)
async function sendWhatsAppToOwner(tenantId: string, message: string) {
    console.log(`[WA_TO_OWNER_MOCK] Tenant: ${tenantId} | Message: ${message}`);
    // Untuk implementasi asli, panggil service pengiriman WA API di sini.
}

// ═══════════════════════════════════════════════════════════════
// POST — Main Webhook Handler
// ═══════════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
    const secretToken = request.headers.get('x-telegram-bot-api-secret-token');
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (expectedSecret && secretToken !== expectedSecret) {
        return NextResponse.json({ message: 'Unauthorized Webhook' }, { status: 401 });
    }

    try {
        const body = await request.json();

        // ─── CABANG 1: ADA PESAN TEKS MASUK ───
        if (body.message && body.message.text) {
            const chatId = body.message.chat.id.toString();
            const text = body.message.text.trim();
            const textLower = text.toLowerCase();

            await sendChatAction(chatId);

            if (textLower === '/daftar' || textLower === '/id') {
                const { data: existingBarber } = await supabaseAdmin.from('barbers').select('id, name, tenant_id').eq('telegram_chat_id', chatId).single();
                if (existingBarber) {
                    await sendTelegramMessage(chatId, `✅ <b>Kamu sudah terdaftar sebagai kapster aktif!</b>\n\nNama   : ${existingBarber.name}\nChat ID: <code>${chatId}</code>\n\nKetik /kasir untuk mulai.`);
                } else {
                    const chatIdPadded = ` ${chatId} `;
                    const boxWidth = chatIdPadded.length + 2;
                    const topBorder = '┌' + '─'.repeat(boxWidth) + '┐';
                    const bottomBorder = '└' + '─'.repeat(boxWidth) + '┘';
                    const middle = '│ ' + chatIdPadded + ' │';
                    await sendTelegramMessage(chatId, `👋 <b>Halo!</b> Berikut informasi akun Telegram kamu:\n\n📋 <b>Chat ID kamu:</b>\n<code>${topBorder}\n${middle}\n${bottomBorder}</code>\n\nKirimkan angka di atas ke Owner/Admin toko kamu.\nMinta mereka input di menu:\n<b>Admin → Kelola Barber → [nama kamu] → Hubungkan Telegram</b>\n\nSetelah terdaftar, ketik /kasir untuk mulai.`);
                }
                return NextResponse.json({ ok: true });
            }

            const { data: barber, error: barberError } = await supabaseAdmin.from('barbers').select('id, name, tenant_id').eq('telegram_chat_id', chatId).single();
            if (barberError || !barber) {
                await sendTelegramMessage(chatId, `❌ <b>Akses Ditolak</b>\n\nAkun Telegram kamu belum terhubung ke sistem kasir.\n\nKetik /daftar untuk melihat Chat ID kamu, lalu kirimkan angkanya ke Owner/Admin toko.`);
                return NextResponse.json({ ok: true });
            }

            const { data: tenantData } = await supabaseAdmin.from('tenants').select('id, plan, is_active, plan_expires_at, timezone').eq('id', barber.tenant_id).single();
            const tenant = tenantData as any;
            const tz = tenant?.timezone ?? 'Asia/Jakarta';

            if (!tenant || !canUseKasir(tenant.plan || 'trial')) {
                await sendTelegramMessage(chatId, `⚠️ <b>Fitur kasir tidak tersedia untuk plan ini.</b>\n\nToko kamu belum berlangganan paket yang mendukung fitur kasir.\nMinta Owner untuk upgrade ke plan <b>Pro</b> atau <b>Business</b>.`);
                return NextResponse.json({ ok: true });
            }

            // --- STATE MACHINE ---
            const session = await getSession(chatId, tenant.id);
            if (session) {
                const ctx = session.context as any;

                // 1. Awaiting Customer CRM input
                if (session.step === 'awaiting_customer') {
                    if (ctx.crm_action === 'search') {
                        const { data: customers } = await supabaseAdmin.from('customers').select('*').eq('tenant_id', tenant.id).or(`name.ilike.%${text}%,phone.ilike.%${text}%`).limit(5);
                        if (!customers || customers.length === 0) {
                            await sendTelegramMessage(chatId, `Pelanggan tidak ditemukan.`, {
                                reply_markup: { inline_keyboard: [
                                    [{ text: '➕ Daftarkan sebagai baru', callback_data: 'crm_new' }],
                                    [{ text: '⏭️ Lewati', callback_data: 'crm_skip' }]
                                ]}
                            });
                        } else {
                            const inline_keyboard = customers.map(c => ([{
                                text: `${c.name} (${c.phone || '-'}) — ${c.total_visits} kunjungan`,
                                callback_data: `crm_pick_${c.id}`
                            }]));
                            inline_keyboard.push([{ text: '➕ Bukan yang ini, daftarkan baru', callback_data: 'crm_new' }]);
                            inline_keyboard.push([{ text: '⏭️ Lewati', callback_data: 'crm_skip' }]);
                            await sendTelegramMessage(chatId, `Hasil pencarian:`, { inline_keyboard });
                        }
                    } else if (ctx.crm_action === 'new_name') {
                        await upsertSession(chatId, tenant.id, barber.id, 'awaiting_customer', { ...ctx, crm_action: 'new_phone', new_customer_name: text });
                        await sendTelegramMessage(chatId, `Siap. Ketik nomor HP pelanggan (atau ketik "skip" jika tidak ada):`);
                    } else if (ctx.crm_action === 'new_phone') {
                        const phone = textLower === 'skip' ? null : text;
                        const { data: newCustomer, error } = await supabaseAdmin.from('customers').insert({
                            tenant_id: tenant.id,
                            name: ctx.new_customer_name,
                            phone: phone
                        }).select().single();

                        if (error && error.code === '23505') { // unique violation
                            await sendTelegramMessage(chatId, `⚠️ Nomor HP sudah terdaftar. Silakan gunakan pencarian atau nomer lain.`);
                            await upsertSession(chatId, tenant.id, barber.id, 'awaiting_customer', { ...ctx, crm_action: 'new_name' });
                            return NextResponse.json({ ok: true });
                        }

                        if (newCustomer) {
                            await upsertSession(chatId, tenant.id, barber.id, 'idle', { ...ctx, customer_id: newCustomer.id, customer_name: newCustomer.name, crm_action: undefined, new_customer_name: undefined });
                            await sendTelegramMessage(chatId, `✅ Pelanggan *${newCustomer.name}* sukses didaftarkan.`);
                            await showServicesMenu(chatId, null, tenant.id, barber, tz);
                        }
                    }
                    return NextResponse.json({ ok: true });
                }

                // 2. Awaiting Price Input (Custom nominal)
                if (session.step === 'awaiting_price' && ctx.awaiting_free_input) {
                    const amount = parseInt(text.replace(/\D/g, ''), 10);
                    if (isNaN(amount) || amount <= 0) {
                        await sendTelegramMessage(chatId, `⚠️ Masukkan angka yang valid.`);
                        return NextResponse.json({ ok: true });
                    }
                    if (ctx.price_type === 'range' && (amount < ctx.price_min || amount > ctx.price_max)) {
                        await sendTelegramMessage(chatId, `⚠️ Nominal tidak valid. Harus antara Rp ${formatIDR(ctx.price_min)} – Rp ${formatIDR(ctx.price_max)}.\n\nCoba lagi:`);
                        return NextResponse.json({ ok: true });
                    }
                    // Valid! Add to cart.
                    const cart = addToCart(ctx.cart || [], { service_id: ctx.service_id, service_name: ctx.service_name, price: amount });
                    await upsertSession(chatId, tenant.id, barber.id, 'idle', { ...ctx, cart, awaiting_free_input: false, price_type: undefined, price_min: undefined, price_max: undefined, service_id: undefined, service_name: undefined });
                    const cartText = formatCart(cart, tz);
                    await sendTelegramMessage(chatId, `✅ *${ctx.service_name}* ditambahkan\n\n🛒 *Keranjang saat ini:*\n${cartText}\n\nTambah layanan lain?`, {
                        reply_markup: { inline_keyboard: [
                            [{ text: '➕ Tambah Layanan', callback_data: 'cart_add_more' }, { text: '✅ Bayar Sekarang', callback_data: 'cart_checkout' }],
                            [{ text: '🗑️ Kosongkan Keranjang', callback_data: 'cart_clear' }]
                        ]}
                    });
                    return NextResponse.json({ ok: true });
                }

                // 3. Awaiting Cash Payment Nominal
                if (session.step === 'awaiting_payment' && ctx.payment_method === 'cash' && ctx.awaiting_cash_input) {
                    let kembalian = 0;
                    if (textLower === 'pas') {
                        kembalian = 0;
                    } else {
                        const bayar = parseInt(text.replace(/\D/g, ''));
                        if (isNaN(bayar) || bayar < ctx.total_price) {
                            await sendTelegramMessage(chatId, `⚠️ Nominal tidak valid atau kurang dari total.\nTotal: Rp ${ctx.total_price.toLocaleString('id-ID')}\nCoba lagi:`);
                            return NextResponse.json({ ok: true });
                        }
                        kembalian = bayar - ctx.total_price;
                    }
                    await finalizeTransaction(chatId, null, tenant, barber, ctx, 'cash', kembalian);
                    return NextResponse.json({ ok: true });
                }
            }

            // ── COMMAND /start atau /kasir ──
            if (textLower === '/start' || textLower === '/kasir') {
                // Hapus sesi lama, mulai baru
                await clearSession(chatId, tenant.id);
                await sendTelegramMessage(chatId, `💈 *Transaksi Baru*\n\nSiapa pelanggannya? (opsional)`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔍 Cari Pelanggan Lama', callback_data: 'crm_search' }],
                            [{ text: '➕ Daftarkan Pelanggan Baru', callback_data: 'crm_new' }],
                            [{ text: '⏭️ Lewati (Pelanggan Umum)', callback_data: 'crm_skip' }],
                        ]
                    }
                });
            } else if (textLower === '/laporan') {
                const todayLocal = getTodayInTZ(tz);
                const { start: startUTC, end: endUTC } = dateRangeToUTC(todayLocal, tz);

                const { data: todayBookings } = await supabaseAdmin
                    .from('bookings')
                    .select('final_price, services(price)')
                    .eq('tenant_id', tenant.id)
                    .eq('barber_id', barber.id)
                    .in('booking_source', ['pos_kasir', 'telegram_walk_in'])
                    .eq('status', 'completed')
                    .gte('created_at', startUTC)
                    .lte('created_at', endUTC);

                const count = todayBookings?.length || 0;
                const total = todayBookings?.reduce((sum, b: any) => sum + (b.final_price ?? b.services?.price ?? 0), 0) || 0;

                await sendTelegramMessage(chatId,
                    `📊 <b>Laporan Shift Anda Hari Ini</b>\n` +
                    `📅 ${todayLocal} (${getTimezoneLabel(tz)})\n\n` +
                    `Total Kepala: ${count} Pelanggan\n` +
                    `Omset Kasir Walk-In: Rp ${formatRupiah(total)}\n\n` +
                    `<i>Kerja bagus, ${barber.name}!</i>`
                );
            } else {
                await sendTelegramMessage(chatId, `Perintah tidak dikenali.\n\nPerintah yang tersedia:\n/kasir — Buka mesin kasir\n/laporan — Lihat rekap hari ini\n/daftar — Lihat Chat ID kamu`);
            }
            return NextResponse.json({ ok: true });
        }

        // ─── CABANG 2: ADA PENCETAN TOMBOL MASUK (Callback Query) ───
        if (body.callback_query) {
            const callbackId = body.callback_query.id;
            const data = body.callback_query.data;
            const chatId = body.callback_query.message.chat.id.toString();
            const messageId = body.callback_query.message.message_id;

            const { data: barber } = await supabaseAdmin.from('barbers').select('id, name, tenant_id').eq('telegram_chat_id', chatId).single();
            if (!barber) {
                await editTelegramMessage(chatId, messageId, "Akses ditolak. Anda tidak terdaftar.");
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }

            const { data: tenantData } = await supabaseAdmin.from('tenants').select('id, plan, is_active, plan_expires_at, timezone').eq('id', barber.tenant_id).single();
            const tenant = tenantData as any;
            if (!tenant) {
                await answerCallbackQuery(callbackId, "Toko tidak ditemukan.");
                return NextResponse.json({ ok: true });
            }
            const tz = tenant.timezone ?? 'Asia/Jakarta';

            const session = await getSession(chatId, tenant.id);
            const ctx = session?.context as any || {};

            // CANCEL VOID
            if (data === 'cancel_pos') {
                await clearSession(chatId, tenant.id);
                await editTelegramMessage(chatId, messageId, "❌ Proses kasir dibatalkan.");
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }

            // —————————— CRM CUSTOMER FLOW ——————————
            if (data === 'crm_skip') {
                await upsertSession(chatId, tenant.id, barber.id, 'idle', { ...ctx, customer_id: null, customer_name: 'Pelanggan Umum' });
                await showServicesMenu(chatId, messageId, tenant.id, barber, tz);
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }
            if (data === 'crm_search') {
                await upsertSession(chatId, tenant.id, barber.id, 'awaiting_customer', { ...ctx, crm_action: 'search' });
                await editTelegramMessage(chatId, messageId, `Silakan ketik nama atau nomor HP pelanggan:`);
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }
            if (data === 'crm_new') {
                await upsertSession(chatId, tenant.id, barber.id, 'awaiting_customer', { ...ctx, crm_action: 'new_name' });
                await editTelegramMessage(chatId, messageId, `Silakan ketik nama lengkap pelanggan baru:`);
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }
            if (data.startsWith('crm_pick_')) {
                const custId = data.replace('crm_pick_', '');
                const { data: cust } = await supabaseAdmin.from('customers').select('id, name').eq('id', custId).single();
                if (cust) {
                    await upsertSession(chatId, tenant.id, barber.id, 'idle', { ...ctx, customer_id: cust.id, customer_name: cust.name, crm_action: undefined });
                    await showServicesMenu(chatId, messageId, tenant.id, barber, tz);
                }
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }

            // —————————— SERVICE PICK FLOW ——————————
            if (data.startsWith('pos_')) {
                const serviceId = data.replace('pos_', '');
                const services = await getPosServicesForBarber(barber.tenant_id, barber.id);
                const svc = services.find((s: any) => s.id === serviceId);

                if (!svc) {
                    await answerCallbackQuery(callbackId, "Layanan tidak ditemukan.");
                    return NextResponse.json({ ok: true });
                }

                if (svc.price_type === 'range') {
                    const midPrice = Math.round((svc.final_price_min! + svc.final_price_max!) / 2 / 1000) * 1000;
                    await upsertSession(chatId, tenant.id, barber.id, 'awaiting_price', {
                        ...ctx, service_id: svc.id, service_name: svc.name,
                        price_min: svc.final_price_min, price_max: svc.final_price_max, price_type: 'range'
                    });
                    await editTelegramMessage(chatId, messageId, `💈 *${svc.name}*\nRentang harga: Rp ${svc.final_price_min!.toLocaleString('id-ID')} – Rp ${svc.final_price_max!.toLocaleString('id-ID')}\n\nPilih nominal:`, {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: `Rp ${svc.final_price_min!.toLocaleString('id-ID')} (Min)`, callback_data: `price_pick_${svc.id}_${svc.final_price_min}` }],
                                [{ text: `Rp ${midPrice.toLocaleString('id-ID')} (Tengah)`, callback_data: `price_pick_${svc.id}_${midPrice}` }],
                                [{ text: `Rp ${svc.final_price_max!.toLocaleString('id-ID')} (Maks)`, callback_data: `price_pick_${svc.id}_${svc.final_price_max}` }],
                                [{ text: '✏️ Nominal Lain', callback_data: `price_custom_${svc.id}` }],
                                [{ text: "❌ Batalkan", callback_data: `cart_clear` }]
                            ]
                        }
                    });
                } else if (svc.price_type === 'custom') {
                    await upsertSession(chatId, tenant.id, barber.id, 'awaiting_price', {
                        ...ctx, service_id: svc.id, service_name: svc.name, price_type: 'custom', awaiting_free_input: true
                    });
                    await editTelegramMessage(chatId, messageId, `✏️ <b>${svc.name}</b>\n\nKetik nominal harga untuk transaksi ini.\n_(Contoh: 50000)_`);
                } else {
                    // Fixed price: directly add to cart
                    const cart = addToCart(ctx.cart || [], { service_id: svc.id, service_name: svc.name, price: svc.final_price });
                    await upsertSession(chatId, tenant.id, barber.id, 'idle', { ...ctx, cart });
                    
                    const cartText = formatCart(cart, tz);
                    await editTelegramMessage(chatId, messageId, `✅ *${svc.name}* ditambahkan\n\n🛒 *Keranjang saat ini:*\n${cartText}\n\nTambah layanan lain?`, {
                        reply_markup: { inline_keyboard: [
                            [{ text: '➕ Tambah Layanan', callback_data: 'cart_add_more' }, { text: '✅ Bayar Sekarang', callback_data: 'cart_checkout' }],
                            [{ text: '🗑️ Kosongkan Keranjang', callback_data: 'cart_clear' }]
                        ]}
                    });
                }
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }

            if (data.startsWith('price_pick_')) {
                const parts = data.replace('price_pick_', '').split('_');
                const serviceId = parts[0];
                const amount = parseInt(parts[1], 10);
                
                const cart = addToCart(ctx.cart || [], { service_id: ctx.service_id || serviceId, service_name: ctx.service_name || 'Layanan', price: amount });
                await upsertSession(chatId, tenant.id, barber.id, 'idle', { ...ctx, cart, awaiting_free_input: false, price_type: undefined, price_min: undefined, price_max: undefined, service_id: undefined, service_name: undefined });
                
                const cartText = formatCart(cart, tz);
                await editTelegramMessage(chatId, messageId, `✅ *${ctx.service_name || 'Layanan'}* ditambahkan\n\n🛒 *Keranjang saat ini:*\n${cartText}\n\nTambah layanan lain?`, {
                    reply_markup: { inline_keyboard: [
                        [{ text: '➕ Tambah Layanan', callback_data: 'cart_add_more' }, { text: '✅ Bayar Sekarang', callback_data: 'cart_checkout' }],
                        [{ text: '🗑️ Kosongkan Keranjang', callback_data: 'cart_clear' }]
                    ]}
                });
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }

            if (data.startsWith('price_custom_')) {
                await upsertSession(chatId, tenant.id, barber.id, 'awaiting_price', { ...ctx, awaiting_free_input: true });
                await editTelegramMessage(chatId, messageId, `✏️ Ketik nominal untuk *${ctx.service_name}*\n(Min: Rp ${formatIDR(ctx.price_min)} | Maks: Rp ${formatIDR(ctx.price_max)})\nContoh: 75000`);
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }

            // —————————— CART FLOW ——————————
            if (data === 'cart_add_more') {
                await showServicesMenu(chatId, messageId, tenant.id, barber, tz);
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }
            if (data === 'cart_clear') {
                await clearSession(chatId, tenant.id);
                await editTelegramMessage(chatId, messageId, "🗑️ Keranjang dikosongkan. Ketuk /kasir untuk mulai lagi.");
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }
            if (data === 'cart_checkout') {
                const total = getCartTotal(ctx.cart || []);
                await upsertSession(chatId, tenant.id, barber.id, 'awaiting_payment', { ...ctx, total_price: total });
                await editTelegramMessage(chatId, messageId, `💰 *Total: Rp ${total.toLocaleString('id-ID')}*\n\nPilih metode pembayaran:`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '💵 Cash', callback_data: `pay_cash_${session?.id}` }, { text: '📱 QRIS', callback_data: `pay_qris_${session?.id}` }],
                            [{ text: '🏦 Transfer', callback_data: `pay_transfer_${session?.id}` }]
                        ]
                    }
                });
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }

            // —————————— PAYMENT FLOW ——————————
            if (data.startsWith('pay_')) {
                const pMethod = data.replace('pay_', '').split('_')[0]; // cash, qris, transfer
                
                if (pMethod === 'cash') {
                    await upsertSession(chatId, tenant.id, barber.id, 'awaiting_payment', { ...ctx, payment_method: 'cash', awaiting_cash_input: true });
                    await editTelegramMessage(chatId, messageId, `💵 *Pembayaran Cash*\n\nTotal: Rp ${(ctx.total_price || 0).toLocaleString('id-ID')}\n\nPelanggan bayar berapa?\n_(Ketik nominal, contoh: 50000)_\n_(Atau ketik "pas" jika uang pas)_`);
                } else {
                    await finalizeTransaction(chatId, messageId, tenant, barber, ctx, pMethod);
                }
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }

            // —————————— VOID FLOW ——————————
            if (data.startsWith('void_req_')) {
                const groupId = data.replace('void_req_', '');
                
                const { data: bookings } = await supabaseAdmin.from('bookings').select('id, created_at, final_price, status').eq('booking_group_id', groupId).eq('tenant_id', tenant.id);
                if (!bookings || bookings.length === 0) {
                    await answerCallbackQuery(callbackId, '❌ Transaksi tidak ditemukan');
                    return NextResponse.json({ ok: true });
                }
                if (bookings.some((b: any) => b.status === 'cancelled')) {
                    await answerCallbackQuery(callbackId, '⚠️ Transaksi ini sudah pernah dibatalkan');
                    return NextResponse.json({ ok: true });
                }

                const createdAt = new Date(bookings[0].created_at);
                const ageMinutes = (Date.now() - createdAt.getTime()) / (1000 * 60);

                if (ageMinutes <= 5) {
                    await supabaseAdmin.from('bookings').update({ status: 'cancelled' }).eq('booking_group_id', groupId).eq('tenant_id', tenant.id);
                    await supabaseAdmin.from('booking_voids').insert({ booking_id: bookings[0].id, tenant_id: tenant.id, requested_by: barber.id, status: 'auto_approved', reason: 'Dibatalkan oleh barber dalam 5 menit' });
                    
                    await editTelegramMessage(chatId, messageId, `✅ *Transaksi berhasil dibatalkan*\n\nSemua ${bookings.length} layanan dalam sesi ini telah dibatalkan otomatis.\nKetuk /kasir untuk transaksi baru.`);
                } else {
                    await supabaseAdmin.from('booking_voids').insert({ booking_id: bookings[0].id, tenant_id: tenant.id, requested_by: barber.id, status: 'pending' });
                    const totalVoid = bookings.reduce((sum: number, b: any) => sum + (b.final_price ?? 0), 0);
                    
                    await sendWhatsAppToOwner(tenant.id, `⚠️ *Permintaan Batalkan Transaksi*\n\nBarber meminta pembatalan transaksi:\nTotal: Rp ${totalVoid.toLocaleString('id-ID')}\nWaktu: ${formatReceiptDateTime(tz)}\n\nBuka Admin Panel untuk menyetujui atau menolak.`);
                    await editTelegramMessage(chatId, messageId, `⏳ *Permintaan Dikirim ke Owner*\n\nTransaksi ini sudah lebih dari 5 menit.\nPermintaan pembatalan telah dikirim ke Owner.\n\nKamu akan mendapat notifikasi setelah Owner menyetujui atau menolaknya.`);
                }
                
                await answerCallbackQuery(callbackId, 'Permintaan void diproses');
                return NextResponse.json({ ok: true });
            }

            await answerCallbackQuery(callbackId);
            return NextResponse.json({ ok: true });
        }

        return NextResponse.json({ message: 'No action taken' });
    } catch (err: any) {
        console.error('Telegram Webhook Payload Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
