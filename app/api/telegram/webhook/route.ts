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

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// ── Format harga IDR ──
const formatIDR = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
const formatRupiah = (n: number) => new Intl.NumberFormat('id-ID').format(n);

// Helper Resolusi Harga Transaksi
function resolveTransactionPrice(
  service: any,
  priceOverride: number | null,
  userInputPrice: number | null
): number {
  if (userInputPrice !== null && userInputPrice > 0) return userInputPrice;
  if (priceOverride !== null && priceOverride > 0) return priceOverride;
  return service.price || 0;
}

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

    // Fallback logic — jika belum ada config sama sekali, tampilkan semua
    const hasConfig = posServices.some((s: any) =>
        s.service_barber_pricing && s.service_barber_pricing.length > 0
    );

    const displayServices = hasConfig
        ? posServices.filter((s: any) => {
            const config = s.service_barber_pricing?.[0];
            return config ? config.is_visible : true; // default visible
        })
        : posServices; // fallback: tampilkan semua jika belum dikonfigurasi

    // Hitung final price per service
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

// ═══════════════════════════════════════════════════════════════
// POST — Main Webhook Handler
// ═══════════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
    // 1. Verifikasi Keamanan (Secret Token Webhook)
    const secretToken = request.headers.get('x-telegram-bot-api-secret-token');
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (expectedSecret && secretToken !== expectedSecret) {
        return NextResponse.json({ message: 'Unauthorized Webhook' }, { status: 401 });
    }

    try {
        const body = await request.json();

        // ─── CABANG 1: ADA PESAN TEKS MASUK (misal: /start, /kasir, /daftar) ───
        if (body.message && body.message.text) {
            const chatId = body.message.chat.id.toString();
            const text = body.message.text.trim().toLowerCase();
            const username = body.message.from?.username || null;

            await sendChatAction(chatId);

            // ── COMMAND /daftar dan /id: Bisa dipakai SIAPA SAJA (terdaftar atau belum) ──
            if (text === '/daftar' || text === '/id') {
                const { data: existingBarber } = await supabaseAdmin
                    .from('barbers')
                    .select('id, name, tenant_id')
                    .eq('telegram_chat_id', chatId)
                    .single();

                if (existingBarber) {
                    // Sudah terdaftar → konfirmasi
                    await sendTelegramMessage(chatId,
                        `✅ <b>Kamu sudah terdaftar sebagai kapster aktif!</b>\n\n` +
                        `Nama   : ${existingBarber.name}\n` +
                        `Chat ID: <code>${chatId}</code>\n\n` +
                        `Ketik /kasir untuk mulai mencatat transaksi.`
                    );
                } else {
                    // Belum terdaftar → tampilkan Chat ID dalam kotak ASCII
                    const chatIdPadded = ` ${chatId} `;
                    const boxWidth = chatIdPadded.length + 2;
                    const topBorder = '┌' + '─'.repeat(boxWidth) + '┐';
                    const bottomBorder = '└' + '─'.repeat(boxWidth) + '┘';
                    const middle = '│ ' + chatIdPadded + ' │';

                    await sendTelegramMessage(chatId,
                        `👋 <b>Halo!</b> Berikut informasi akun Telegram kamu:\n\n` +
                        `📋 <b>Chat ID kamu:</b>\n` +
                        `<code>${topBorder}\n${middle}\n${bottomBorder}</code>\n\n` +
                        `Kirimkan angka di atas ke Owner/Admin toko kamu.\n` +
                        `Minta mereka input di menu:\n` +
                        `<b>Admin → Kelola Barber → [nama kamu] → Hubungkan Telegram</b>\n\n` +
                        `Setelah terdaftar, ketik /kasir untuk mulai.`
                    );
                }
                return NextResponse.json({ ok: true });
            }

            // ── Untuk command selain /daftar, wajib terdaftar ──
            const { data: barber, error: barberError } = await supabaseAdmin
                .from('barbers')
                .select('id, name, tenant_id')
                .eq('telegram_chat_id', chatId)
                .single();

            if (barberError || !barber) {
                // Kapster belum terdaftar
                await sendTelegramMessage(chatId,
                    `❌ <b>Akses Ditolak</b>\n\n` +
                    `Akun Telegram kamu belum terhubung ke sistem kasir.\n\n` +
                    `Ketik /daftar untuk melihat Chat ID kamu, lalu kirimkan angkanya ke Owner/Admin toko.`
                );
                return NextResponse.json({ ok: true });
            }

            // ══════════════════════════════════════════════════
            // GUARD: Plan Check — pastikan tenant punya akses kasir
            // ══════════════════════════════════════════════════
            const { data: tenant } = await supabaseAdmin
                .from('tenants')
                .select('plan, is_active, plan_expires_at, timezone')
                .eq('id', barber.tenant_id)
                .single();

            // Timezone tenant — default WIB jika belum diset
            const tz = tenant?.timezone ?? 'Asia/Jakarta';

            if (!tenant || !canUseKasir(tenant.plan || 'trial')) {
                await sendTelegramMessage(chatId,
                    `⚠️ <b>Fitur kasir tidak tersedia untuk plan ini.</b>\n\n` +
                    `Toko kamu belum berlangganan paket yang mendukung fitur kasir.\n` +
                    `Minta Owner untuk upgrade ke plan <b>Pro</b> atau <b>Business</b> untuk menggunakan kasir Telegram.`
                );
                return NextResponse.json({ ok: true });
            }

            // ── Handle input angka untuk price_type = 'range' atau 'custom' (dari session) ──
            const replyTo = body.message.reply_to_message;
            if (/^\d+$/.test(text) && replyTo && replyTo.text?.includes('#SVC_')) {
                const matchRange = replyTo.text.match(/#SVC_([a-zA-Z0-9-]+)_(\d+)_(\d+)/);
                const matchCustom = replyTo.text.match(/#SVC_([a-zA-Z0-9-]+)_CUSTOM/);
                
                if (matchRange || matchCustom) {
                    const serviceId = matchRange ? matchRange[1] : matchCustom![1];
                    const amount = parseInt(text, 10);
                    
                    if (matchRange) {
                        const pMin = parseInt(matchRange[2], 10);
                        const pMax = parseInt(matchRange[3], 10);

                        if (amount < pMin || amount > pMax) {
                            await sendTelegramMessage(chatId, `⚠️ Nominal tidak valid. Harus antara Rp ${formatIDR(pMin).replace('Rp', '').trim()} – Rp ${formatIDR(pMax).replace('Rp', '').trim()}.\n\nSilakan ulangi /kasir atau balas pesan ini kembali dengan angka yang benar.`, { force_reply: true });
                            return NextResponse.json({ ok: true });
                        }
                    }

                    // Ambil layanan untuk konfirmasi
                    const { data: service } = await supabaseAdmin
                        .from('services')
                        .select('name')
                        .eq('id', serviceId)
                        .single();

                    if (!service) {
                        await sendTelegramMessage(chatId, "❌ Layanan tidak ditemukan.");
                        return NextResponse.json({ ok: true });
                    }

                    // Tampilkan konfirmasi BAGIAN 3
                    const confirmMessage = `✅ <b>KONFIRMASI TRANSAKSI</b>\n\n` +
                        `👤 Pelanggan: Umum\n` +
                        `💈 Barber: ${barber?.name || 'Kapster'}\n` +
                        `📋 Layanan: ${service.name}\n` +
                        `💰 Harga: Rp ${formatRupiah(amount)}\n` +
                        `💳 Bayar: Cash\n\n` +
                        `[✅ Simpan Transaksi] atau [❌ Batal] ?`;

                    const inline_keyboard = [
                        [{ text: "✅ Simpan Transaksi", callback_data: `pos_insert_${serviceId}_${amount}` }],
                        [{ text: "❌ Batalkan", callback_data: `cancel_pos` }]
                    ];

                    await sendTelegramMessage(chatId, confirmMessage, { inline_keyboard });
                    return NextResponse.json({ ok: true });
                }
            }

            // Jika Kapster TERDAFTAR + Plan OK
            if (text === '/start' || text === '/kasir') {
                // Tarik daftar layanan POS kasir dengan barber pricing
                const services = await getPosServicesForBarber(barber.tenant_id, barber.id);

                if (services.length === 0) {
                    await sendTelegramMessage(chatId,
                        `Halo <b>${barber.name}</b>! 💈\n\n` +
                        `Belum ada layanan kasir yang tersedia.\n` +
                        `Minta Owner untuk menambahkan layanan tipe <b>${SERVICE_TYPES.POS_KASIR}</b> di menu Admin → Layanan.`
                    );
                    return NextResponse.json({ ok: true });
                }

                // Bangun Inline Keyboard dengan final price
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

                // Tambah tombol batal
                inline_keyboard.push([{ text: "❌ Batalkan", callback_data: "cancel_pos" }]);

                await sendTelegramMessage(chatId,
                    `Halo <b>${barber.name}</b>! 💈\nPilih layanan yang baru saja Anda kerjakan untuk dicatat ke kasir:`,
                    { inline_keyboard }
                );
            } else if (text === '/laporan') {
                // Tarik rekap shift hari ini dalam timezone tenant
                const todayLocal = getTodayInTZ(tz)
                const { start: startUTC, end: endUTC } = dateRangeToUTC(todayLocal, tz)

                const { data: todayBookings } = await supabaseAdmin
                    .from('bookings')
                    .select('final_price, services(price)')
                    .eq('barber_id', barber.id)
                    .eq('booking_source', 'pos_kasir')
                    .gte('created_at', startUTC)
                    .lte('created_at', endUTC);

                const count = todayBookings?.length || 0;
                const total = todayBookings?.reduce((sum, b: any) => sum + (b.final_price ?? b.services?.price ?? 0), 0) || 0;

                await sendTelegramMessage(chatId,
                    `📊 <b>Laporan Shift Anda Hari Ini</b>\n` +
                    `📅 ${todayLocal} (${getTimezoneLabel(tz)})\n\n` +
                    `Total Kepala: ${count} Pelanggan\n` +
                    `Omset Kasir Walk-In: ${formatIDR(total)}\n\n` +
                    `<i>Kerja bagus, ${barber.name}!</i>`
                );
            } else {
                // Perintah tidak dikenal
                await sendTelegramMessage(chatId,
                    `Perintah tidak dikenali.\n\nPerintah yang tersedia:\n` +
                    `/kasir — Buka mesin kasir\n` +
                    `/laporan — Lihat rekap hari ini\n` +
                    `/daftar — Lihat Chat ID kamu`
                );
            }
            return NextResponse.json({ ok: true });
        }

        // ─── CABANG 2: ADA PENCETAN TOMBOL MASUK (Callback Query / POS Kasir) ───
        if (body.callback_query) {
            const callbackId = body.callback_query.id;
            const data = body.callback_query.data; // e.g., pos_12345 or range_12345_50000
            const chatId = body.callback_query.message.chat.id.toString();
            const messageId = body.callback_query.message.message_id;

            // Auth Barber
            const { data: barber } = await supabaseAdmin
                .from('barbers')
                .select('id, name, tenant_id')
                .eq('telegram_chat_id', chatId)
                .single();

            if (!barber) {
                await editTelegramMessage(chatId, messageId, "Akses ditolak. Anda tidak terdaftar.");
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }

            // ── Cancel ──
            if (data === 'cancel_pos') {
                await editTelegramMessage(chatId, messageId, "❌ Proses kasir dibatalkan.");
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }

            // ── Konfirmasi range price: range_confirm_{serviceId}_{price} ──
            if (data.startsWith('range_confirm_')) {
                const parts = data.replace('range_confirm_', '').split('_');
                const serviceId = parts[0];
                const finalPrice = parseInt(parts[1], 10);

                const { data: service } = await supabaseAdmin
                    .from('services')
                    .select('id, name, duration_minutes')
                    .eq('id', serviceId)
                    .single();

                if (!service) {
                    await editTelegramMessage(chatId, messageId, "Layanan tidak ditemukan.");
                    await answerCallbackQuery(callbackId);
                    return NextResponse.json({ ok: true });
                }

                // Tampilkan konfirmasi BAGIAN 3
                const confirmMessage = `✅ <b>KONFIRMASI TRANSAKSI</b>\n\n` +
                    `👤 Pelanggan: Umum\n` +
                    `💈 Barber: ${barber.name}\n` +
                    `📋 Layanan: ${service.name}\n` +
                    `💰 Harga: Rp ${formatRupiah(finalPrice)}\n` +
                    `💳 Bayar: Cash\n\n` +
                    `[✅ Simpan Transaksi] atau [❌ Batal] ?`;

                const inline_keyboard = [
                    [{ text: "✅ Simpan Transaksi", callback_data: `pos_insert_${serviceId}_${finalPrice}` }],
                    [{ text: "❌ Batalkan", callback_data: `cancel_pos` }]
                ];

                await editTelegramMessage(chatId, messageId, confirmMessage, { inline_keyboard });
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }

            // ── EKSEKUSI INSERT TRANSAKSI KASIR (FIXED & RANGE & CUSTOM) ──
            if (data.startsWith('pos_insert_')) {
                const parts = data.replace('pos_insert_', '').split('_');
                const serviceId = parts[0];
                const resolvedPrice = parseInt(parts[1], 10);

                const { data: service } = await supabaseAdmin
                    .from('services')
                    .select('id, name, duration_minutes')
                    .eq('id', serviceId)
                    .single();

                if (!service) {
                    await editTelegramMessage(chatId, messageId, "Layanan tidak ditemukan.");
                    await answerCallbackQuery(callbackId);
                    return NextResponse.json({ ok: true });
                }

                // Insert booking with custom price
                const startTime = new Date();
                const endTime = new Date(startTime.getTime() + ((service.duration_minutes || 30) * 60000));

                const { error: insertError } = await supabaseAdmin
                    .from('bookings')
                    .insert({
                        tenant_id: barber.tenant_id,
                        barber_id: barber.id,
                        service_id: service.id,
                        service_type: SERVICE_TYPES.POS_KASIR,
                        start_time: startTime.toISOString(),
                        end_time: endTime.toISOString(),
                        status: 'completed',
                        booking_source: 'pos_kasir',
                        payment_status: 'paid_cash',
                        final_price: resolvedPrice,
                        payment_method: 'cash'
                    });

                if (insertError) {
                    await editTelegramMessage(chatId, messageId, `❌ Gagal menyimpan: ${insertError.message}`);
                } else {
                    // Ambil timezone tenant untuk struk
                    const { data: tenantForReceipt } = await supabaseAdmin
                        .from('tenants')
                        .select('timezone')
                        .eq('id', barber.tenant_id)
                        .single();
                    const receiptTz = tenantForReceipt?.timezone ?? 'Asia/Jakarta';
                    const waktu = formatReceiptDateTime(receiptTz);

                    const receiptMessage = `🧾 <b>TRANSAKSI TERSIMPAN</b>\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `${service.name.padEnd(20)} Rp ${formatRupiah(resolvedPrice)}\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `<b>TOTAL: Rp ${formatRupiah(resolvedPrice)}</b>\n` +
                        `Metode: Cash\n` +
                        `Waktu : ${waktu}\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `Terima kasih! 💈`;
                        
                    await editTelegramMessage(chatId, messageId, receiptMessage);
                }
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }

            // ── Range cancel ──
            if (data.startsWith('range_cancel_')) {
                await editTelegramMessage(chatId, messageId, "❌ Proses kasir dibatalkan.");
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }

            // ── Input manual range price: price_custom_{serviceId}_{min}_{max} ──
            if (data.startsWith('price_custom_')) {
                const parts = data.replace('price_custom_', '').split('_');
                const serviceId = parts[0];
                const pMin = parseInt(parts[1], 10);
                const pMax = parseInt(parts[2], 10);

                const { data: service } = await supabaseAdmin
                    .from('services')
                    .select('name')
                    .eq('id', serviceId)
                    .single();

                if (!service) {
                    await editTelegramMessage(chatId, messageId, "Layanan tidak ditemukan.");
                    await answerCallbackQuery(callbackId);
                    return NextResponse.json({ ok: true });
                }

                await editTelegramMessage(chatId, messageId, `✏️ Menyiapkan input manual untuk <b>${service.name}</b>...`);
                await sendTelegramMessage(chatId,
                    `✏️ <b>${service.name}</b>\n\n` +
                    `Ketik nominal harga untuk transaksi ini (antara ${formatIDR(pMin)} – ${formatIDR(pMax)}).\n` +
                    `\n<i>ℹ️ Balas (reply) pesan ini dengan mengetik angka saja, tanpa titik. Contoh: ${pMin}</i>\n` +
                    `\n#SVC_${serviceId}_${pMin}_${pMax}`,
                    { force_reply: true }
                );
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }

            // ── Pilih nominal range price: range_pick_{serviceId} ──
            if (data.startsWith('range_pick_')) {
                const serviceId = data.replace('range_pick_', '');

                // Get service with barber pricing
                const services = await getPosServicesForBarber(barber.tenant_id, barber.id);
                const svc = services.find((s: any) => s.id === serviceId);

                if (!svc) {
                    await editTelegramMessage(chatId, messageId, "Layanan tidak ditemukan.");
                    await answerCallbackQuery(callbackId);
                    return NextResponse.json({ ok: true });
                }

                const pMin = svc.final_price_min || 0;
                const pMax = svc.final_price_max || 0;

                // Generate quick-pick buttons: min, mid, max, and Lainnya
                const mid = Math.round((pMin + pMax) / 2 / 1000) * 1000;

                const inline_keyboard = [
                    [{ text: `${formatIDR(pMin)} (Min)`, callback_data: `range_confirm_${serviceId}_${pMin}` }],
                    ...(mid > pMin && mid < pMax ? [[{ text: `${formatIDR(mid)} (Tengah)`, callback_data: `range_confirm_${serviceId}_${mid}` }]] : []),
                    [{ text: `${formatIDR(pMax)} (Maks)`, callback_data: `range_confirm_${serviceId}_${pMax}` }],
                    [{ text: '✏️ Nominal Lain', callback_data: `price_custom_${serviceId}_${pMin}_${pMax}` }],
                    [{ text: "❌ Batalkan", callback_data: `range_cancel_${serviceId}` }]
                ];

                await editTelegramMessage(chatId, messageId,
                    `✏️ <b>${svc.name}</b>\n\n` +
                    `Kisaran harga: ${formatIDR(pMin)} – ${formatIDR(pMax)}\n\n` +
                    `Pilih nominal untuk pelanggan ini:`,
                    { inline_keyboard }
                );
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }

            // ── Pilih layanan utama: pos_{serviceId} ──
            if (data.startsWith('pos_')) {
                const serviceId = data.replace('pos_', '');

                // Ambil service dengan barber pricing
                const services = await getPosServicesForBarber(barber.tenant_id, barber.id);
                const svc = services.find((s: any) => s.id === serviceId);

                if (!svc) {
                    await editTelegramMessage(chatId, messageId, "Layanan tidak ditemukan.");
                    await answerCallbackQuery(callbackId);
                    return NextResponse.json({ ok: true });
                }

                // ── Handle price_type = 'range' → tampilkan pilihan nominal ──
                if (svc.price_type === 'range') {
                    const pMin = svc.final_price_min || 0;
                    const pMax = svc.final_price_max || 0;

                    // Generate quick-pick buttons: min, mid, max, and Lainnya
                    const mid = Math.round((pMin + pMax) / 2 / 1000) * 1000;

                    const inline_keyboard = [
                        [{ text: `${formatIDR(pMin)} (Min)`, callback_data: `range_confirm_${serviceId}_${pMin}` }],
                        ...(mid > pMin && mid < pMax ? [[{ text: `${formatIDR(mid)} (Tengah)`, callback_data: `range_confirm_${serviceId}_${mid}` }]] : []),
                        [{ text: `${formatIDR(pMax)} (Maks)`, callback_data: `range_confirm_${serviceId}_${pMax}` }],
                        [{ text: '✏️ Nominal Lain', callback_data: `price_custom_${serviceId}_${pMin}_${pMax}` }],
                        [{ text: "❌ Batalkan", callback_data: `range_cancel_${serviceId}` }]
                    ];

                    await editTelegramMessage(chatId, messageId,
                        `✏️ <b>${svc.name}</b>\n\n` +
                        `Kisaran harga: ${formatIDR(pMin)} – ${formatIDR(pMax)}\n\n` +
                        `Pilih nominal untuk pelanggan ini:`,
                        { inline_keyboard }
                    );
                    await answerCallbackQuery(callbackId);
                    return NextResponse.json({ ok: true });
                }

                // ── Handle price_type = 'custom' → wajib input manual ──
                if (svc.price_type === 'custom') {
                    await editTelegramMessage(chatId, messageId, `✏️ Menyiapkan input harga untuk <b>${svc.name}</b>...`);
                    await sendTelegramMessage(chatId,
                        `✏️ <b>${svc.name}</b>\n\n` +
                        `Ketik nominal harga untuk transaksi ini.\n` +
                        `\n<i>ℹ️ Balas (reply) pesan ini dengan mengetik angka saja, tanpa titik. Contoh: 50000</i>\n` +
                        `\n#SVC_${serviceId}_CUSTOM`,
                        { force_reply: true }
                    );
                    await answerCallbackQuery(callbackId);
                    return NextResponse.json({ ok: true });
                }

                // ── Handle price_type = 'fixed' (default) → tampilkan konfirmasi ──
                const resolvedPrice = resolveTransactionPrice(svc, svc.final_price, null);

                const confirmMessage = `✅ <b>KONFIRMASI TRANSAKSI</b>\n\n` +
                    `👤 Pelanggan: Umum\n` +
                    `💈 Barber: ${barber.name}\n` +
                    `📋 Layanan: ${svc.name}\n` +
                    `💰 Harga: Rp ${formatRupiah(resolvedPrice)}\n` +
                    `💳 Bayar: Cash\n\n` +
                    `[✅ Simpan Transaksi] atau [❌ Batal] ?`;

                const inline_keyboard = [
                    [{ text: "✅ Simpan Transaksi", callback_data: `pos_insert_${svc.id}_${resolvedPrice}` }],
                    [{ text: "❌ Batalkan", callback_data: `cancel_pos` }]
                ];

                await editTelegramMessage(chatId, messageId, confirmMessage, { inline_keyboard });
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
