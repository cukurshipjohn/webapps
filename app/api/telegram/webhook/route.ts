import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

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

async function editTelegramMessage(chatId: string | number, messageId: number, text: string) {
    if (!BOT_TOKEN) return;
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: text,
            parse_mode: 'HTML'
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

export async function POST(request: NextRequest) {
    // 1. Verifikasi Keamanan (Secret Token Webhook)
    const secretToken = request.headers.get('x-telegram-bot-api-secret-token');
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    
    // Matikan komentar ini jika Anda sudah mendaftarkan webhook dengan secret
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

            // Jika Kapster TERDAFTAR
            if (text === '/start' || text === '/kasir') {
                // Tarik daftar layanan toko ini
                const { data: services } = await supabaseAdmin
                    .from('services')
                    .select('id, name, price, duration_minutes')
                    .eq('tenant_id', barber.tenant_id)
                    .order('name');
                
                if (!services || services.length === 0) {
                    await sendTelegramMessage(chatId, `Halo <b>${barber.name}</b>! Toko Anda belum mempunyai daftar layanan.`);
                    return NextResponse.json({ ok: true });
                }

                // Bangun Inline Keyboard
                const inline_keyboard = services.map(srv => {
                    const priceFormatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(srv.price);
                    return [{
                        text: `${srv.name} - ${priceFormatted}`,
                        callback_data: `pos_${srv.id}`
                    }];
                });

                // Tambah tombol batal
                inline_keyboard.push([{ text: "❌ Batalkan", callback_data: "cancel_pos" }]);

                await sendTelegramMessage(chatId, `Halo <b>${barber.name}</b>! 💈\nPilih layanan yang baru saja Anda kerjakan untuk dicatat ke kasir:`, { inline_keyboard });
            } else if (text === '/laporan') {
                // Tarik rekap shift hari ini
                const startOfDay = new Date();
                startOfDay.setHours(0, 0, 0, 0);

                const { data: todayBookings, error: reportErr } = await supabaseAdmin
                    .from('bookings')
                    .select('services(price)')
                    .eq('barber_id', barber.id)
                    .eq('booking_source', 'telegram_walk_in')
                    .gte('created_at', startOfDay.toISOString());
                
                const count = todayBookings?.length || 0;
                const total = todayBookings?.reduce((sum, b: any) => sum + (b.services?.price || 0), 0) || 0;
                const hargaFormatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(total);
                
                await sendTelegramMessage(chatId, `📊 <b>Laporan Shift Anda Hari Ini</b>\n\nTotal Kepala: ${count} Pelanggan\nOmset Kasir Walk-In: ${hargaFormatted}\n\n<i>Kerja bagus, ${barber.name}!</i>`);
            } else {
                // Perintah tidak dikenal
                await sendTelegramMessage(chatId, `Perintah tidak dikenali.\n\nPerintah yang tersedia:\n/kasir — Buka mesin kasir\n/laporan — Lihat rekap hari ini\n/daftar — Lihat Chat ID kamu`);
            }
            return NextResponse.json({ ok: true });
        }

        // ─── CABANG 2: ADA PENCETAN TOMBOL MASUK (Callback Query / POS Kasir) ───
        if (body.callback_query) {
            const callbackId = body.callback_query.id;
            const data = body.callback_query.data; // e.g., pos_12345
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
                return NextResponse.json({ ok: true });
            }

            if (data === 'cancel_pos') {
                await editTelegramMessage(chatId, messageId, "❌ Proses kasir dibatalkan.");
                return NextResponse.json({ ok: true });
            }

            if (data.startsWith('pos_')) {
                const serviceId = data.replace('pos_', '');

                // Ambil info layanan
                const { data: service } = await supabaseAdmin
                    .from('services')
                    .select('id, name, price, duration_minutes')
                    .eq('id', serviceId)
                    .single();
                
                if (!service) {
                    await editTelegramMessage(chatId, messageId, "Layanan tidak ditemukan.");
                    return NextResponse.json({ ok: true });
                }

                const priceFormatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(service.price);

                // Buat Booking Walk-In
                // Hitung end_time = now + duration
                const startTime = new Date();
                const endTime = new Date(startTime.getTime() + (service.duration_minutes * 60000));

                const { error: insertError } = await supabaseAdmin
                    .from('bookings')
                    .insert({
                        tenant_id: barber.tenant_id,
                        barber_id: barber.id,
                        service_id: service.id,
                        service_type: 'barbershop',
                        start_time: startTime.toISOString(),
                        end_time: endTime.toISOString(),
                        status: 'completed',
                        booking_source: 'telegram_walk_in',
                        payment_status: 'paid_cash'
                    });

                if (insertError) {
                    const fallbackErrorStr = insertError?.message || "Kesalahan database";
                    await editTelegramMessage(chatId, messageId, `❌ Gagal menyimpan transaksi: ${fallbackErrorStr}`);
                } else {
                    await editTelegramMessage(chatId, messageId, `✅ <b>Kasir Sukses!</b>\n\n📌 Layanan: ${service.name}\n💰 Uang Masuk Laci: ${priceFormatted}\n👤 Kapster: ${barber.name}\n🕒 Waktu: ${startTime.toLocaleTimeString('id-ID', {timeZone: 'Asia/Jakarta'})} WIB`);
                }
            }

            // Balas callback query agar loading-circle di button telegram hilang
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callback_query_id: callbackId })
            });

            return NextResponse.json({ ok: true });
        }

        return NextResponse.json({ message: 'No action taken' });
    } catch (err: any) {
        console.error('Telegram Webhook Payload Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
