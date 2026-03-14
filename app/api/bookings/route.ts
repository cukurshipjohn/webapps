import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import jwt from 'jsonwebtoken';

const DURATION_HOME_SERVICE = 45; // minutes
const DURATION_BARBERSHOP = 30; // minutes

export async function POST(request: Request) {
    try {
        // Verify auth token
        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ message: 'Authentication token required.' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        let decoded: any;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        } catch {
            return NextResponse.json({ message: 'Invalid or expired token.' }, { status: 403 });
        }

        const userId = decoded.id;
        const body = await request.json();
        const { barberId, serviceId, serviceType, startTime, customerAddress } = body;

        if (!barberId || !serviceId || !serviceType || !startTime) {
            return NextResponse.json({ message: "Missing required booking information." }, { status: 400 });
        }

        const bookingTime = new Date(startTime);
        const gap = serviceType === 'home' ? DURATION_HOME_SERVICE : DURATION_BARBERSHOP;
        const endTime = new Date(bookingTime.getTime() + gap * 60000);

        // Check for booking conflicts using Supabase RPC or overlap query
        const { data: conflicts, error: conflictError } = await supabaseAdmin
            .from('bookings')
            .select('id')
            .eq('barber_id', barberId)
            .lt('start_time', endTime.toISOString())
            .gt('end_time', bookingTime.toISOString());

        if (conflictError) throw conflictError;

        if (conflicts && conflicts.length > 0) {
            return NextResponse.json({ message: "This time slot is no longer available. Please select another time." }, { status: 409 });
        }

        // Create the booking
        const { data: newBooking, error: insertError } = await supabaseAdmin
            .from('bookings')
            .insert({
                user_id: userId,
                barber_id: barberId,
                service_id: serviceId,
                service_type: serviceType,
                start_time: bookingTime.toISOString(),
                end_time: endTime.toISOString(),
                customer_address: serviceType === 'home' ? customerAddress : null,
                status: 'confirmed'
            })
            .select()
            .single();

        if (insertError) {
            if (insertError.code === '23503' && insertError.message.includes('bookings_user_id_fkey')) {
                return NextResponse.json({ message: "Sesi Anda tidak valid atau akun tidak ditemukan. Silakan login kembali." }, { status: 401 });
            }
            throw insertError;
        }

        // Fetch full details for Webhook and Notification
        const [ { data: barber }, { data: user }, { data: service } ] = await Promise.all([
            supabaseAdmin.from('barbers').select('phone, name').eq('id', barberId).single(),
            supabaseAdmin.from('users').select('phone_number, name').eq('id', userId).single(),
            supabaseAdmin.from('services').select('name, price').eq('id', serviceId).single()
        ]);

        const formattedTime = bookingTime.toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' });
        const customerName = user?.name || "Pelanggan Baru";
        const customerPhone = user?.phone_number || "Tidak diketahui";

        // 1. Send WhatsApp notification to barber via Microservice
        if (barber && barber.phone) {
            const barberWaMessage = `🔔 *PESANAN BARU MASUK*\n\n` +
                `*Pelanggan:* ${customerName} (${customerPhone})\n` +
                `*Layanan:* ${service?.name || 'Tbd'} - $${service?.price || '0'}\n` +
                `*Tipe:* ${serviceType === 'home' ? 'Home Service' : 'Di Barbershop'}\n` +
                `*Waktu:* ${formattedTime}\n` +
                (serviceType === 'home' ? `*Alamat:* ${customerAddress}\n` : '') +
                `\nMohon bersiap tepat waktu!`;

            const waServiceUrl = process.env.WHATSAPP_SERVICE_URL;
            const waSecret = process.env.WHATSAPP_SERVICE_SECRET;
            const ownerPhone = process.env.OWNER_PHONE_NUMBER;

            if (waServiceUrl) {
                // Background execution (tidak di-await penuh mencegah timeout jika WA lambat)
                // Notifikasi untuk Barber
                fetch(`${waServiceUrl}/send-message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-internal-secret': waSecret || '' },
                    body: JSON.stringify({ phoneNumber: barber.phone, message: barberWaMessage })
                }).catch(err => console.error("Gagal mengirim WA ke Barber:", err));

                // Notifikasi untuk Owner
                if (ownerPhone) {
                    const ownerWaMessage = `👑 *LAPORAN BOOKING BARU*\n\n` +
                        `*Pelanggan:* ${customerName} (${customerPhone})\n` +
                        `*Barber Terpilih:* ${barber.name}\n` +
                        `*Layanan:* ${service?.name} - $${service?.price}\n` +
                        `*Jadwal:* ${formattedTime}`;
                        
                    fetch(`${waServiceUrl}/send-message`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-internal-secret': waSecret || '' },
                        body: JSON.stringify({ phoneNumber: ownerPhone, message: ownerWaMessage })
                    }).catch(err => console.error("Gagal mengirim WA ke Owner:", err));
                }
            }
        }

        // 2. Fire the Webhook
        const webhookUrl = process.env.WEBHOOK_URL;
        if (webhookUrl && webhookUrl.startsWith('http')) {
            const webhookPayload = {
                event: "booking_created",
                booking_id: newBooking.id,
                customer: { name: customerName, phone: customerPhone, address: customerAddress },
                barber: { id: barberId, name: barber?.name },
                service: { name: service?.name, type: serviceType, price: service?.price },
                schedule: { start_time: bookingTime.toISOString(), format_time: formattedTime }
            };

            fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(webhookPayload)
            }).catch(err => console.error("Gagal menembak Webhook:", err));
        }

        return NextResponse.json({ message: "Booking created successfully!", bookingId: newBooking.id }, { status: 201 });
    } catch (error: any) {
        console.error("Error creating booking:", error);
        return NextResponse.json({ message: "Internal server error.", details: error.message }, { status: 500 });
    }
}
