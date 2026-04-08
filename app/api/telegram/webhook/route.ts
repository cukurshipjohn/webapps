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
import {
  isRateLimited,
  looksLikeOrder,
  parseOrderFromText,
  type NLPResult
} from '@/lib/nlp-kasir';
import crypto from 'crypto';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// ── Format harga IDR ──
const formatIDR = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
const formatRupiah = (n: number) => new Intl.NumberFormat('id-ID').format(n);

// Helpers untuk menghubungi Telegram API
async function sendTelegramMessage(chatId: string | number, text: string, replyMarkup?: any) {
    if (!BOT_TOKEN) return;
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const resolvedMarkup = replyMarkup?.reply_markup ? replyMarkup.reply_markup : replyMarkup;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML',
            ...(resolvedMarkup ? { reply_markup: resolvedMarkup } : {})
        })
    });
}

async function editTelegramMessage(chatId: string | number, messageId: number, text: string, replyMarkup?: any) {
    if (!BOT_TOKEN) return;
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`;
    const resolvedMarkup = replyMarkup?.reply_markup ? replyMarkup.reply_markup : replyMarkup;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: text,
            parse_mode: 'HTML',
            ...(resolvedMarkup ? { reply_markup: resolvedMarkup } : {})
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

async function showBarberList(
    chatId: string,
    messageId: number | null,
    tenantId: string,
    senderBarberId: string,
    session: any,
    timezone: string
) {
    const { data: barbers } = await supabaseAdmin
        .from('barbers')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .eq('role', 'barber')
        .order('name', { ascending: true });

    if (!barbers || barbers.length === 0) {
        const msg = `⚠️ Tidak ada barber aktif saat ini.\nMinta Owner untuk mengaktifkan barber terlebih dahulu.`;
        if (messageId) await editTelegramMessage(chatId, messageId, msg);
        else await sendTelegramMessage(chatId, msg);
        await clearSession(chatId, tenantId);
        return;
    }

    const buttons = barbers.map(b => [{
        text: `✂️ ${b.name}`,
        callback_data: `barber_pick_${b.id}`
    }]);

    const text = `👤 Pelanggan: <b>${session.context.customer_name}</b>\n\n✂️ <b>Pilih Barber yang Mengerjakan:</b>`;
    if (messageId) {
        await editTelegramMessage(chatId, messageId, text, { reply_markup: { inline_keyboard: buttons } });
    } else {
        await sendTelegramMessage(chatId, text, { reply_markup: { inline_keyboard: buttons } });
    }
}

// STEP 3 - Fungsi daftar layanan
async function showServiceList(
    chatId: string,
    messageId: number | null,
    tenantId: string,
    barberId: string,
    session: any,
    timezone: string
) {
    const services = await getPosServicesForBarber(tenantId, barberId);

    if (!services || services.length === 0) {
        const msg = `⚠️ Belum ada layanan yang tersedia.\nMinta Owner untuk menambahkan layanan kasir.`;
        if (messageId) await editTelegramMessage(chatId, messageId, msg);
        else await sendTelegramMessage(chatId, msg);
        await clearSession(chatId, tenantId);
        return;
    }

    const cart = session.context.cart ?? [];
    const cartText = cart.length > 0
        ? `\n\n🛒 <b>Keranjang:</b>\n${formatCart(cart, timezone)}`
        : '';

    const buttons = services.slice(0, 16).map((svc: any) => {
        let priceLabel = 'Harga Custom';
        if (svc.price_type === 'fixed') {
            priceLabel = `Rp ${formatRupiah(svc.final_price || 0)}`;
        } else if (svc.price_type === 'range') {
            priceLabel = `Rp ${formatRupiah(svc.final_price_min || 0)}–${formatRupiah(svc.final_price_max || 0)}`;
        }

        return {
            text: `${svc.name} (${priceLabel})`,
            callback_data: `svc_pick_${svc.id}`
        };
    });

    const keyboard = buttons.map((btn: any) => [btn]);

    const text = `💇 <b>Pilih Layanan</b>\nPelanggan: <b>${session.context.customer_name}</b>${cartText}`;
    
    if (messageId) {
        await editTelegramMessage(chatId, messageId, text, { reply_markup: { inline_keyboard: keyboard } });
    } else {
        await sendTelegramMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });
    }
}

// STEP 5 - Fungsi add more
async function askAddMore(
    chatId: string,
    messageId: number | null,
    timezone: string,
    cart: CartItem[],
    customerName: string
) {
    const cartText = formatCart(cart, timezone);
    const itemCount = cart.reduce((sum, c) => sum + c.qty, 0);

    const text = `✅ <b>Layanan ditambahkan!</b>\n\n👤 Pelanggan: <b>${customerName}</b>\n🛒 <b>Keranjang (${itemCount} item):</b>\n${cartText}\n\nTambah layanan lain?`;
    
    const inline_keyboard = [
        [
            { text: '➕ Iya, Tambah Lagi', callback_data: 'cart_add_more' },
            { text: '✅ Tidak, Lanjut Bayar', callback_data: 'cart_checkout' }
        ],
        [
            { text: '🗑️ Hapus / Edit Item', callback_data: 'cart_edit_list' }
        ]
    ];

    if (messageId) {
        await editTelegramMessage(chatId, messageId, text, { reply_markup: { inline_keyboard } });
    } else {
        await sendTelegramMessage(chatId, text, { reply_markup: { inline_keyboard } });
    }
}

// Mock WA Gateway (Logging for Void Approval)
async function sendWhatsAppToOwner(tenantId: string, message: string) {
    console.log(`[WA_TO_OWNER_MOCK] Tenant: ${tenantId} | Message: ${message}`);
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

        // ─── CABANG 1: TEKS MASUK ───
        if (body.message && body.message.text) {
            const chatId = body.message.chat.id.toString();
            const text = body.message.text.trim();
            const textLower = text.toLowerCase();

            await sendChatAction(chatId);

            if (textLower === '/daftar' || textLower === '/id') {
                const { data: existingBarber } = await supabaseAdmin.from('barbers').select('id, name, tenant_id').eq('telegram_chat_id', chatId).single();
                if (existingBarber) {
                    await sendTelegramMessage(chatId, `✅ <b>Kamu sudah terdaftar!</b>\n\nNama   : ${existingBarber.name}\nChat ID: <code>${chatId}</code>\n\nKetik /kasir untuk mulai.`);
                } else {
                    await sendTelegramMessage(chatId, `👋 <b>Halo!</b> Berikut informasi akun Telegram kamu:\n\n📋 <b>Chat ID kamu:</b>\n<code>${chatId}</code>\n\nKirimkan angka di atas ke Owner/Admin toko kamu.\nMinta mereka input di menu:\n<b>Admin → Kelola Barber → [nama kamu] → Hubungkan Telegram</b>\n\nSetelah terdaftar, ketik /kasir untuk mulai.`);
                }
                return NextResponse.json({ ok: true });
            }

            const { data: barber } = await supabaseAdmin.from('barbers').select('id, name, tenant_id').eq('telegram_chat_id', chatId).single();
            if (!barber) {
                await sendTelegramMessage(chatId, `❌ <b>Akses Ditolak</b>\n\nAkun Telegram kamu belum terhubung ke sistem kasir.\nKetik /daftar untuk melihat Chat ID kamu.`);
                return NextResponse.json({ ok: true });
            }

            const { data: tenantData, error: tenantError } = await supabaseAdmin.from('tenants').select('id, shop_name, plan, timezone, is_centralized_cashier, is_nlp_enabled').eq('id', barber.tenant_id).single();
            if (tenantError) {
                console.error('[TELEGRAM WEBHOOK ERROR] Error fetching tenant:', tenantError);
            }
            const tenant = tenantData as any;
            const tz = tenant?.timezone ?? 'Asia/Jakarta';
            const isCentralized = tenant?.is_centralized_cashier ?? false;

            if (!tenant || !canUseKasir(tenant.plan || 'trial')) {
                await sendTelegramMessage(chatId, `⚠️ <b>Fitur kasir tidak tersedia.</b>\nCek paket berlangganan toko kamu.`);
                return NextResponse.json({ ok: true });
            }

            // --- STATE MACHINE TEXT ---
            const session = await getSession(chatId, tenant.id);

            if (session) {
                const ctx = session.context as any;

                // STEP 2A - Input nama pelanggan
                if (session.step === 'awaiting_customer') {
                    // Jika user mengetik command di tengah sesi awaiting_customer, abaikan — biarkan command handler di bawah yang menangani
                    if (textLower.startsWith('/')) {
                        // jatuh ke blok command handler di bawah
                    } else {
                    const customerName = text;
                    if (customerName.length < 2) {
                        await sendTelegramMessage(chatId, `⚠️ Nama terlalu pendek. Ketik minimal 2 huruf:`);
                        return NextResponse.json({ ok: true });
                    }
                    if (customerName.length > 50) {
                        await sendTelegramMessage(chatId, `⚠️ Nama terlalu panjang. Maksimal 50 karakter:`);
                        return NextResponse.json({ ok: true });
                    }
                    
                    await upsertSession(chatId, tenant.id, barber.id, 'idle', {
                        ...ctx,
                        customer_name: customerName,
                        customer_id: null,
                        selected_barber_id: isCentralized ? undefined : barber.id
                    });
                    
                    const freshSession = await getSession(chatId, tenant.id);
                    if (!freshSession) {
                        await sendTelegramMessage(chatId, '❌ Gagal menyimpan sesi. Coba /kasir lagi.');
                        return NextResponse.json({ ok: true });
                    }

                    if (isCentralized) {
                        await showBarberList(chatId, null, tenant.id, barber.id, freshSession, tz);
                    } else {
                        await showServiceList(chatId, null, tenant.id, barber.id, freshSession, tz);
                    }
                    return NextResponse.json({ ok: true });
                    } // end else (non-command input)
                }

                // STEP 4B - Input harga custom / range
                if (session.step === 'awaiting_price') {
                    const price = parseInt(text.replace(/\D/g, ''), 10);
                    if (isNaN(price) || price <= 0) {
                        await sendTelegramMessage(chatId, `⚠️ Nominal tidak valid. Ketik angka saja\n_(contoh: 75000)_:`);
                        return NextResponse.json({ ok: true });
                    }

                    if (ctx.pending_service?.price_type === 'range') {
                        const { price_min, price_max } = ctx.pending_service;
                        if (price < price_min || price > price_max) {
                            await sendTelegramMessage(chatId, `⚠️ Nominal harus antara Rp ${formatRupiah(price_min)} – Rp ${formatRupiah(price_max)}\nCoba lagi:`);
                            return NextResponse.json({ ok: true });
                        }
                    }

                    const updatedCart = addToCart(ctx.cart ?? [], {
                        service_id: ctx.pending_service.service_id,
                        service_name: ctx.pending_service.service_name,
                        price
                    });

                    await upsertSession(chatId, tenant.id, barber.id, 'idle', {
                        ...ctx,
                        cart: updatedCart,
                        pending_service: undefined
                    });

                    await askAddMore(chatId, null, tz, updatedCart, ctx.customer_name);
                    return NextResponse.json({ ok: true });
                }
            }

            // COMMAND /kasir
            if (textLower === '/start' || textLower === '/kasir') {
                await clearSession(chatId, tenant.id);
                await upsertSession(chatId, tenant.id, barber.id, 'awaiting_customer', { cart: [] });
                
                await sendTelegramMessage(chatId, `💈 <b>Transaksi Baru</b>\n\nKetik nama pelanggan,\natau pilih tombol di bawah:`, {
                    reply_markup: {
                        inline_keyboard: [[ { text: '👤 Tanpa Nama', callback_data: 'customer_skip' } ]]
                    }
                });
            } else if (textLower === '/laporan') {
                const todayLocal = getTodayInTZ(tz);
                const { start: startUTC, end: endUTC } = dateRangeToUTC(todayLocal, tz);

                const { data: todayBookings } = await supabaseAdmin
                    .from('bookings')
                    .select('final_price')
                    .eq('tenant_id', tenant.id)
                    .eq('barber_id', barber.id)
                    .in('booking_source', ['telegram_walk_in', 'pos_kasir'])
                    .eq('status', 'completed')
                    .gte('created_at', startUTC)
                    .lte('created_at', endUTC);

                const count = todayBookings?.length || 0;
                const total = todayBookings?.reduce((sum, b: any) => sum + (b.final_price ?? 0), 0) || 0;

                await sendTelegramMessage(chatId, `📊 <b>Laporan Shift Anda Hari Ini</b>\n📅 ${todayLocal} (${getTimezoneLabel(tz)})\n\nTotal Kepala: ${count} Pelanggan\nOmset: Rp ${formatRupiah(total)}`);
            } else {
                if (!session || session.step === 'idle') {
                    const nlpEnabled = tenant.is_nlp_enabled && !!process.env.GEMINI_API_KEY;

                    if (!nlpEnabled) {
                        await sendTelegramMessage(chatId, '⚠️ Ketuk /kasir untuk memulai transaksi.');
                        return NextResponse.json({ ok: true });
                    }

                    // PRE-FILTER — jangan langsung call OpenAI/Gemini:
                    const { data: allBarbers } = await supabaseAdmin
                        .from('barbers')
                        .select('id, name')
                        .eq('tenant_id', tenant.id)
                        .eq('is_active', true)
                        .eq('role', 'barber');

                    const { data: allServices } = await supabaseAdmin
                        .from('services')
                        .select('id, name, price, price_type, price_min, price_max')
                        .eq('tenant_id', tenant.id)
                        .eq('is_active', true)
                        .eq('service_type', SERVICE_TYPES.POS_KASIR);

                    const looksValid = looksLikeOrder(
                        text,
                        allBarbers?.map(b => b.name) ?? [],
                        allServices?.map(s => s.name) ?? []
                    );

                    if (!looksValid) {
                        await sendTelegramMessage(chatId, `⚠️ Tidak mengenali perintah ini.\nKetuk /kasir untuk mulai transaksi.`);
                        return NextResponse.json({ ok: true });
                    }

                    if (isRateLimited(chatId)) {
                        await sendTelegramMessage(chatId, `⏳ Terlalu cepat. Coba lagi sebentar.`);
                        return NextResponse.json({ ok: true });
                    }

                    await sendTelegramMessage(chatId, '🤖 Memproses...');

                    let nlpResult: NLPResult;
                    try {
                        nlpResult = await parseOrderFromText(
                            text,
                            allBarbers ?? [],
                            allServices ?? [],
                            isCentralized
                        );
                    } catch (err) {
                        await sendTelegramMessage(chatId, `❌ Gagal memproses. Ketuk /kasir untuk manual.`);
                        return NextResponse.json({ ok: true });
                    }

                    if (!nlpResult.isValid) {
                        await sendTelegramMessage(chatId, `⚠️ Tidak bisa memproses:\n_${nlpResult.reason ?? 'Input tidak dikenali'}_\n\nKetuk /kasir untuk mulai manual.`);
                        return NextResponse.json({ ok: true });
                    }

                    if (nlpResult.ambiguous_barber) {
                        const tempSession = await upsertSession(
                            chatId, tenant.id, barber.id,
                            'idle',
                            {
                                cart: nlpResult.services.map((s: any) => {
                                    const svc = allServices?.find(sv => sv.id === s.service_id);
                                    return {
                                        service_id: s.service_id,
                                        service_name: svc?.name ?? 'Layanan',
                                        price: s.fixed_price,
                                        qty: 1,
                                    };
                                }),
                                customer_name: nlpResult.customer_name ?? 'Pelanggan Umum',
                                selected_barber_id: null,
                                nlp_draft: true,
                            } as any
                        );

                        await sendTelegramMessage(chatId, `🤖 Nama barber tidak jelas.\nPilih barber yang dimaksud:`);
                        const freshSess = await getSession(chatId, tenant.id);
                        await showBarberList(chatId, null, tenant.id, barber.id, freshSess, tz);
                        return NextResponse.json({ ok: true });
                    }

                    const validatedServices = nlpResult.services.map((s: any) => {
                        const svc = allServices?.find(sv => sv.id === s.service_id);
                        if (!svc) return null;

                        let finalPrice = s.fixed_price;
                        if (svc.price_type === 'range') {
                            const min = svc.price_min ?? 0;
                            const max = svc.price_max ?? Infinity;
                            finalPrice = Math.min(max, Math.max(min, s.fixed_price));
                        }

                        return {
                            service_id: s.service_id,
                            service_name: svc.name,
                            price: finalPrice,
                            qty: 1,
                        };
                    }).filter(Boolean);

                    if (validatedServices.length === 0) {
                        await sendTelegramMessage(chatId, `⚠️ Tidak ada layanan valid ditemukan.\nKetuk /kasir untuk manual.`);
                        return NextResponse.json({ ok: true });
                    }

                    const totalNlp = validatedServices.reduce((sum: number, s: any) => sum + s!.price, 0);

                    await upsertSession(chatId, tenant.id, barber.id, 'awaiting_payment', {
                        cart: validatedServices as CartItem[],
                        customer_name: nlpResult.customer_name ?? 'Pelanggan Umum',
                        customer_id: null,
                        selected_barber_id: nlpResult.barber_id ?? barber.id,
                        selected_barber_name: nlpResult.barber_name ?? null,
                        total_price: totalNlp,
                        from_nlp: true,
                    } as any);

                    const cartLines = validatedServices.map((s: any) => `• ${s!.service_name} — Rp ${formatRupiah(s!.price)}`).join('\n');
                    const barberLine = nlpResult.barber_name ? `✂️ Dikerjakan: *${nlpResult.barber_name}*\n` : '';

                    await sendTelegramMessage(chatId, 
                        `🤖 *Disiapkan oleh Kasir Pintar*\n` +
                        `${'─'.repeat(28)}\n` +
                        `👤 Pelanggan: *${nlpResult.customer_name ?? 'Pelanggan Umum'}*\n` +
                        `${barberLine}` +
                        `\n🛒 *Order:*\n${cartLines}\n` +
                        `${'─'.repeat(28)}\n` +
                        `💰 Total: *Rp ${formatRupiah(totalNlp)}*\n\n` +
                        `Sudah benar? Pilih metode bayar:`, {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '💵 Cash', callback_data: 'pay_cash' },
                                    { text: '📱 QRIS', callback_data: 'pay_qris' },
                                ],
                                [
                                    { text: '🏦 Transfer', callback_data: 'pay_transfer' },
                                ],
                                [
                                    { text: '❌ Batal & Mulai Manual', callback_data: 'confirm_cancel' }
                                ]
                            ]
                        }
                    });

                } else if (session.step === 'confirming' || session.step === 'awaiting_payment') {
                    await sendTelegramMessage(chatId, `ℹ️ Sesi transaksi tidak aktif atau perintah tidak dikenali.\n\n/kasir — Mulai transaksi baru\n/laporan — Rekap hari ini`);
                }
            }
            return NextResponse.json({ ok: true });
        }

        // ─── CABANG 2: CALLBACK MASUK ───
        if (body.callback_query) {
            const callbackId = body.callback_query.id;
            const data = body.callback_query.data;
            const chatId = body.callback_query.message.chat.id.toString();
            const messageId = body.callback_query.message.message_id;

            const { data: barber } = await supabaseAdmin.from('barbers').select('id, name, tenant_id').eq('telegram_chat_id', chatId).single();
            if (!barber) {
                await answerCallbackQuery(callbackId, "Akses ditolak.");
                return NextResponse.json({ ok: true });
            }

            const { data: tenantData } = await supabaseAdmin.from('tenants').select('id, shop_name, plan, timezone, is_centralized_cashier').eq('id', barber.tenant_id).single();
            const tenant = tenantData as any;
            if (!tenant) {
                await answerCallbackQuery(callbackId, "Toko tidak ditemukan.");
                return NextResponse.json({ ok: true });
            }
            const tz = tenant.timezone ?? 'Asia/Jakarta';
            const isCentralized = tenant.is_centralized_cashier ?? false;

            const session = await getSession(chatId, tenant.id);
            if (!session && !data.startsWith('void_req_')) {
                await answerCallbackQuery(callbackId, "⏰ Sesi habis. Ketuk /kasir untuk mulai lagi.");
                return NextResponse.json({ ok: true });
            }

            const ctx = session?.context as any || {};

            // CANCEL VOID FROM STRUCT
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
                    await editTelegramMessage(chatId, messageId, `✅ *Transaksi dibatalkan otomatis*\n(Dalam batas waktu 5 menit)\n\nKetuk /kasir untuk transaksi baru.`);
                } else {
                    await supabaseAdmin.from('booking_voids').insert({ booking_id: bookings[0].id, tenant_id: tenant.id, requested_by: barber.id, status: 'pending' });
                    const totalVoid = bookings.reduce((sum: number, b: any) => sum + (b.final_price ?? 0), 0);
                    await sendWhatsAppToOwner(tenant.id, `⚠️ *Permintaan Pembatalan*\nTotal: Rp ${formatRupiah(totalVoid)}\nDari barber: ${barber.name}\nWaktu: ${formatReceiptDateTime(tz)}`);
                    await editTelegramMessage(chatId, messageId, `⏳ *Permintaan Dikirim ke Owner*\nSudah lewat 5 menit. Menunggu persetujuan Owner.`);
                }
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }

            // STEP 2B - Skip Customer
            if (data === 'customer_skip') {
                await upsertSession(chatId, tenant.id, barber.id, 'idle', {
                    ...ctx,
                    customer_name: 'Pelanggan Umum',
                    customer_id: null,
                    selected_barber_id: isCentralized ? undefined : barber.id
                });
                
                const freshSession = await getSession(chatId, tenant.id);
                if (!freshSession) {
                    await answerCallbackQuery(callbackId, '❌ Gagal menyimpan sesi.');
                    return NextResponse.json({ ok: true });
                }

                if (isCentralized) {
                    await showBarberList(chatId, messageId, tenant.id, barber.id, freshSession, tz);
                } else {
                    await showServiceList(chatId, messageId, tenant.id, barber.id, freshSession, tz);
                }
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }

            // STEP 3 - Pick Barber (Centralized)
            if (data.startsWith('barber_pick_')) {
                const selectedBarberId = data.replace('barber_pick_', '');

                await answerCallbackQuery(callbackId);

                const { data: selectedBarber } = await supabaseAdmin
                    .from('barbers')
                    .select('id, name')
                    .eq('id', selectedBarberId)
                    .eq('tenant_id', tenant.id)
                    .eq('is_active', true)
                    .eq('role', 'barber')
                    .single();

                if (!selectedBarber) {
                    await editTelegramMessage(chatId, messageId, `⚠️ Barber tidak valid. Pilih ulang:`);
                    const sessionForFail = await getSession(chatId, tenant.id);
                    await showBarberList(chatId, messageId, tenant.id, barber.id, sessionForFail, tz);
                    return NextResponse.json({ ok: true });
                }

                await upsertSession(chatId, tenant.id, barber.id, 'idle', {
                    ...ctx,
                    selected_barber_id:   selectedBarberId,
                    selected_barber_name: selectedBarber.name,
                });

                const freshSession = await getSession(chatId, tenant.id);
                // Kita pass barberId dari pengirim as param,
                // Namun ctx sudah ada selected_barber_id untuk dipakai di showServiceList.
                await showServiceList(chatId, messageId, tenant.id, barber.id, freshSession, tz);
                return NextResponse.json({ ok: true });
            }

            // STEP 4 - Pick Service
            if (data.startsWith('svc_pick_')) {
                const serviceId = data.replace('svc_pick_', '');
                const services = await getPosServicesForBarber(tenant.id, barber.id);
                const svc = services.find((s: any) => s.id === serviceId);

                if (!svc) {
                    await answerCallbackQuery(callbackId, '❌ Layanan tidak ditemukan');
                    return NextResponse.json({ ok: true });
                }

                if (svc.price_type === 'fixed') {
                    const updatedCart = addToCart(ctx.cart ?? [], {
                        service_id: svc.id,
                        service_name: svc.name,
                        price: svc.final_price
                    });
                    await upsertSession(chatId, tenant.id, barber.id, 'idle', { ...ctx, cart: updatedCart });
                    await askAddMore(chatId, messageId, tz, updatedCart, ctx.customer_name);
                } else if (svc.price_type === 'range') {
                    const mid = Math.round((svc.final_price_min! + svc.final_price_max!) / 2 / 1000) * 1000;
                    await upsertSession(chatId, tenant.id, barber.id, 'awaiting_price', {
                        ...ctx,
                        pending_service: {
                            service_id: svc.id,
                            service_name: svc.name,
                            price_min: svc.final_price_min,
                            price_max: svc.final_price_max,
                            price_type: 'range'
                        }
                    });
                    
                    await editTelegramMessage(chatId, messageId, `💈 <b>${svc.name}</b>\nRentang: Rp ${formatRupiah(svc.final_price_min!)} – Rp ${formatRupiah(svc.final_price_max!)}\n\nPilih nominal:`, {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: `Rp ${formatRupiah(svc.final_price_min!)} (Min)`, callback_data: `price_${svc.id}_${svc.final_price_min}` }],
                                [{ text: `Rp ${formatRupiah(mid)} (Tengah)`, callback_data: `price_${svc.id}_${mid}` }],
                                [{ text: `Rp ${formatRupiah(svc.final_price_max!)} (Maks)`, callback_data: `price_${svc.id}_${svc.final_price_max}` }],
                                [{ text: '✏️ Nominal Lain', callback_data: `price_custom_${svc.id}` }]
                            ]
                        }
                    });
                } else if (svc.price_type === 'custom') {
                    await upsertSession(chatId, tenant.id, barber.id, 'awaiting_price', {
                        ...ctx,
                        pending_service: {
                            service_id: svc.id,
                            service_name: svc.name,
                            price_type: 'custom',
                            awaiting_free_input: true
                        }
                    });
                    await editTelegramMessage(chatId, messageId, `💈 <b>${svc.name}</b>\n\nKetik nominal harga\n_(contoh: 75000)_:`);
                }
                
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }

            // STEP 4B - Price Callback
            if (data.startsWith('price_')) {
                if (data.startsWith('price_custom_')) {
                    const serviceId = data.replace('price_custom_', '');

                    await answerCallbackQuery(callbackId);

                    const session = await getSession(chatId, tenant.id);
                    if (!session) {
                        await sendTelegramMessage(chatId, '⏰ Sesi habis. Ketuk /kasir untuk mulai lagi.');
                        return NextResponse.json({ ok: true });
                    }

                    const { data: service } = await supabaseAdmin
                        .from('services')
                        .select('id, name, price_type, price_min, price_max')
                        .eq('id', serviceId)
                        .eq('tenant_id', tenant.id)
                        .single();

                    if (!service) {
                        await editTelegramMessage(chatId, messageId, '⚠️ Layanan tidak ditemukan. Pilih ulang:');
                        await showServiceList(chatId, messageId, tenant.id, barber.id, session, tz);
                        return NextResponse.json({ ok: true });
                    }

                    await upsertSession(chatId, tenant.id, barber.id, 'awaiting_price', {
                        ...ctx,
                        pending_service: {
                            service_id: service.id,
                            service_name: service.name,
                            price_type: 'range',
                            price_min: service.price_min,
                            price_max: service.price_max,
                            awaiting_free_input: true,
                        }
                    });

                    await editTelegramMessage(chatId, messageId, 
                        `✏️ *Masukkan Nominal Sendiri*\n\n` +
                        `Layanan: *${service.name}*\n` +
                        `Rentang: Rp ${formatRupiah(service.price_min || 0)} – Rp ${formatRupiah(service.price_max || 0)}\n\n` +
                        `Ketik nominalnya _(contoh: 45000)_:`
                    );
                } else {
                    const [, serviceId, amountStr] = data.split('_');
                    const price = parseInt(amountStr);
                    
                    if (ctx.pending_service?.price_type === 'range') {
                        if (price < ctx.pending_service.price_min || price > ctx.pending_service.price_max) {
                            await answerCallbackQuery(callbackId, '❌ Nominal di luar rentang harga');
                            return NextResponse.json({ ok: true });
                        }
                    }

                    const updatedCart = addToCart(ctx.cart ?? [], {
                        service_id: ctx.pending_service.service_id,
                        service_name: ctx.pending_service.service_name,
                        price
                    });

                    await upsertSession(chatId, tenant.id, barber.id, 'idle', {
                        ...ctx,
                        cart: updatedCart,
                        pending_service: undefined
                    });

                    await askAddMore(chatId, messageId, tz, updatedCart, ctx.customer_name);
                }
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }

            // STEP 6A - Add More
            if (data === 'cart_add_more') {
                const sess = await getSession(chatId, tenant.id);
                await showServiceList(chatId, messageId, tenant.id, barber.id, sess, tz);
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }

            // STEP 6 Edit - Edit List
            if (data === 'cart_edit_list') {
                const session = await getSession(chatId, tenant.id);
                if (!session) {
                    await answerCallbackQuery(callbackId);
                    await sendTelegramMessage(chatId, '⏰ Sesi habis. Ketuk /kasir untuk mulai lagi.');
                    return NextResponse.json({ ok: true });
                }

                await answerCallbackQuery(callbackId);

                const cart = session.context.cart ?? [];

                if (cart.length === 0) {
                    await editTelegramMessage(chatId, messageId, '🛒 Keranjang sudah kosong.\nKetuk /kasir untuk mulai transaksi baru.');
                    return NextResponse.json({ ok: true });
                }

                const itemButtons = cart.map((item: any, index: number) => [{
                    text: `❌ Hapus: ${item.service_name} (Rp ${formatRupiah(item.price)})`,
                    callback_data: `cart_rm_${index}`
                }]);

                itemButtons.push([{
                    text: '🔙 Kembali',
                    callback_data: 'cart_back_to_summary'
                }]);

                await editTelegramMessage(chatId, messageId, `🗑️ <b>Edit Keranjang</b>\n\nPilih item yang ingin dihapus:`, { reply_markup: { inline_keyboard: itemButtons } });
                return NextResponse.json({ ok: true });
            }

            // STEP 6 Edit - Remove Item
            if (data.startsWith('cart_rm_')) {
                const session = await getSession(chatId, tenant.id);
                if (!session) {
                    await answerCallbackQuery(callbackId);
                    await sendTelegramMessage(chatId, '⏰ Sesi habis. Ketuk /kasir untuk mulai lagi.');
                    return NextResponse.json({ ok: true });
                }

                const indexStr = data.replace('cart_rm_', '');
                const index = parseInt(indexStr);
                const cart = [...(session.context.cart ?? [])];

                if (isNaN(index) || index < 0 || index >= cart.length) {
                    await answerCallbackQuery(callbackId, '⚠️ Item tidak ditemukan, mungkin sudah dihapus.');
                    
                    const refreshedButtons = cart.map((item: any, i: number) => [{
                        text: `❌ Hapus: ${item.service_name} (Rp ${formatRupiah(item.price)})`,
                        callback_data: `cart_rm_${i}`
                    }]);
                    refreshedButtons.push([{
                        text: '🔙 Kembali',
                        callback_data: 'cart_back_to_summary'
                    }]);
                    await editTelegramMessage(chatId, messageId, `🗑️ <b>Edit Keranjang</b> (Diperbarui)\n\nPilih item yang ingin dihapus:`, { reply_markup: { inline_keyboard: refreshedButtons } });
                    return NextResponse.json({ ok: true });
                }

                const removedItem = cart[index];
                cart.splice(index, 1);

                await answerCallbackQuery(callbackId, `✅ "${removedItem.service_name}" dihapus`);

                await upsertSession(chatId, tenant.id, barber.id, 'idle', { ...session.context, cart });

                if (cart.length === 0) {
                    await editTelegramMessage(chatId, messageId, `✅ <b>"${removedItem.service_name}"</b> dihapus.\n\nKeranjang kosong.`);
                    const freshSession = await getSession(chatId, tenant.id);
                    await showServiceList(chatId, messageId, tenant.id, barber.id, freshSession, tz);
                } else {
                    const freshSession = await getSession(chatId, tenant.id);
                    await askAddMore(chatId, messageId, tz, freshSession!.context.cart ?? [], freshSession!.context.customer_name ?? 'Pelanggan Umum');
                }
                return NextResponse.json({ ok: true });
            }

            // STEP 6 Edit - Back to Summary
            if (data === 'cart_back_to_summary') {
                await answerCallbackQuery(callbackId);
                const session = await getSession(chatId, tenant.id);
                if (!session) {
                    await sendTelegramMessage(chatId, '⏰ Sesi habis. Ketuk /kasir untuk mulai lagi.');
                    return NextResponse.json({ ok: true });
                }
                await askAddMore(chatId, messageId, tz, session.context.cart ?? [], session.context.customer_name ?? 'Pelanggan Umum');
                return NextResponse.json({ ok: true });
            }

            // STEP 6B - Checkout
            if (data === 'cart_checkout') {
                const cart = ctx.cart ?? [];
                if (cart.length === 0) {
                    await answerCallbackQuery(callbackId, '⚠️ Keranjang kosong!');
                    return NextResponse.json({ ok: true });
                }

                const total = getCartTotal(cart);
                await upsertSession(chatId, tenant.id, barber.id, 'awaiting_payment', { ...ctx, total_price: total });
                
                await editTelegramMessage(chatId, messageId, `💰 <b>Pilih Metode Pembayaran</b>\n\nTotal: <b>Rp ${formatRupiah(total)}</b>`, {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '💵 Cash', callback_data: 'pay_cash' },
                                { text: '📱 QRIS', callback_data: 'pay_qris' }
                            ],
                            [
                                { text: '🏦 Transfer', callback_data: 'pay_transfer' }
                            ]
                        ]
                    }
                });
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }

            // STEP 7 - Select Payment Method
            if (data === 'pay_cash' || data === 'pay_qris' || data === 'pay_transfer') {
                const methodMap: Record<string, string> = { pay_cash: 'cash', pay_qris: 'qris', pay_transfer: 'transfer' };
                const methodLabel: Record<string, string> = { cash: '💵 Cash', qris: '📱 QRIS', transfer: '🏦 Transfer' };
                
                const paymentMethod = methodMap[data];
                const cart = ctx.cart ?? [];
                if (cart.length === 0) return NextResponse.json({ ok: true });
                const total = getCartTotal(cart);

                await upsertSession(chatId, tenant.id, barber.id, 'confirming', { ...ctx, payment_method: paymentMethod });

                const cartLines = cart.map((item: any) => `• ${item.service_name}${item.qty > 1 ? ` ×${item.qty}` : ''} — Rp ${formatRupiah(item.price * item.qty)}`).join('\n');

                await editTelegramMessage(chatId, messageId, `📋 <b>Konfirmasi Transaksi</b>\n${'─'.repeat(28)}\n👤 Pelanggan: <b>${ctx.customer_name}</b>\n✂️ Dikerjakan: <b>${ctx.selected_barber_name ?? 'Kamu'}</b>\n\n🧾 <b>Layanan:</b>\n${cartLines}\n${'─'.repeat(28)}\n💰 Total: <b>Rp ${formatRupiah(total)}</b>\n💳 Bayar: <b>${methodLabel[paymentMethod]}</b>\n${'─'.repeat(28)}\n\nSudah benar?`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '✅ Ya, Proses Transaksi', callback_data: 'confirm_yes' }],
                            [{ text: '❌ Batal', callback_data: 'confirm_cancel' }]
                        ]
                    }
                });
                await answerCallbackQuery(callbackId);
                return NextResponse.json({ ok: true });
            }

            // STEP 8A - Confirm Yes
            if (data === 'confirm_yes') {
                const freshSess = await getSession(chatId, tenant.id);
                if (!freshSess || freshSess.step !== 'confirming') {
                    await answerCallbackQuery(callbackId, '⚠️ Transaksi sudah diproses atau sesi habis.');
                    return NextResponse.json({ ok: true });
                }

                await clearSession(chatId, tenant.id);

                if (!ctx.cart || ctx.cart.length === 0) {
                    await editTelegramMessage(chatId, messageId, '❌ Keranjang kosong. /kasir');
                    await answerCallbackQuery(callbackId);
                    return NextResponse.json({ ok: true });
                }

                if (!ctx.payment_method || !ctx.customer_name) {
                    await editTelegramMessage(chatId, messageId, '❌ Data tidak lengkap. /kasir');
                    await answerCallbackQuery(callbackId);
                    return NextResponse.json({ ok: true });
                }

                const groupId = crypto.randomUUID();
                const now = new Date().toISOString();
                const inserts = ctx.cart.map((item: any) => ({
                    tenant_id: tenant.id,
                    barber_id: ctx.selected_barber_id ?? barber.id,
                    service_id: item.service_id,
                    customer_id: ctx.customer_id ?? null,
                    customer_name: ctx.customer_name,
                    status: 'completed',
                    final_price: item.price,
                    payment_method: ctx.payment_method,
                    booking_source: 'telegram_walk_in',
                    booking_group_id: groupId,
                    created_at: now
                }));

                const { error } = await supabaseAdmin.from('bookings').insert(inserts);

                if (error) {
                    await editTelegramMessage(chatId, messageId, `❌ Gagal menyimpan.\nError: ${error.message}`);
                    await answerCallbackQuery(callbackId);
                    return NextResponse.json({ ok: true });
                }

                const total = getCartTotal(ctx.cart);
                const waktu = formatReceiptDateTime(tz);
                const cartLines = ctx.cart.map((item: any) => `• ${item.service_name}${item.qty > 1 ? ` x${item.qty}` : ''}: Rp ${formatRupiah(item.price)}`).join('\n');
                const methodEmoji: Record<string, string> = { cash: '💵', qris: '📱', transfer: '🏦' };
                const mEmoji = methodEmoji[ctx.payment_method] ?? '💳';

                await editTelegramMessage(chatId, messageId, `✅ <b>TRANSAKSI BERHASIL</b>\n${'═'.repeat(28)}\n🏪 ${tenant.name}\n👤 ${ctx.customer_name}\n✂️ ${ctx.selected_barber_name ?? barber.name}\n📅 ${waktu}\n${'─'.repeat(28)}\n${cartLines}\n${'─'.repeat(28)}\n💰 <b>TOTAL: Rp ${formatRupiah(total)}</b>\n${mEmoji} ${ctx.payment_method.toUpperCase()}\n${'═'.repeat(28)}\n<i>Terima kasih! ✂️</i>`, {
                    reply_markup: {
                        inline_keyboard: [[ { text: '↩️ Batalkan Transaksi Ini', callback_data: `void_req_${groupId}` } ]]
                    }
                });

                await answerCallbackQuery(callbackId, "Berhasil!");
                return NextResponse.json({ ok: true });
            }

            // STEP 8B - Confirm Cancel
            if (data === 'confirm_cancel') {
                await clearSession(chatId, tenant.id);
                await editTelegramMessage(chatId, messageId, `❌ <b>Transaksi dibatalkan.</b>\n\nKetuk /kasir untuk mulai transaksi baru.`);
                await answerCallbackQuery(callbackId);
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
