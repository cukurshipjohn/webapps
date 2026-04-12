import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { getTenantFromRequest } from '../../../lib/tenant-context';
import { getHomeServiceLimit } from '../../../lib/billing-plans';
import { trackTenantActivity } from '../../../lib/activity-tracker';
import jwt from 'jsonwebtoken';


const DURATION_HOME_SERVICE = 45; // minutes
const DURATION_BARBERSHOP = 30; // minutes

export async function POST(request: NextRequest) {
    try {
        // Ambil token dari cookies
        const token = request.cookies.get('token')?.value;

        if (!token) {
            return NextResponse.json({ message: 'Authentication token required.' }, { status: 401 });
        }

        let decoded: any;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        } catch {
            return NextResponse.json({ message: 'Invalid or expired token.' }, { status: 403 });
        }

        const userId = decoded.id;

        // Ambil tenant dari header (di-inject oleh middleware)
        const { tenantId: headerTenantId } = getTenantFromRequest(request);

        const body = await request.json();
        const { barberId, serviceId, serviceType, startTime, customerAddress } = body;

        if (!barberId || !serviceId || !serviceType || !startTime) {
            return NextResponse.json({ message: "Missing required booking information." }, { status: 400 });
        }

        const bookingTime = new Date(startTime);
        const gap = serviceType === 'home' ? DURATION_HOME_SERVICE : DURATION_BARBERSHOP;
        const endTime = new Date(bookingTime.getTime() + gap * 60000);

        // AMBIL tenant_id DARI BARBER YANG DIPILIH (source of truth)
        const { data: barberData, error: barberError } = await supabaseAdmin
            .from('barbers')
            .select('tenant_id, phone, name')
            .eq('id', barberId)
            .single();

        if (barberError || !barberData) {
            return NextResponse.json({ message: "Barber tidak ditemukan." }, { status: 404 });
        }

        // Gunakan tenant_id dari barber (lebih aman dari header)
        const tenantId = barberData.tenant_id || headerTenantId;

        if (!tenantId) {
            return NextResponse.json({ message: "Tidak dapat menentukan tenant untuk booking ini." }, { status: 400 });
        }

        // ─── PLAN ENFORCEMENT: cek limit max_bookings_per_month ────
        const { supabaseAdmin: db } = await import('../../../lib/supabase');
        const { data: tenantPlan } = await db
            .from('tenants')
            .select('max_bookings_per_month, plan_key')
            .eq('id', tenantId)
            .single();

        if (tenantPlan) {
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            const { count: bookingCount } = await db
                .from('bookings')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', startOfMonth);

            if (typeof bookingCount === 'number' && bookingCount >= (tenantPlan.max_bookings_per_month ?? 50)) {
                return NextResponse.json({
                    message: `Batas booking bulan ini tercapai (${tenantPlan.max_bookings_per_month} booking). Upgrade plan untuk kapasitas lebih.`,
                    upgrade_required: true,
                }, { status: 403 });
            }

            // ─── HOME SERVICE LIMIT (Starter: maks 5x/bulan) ──────────
            if (serviceType === 'home') {
                const homeLimit = getHomeServiceLimit(tenantPlan.plan_key ?? 'starter');
                if (homeLimit < 9999) {
                    const { count: homeCount } = await db
                        .from('bookings')
                        .select('*', { count: 'exact', head: true })
                        .eq('tenant_id', tenantId)
                        .eq('service_type', 'home')
                        .gte('created_at', startOfMonth);

                    if (typeof homeCount === 'number' && homeCount >= homeLimit) {
                        return NextResponse.json({
                            message: `Batas Home Service bulan ini tercapai (${homeLimit}x). Upgrade ke paket Pro untuk Home Service tidak terbatas.`,
                            upgrade_required: true,
                        }, { status: 403 });
                    }
                }
            }
            // ──────────────────────────────────────────────────────────
        }
        // ───────────────────────────────────────────────────────────


        // ─── SNAPSHOT HARGA SAAT BOOKING ─────────
        const { data: serviceData } = await supabaseAdmin
            .from('services')
            .select('name, price, price_type')
            .eq('id', serviceId)
            .single();

        if (!serviceData) {
            return NextResponse.json({ message: "Layanan tidak ditemukan." }, { status: 404 });
        }

        const { data: priceOverride } = await supabaseAdmin
            .from('service_barber_pricing')
            .select('price_override')
            .eq('service_id', serviceId)
            .eq('barber_id', barberId)
            .maybeSingle();

        const snapshotPrice = priceOverride?.price_override ?? serviceData?.price ?? 0;
        // ─────────────────────────────────────────

        // Check for booking conflicts
        const { data: conflicts, error: conflictError } = await supabaseAdmin
            .from('bookings')
            .select('id')
            .eq('barber_id', barberId)
            .eq('tenant_id', tenantId)
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
                status: 'confirmed',
                tenant_id: tenantId,
                final_price: snapshotPrice,
                payment_method: null,
                booking_source: 'online'
            })
            .select()
            .single();

        if (insertError) {
            if (insertError.code === '23503' && insertError.message.includes('bookings_user_id_fkey')) {
                return NextResponse.json({ message: "Sesi Anda tidak valid. Silakan login kembali." }, { status: 401 });
            }
            throw insertError;
        }

        // Fetch full details for Notification, including tenant's WA session
        const [ { data: user }, { data: tenantSettings } ] = await Promise.all([
            supabaseAdmin.from('users').select('phone_number, name').eq('id', userId).single(),
            supabaseAdmin.from('tenant_settings').select('wa_session_id, timezone').eq('tenant_id', tenantId).single()
        ]);

        // Fire-and-forget: catat event booking_created untuk health tracking
        // TIDAK mempengaruhi response booking — jika gagal, booking tetap sukses
        trackTenantActivity({
            tenantId,
            eventType: 'booking_created',
            metadata: { booking_id: newBooking.id },
        }).catch(() => {}); // silent fail

        // FIX: Sertakan timeZone tenant agar jam yang tampil di WA sesuai zona waktu toko,
        // bukan UTC. Server Vercel berjalan UTC — tanpa timeZone, jam mundur 7 jam dari WIB.
        const tenantTimezone = (tenantSettings as any)?.timezone || 'Asia/Jakarta';
        const formattedTime = bookingTime.toLocaleString('id-ID', {
            dateStyle: 'full',
            timeStyle: 'short',
            timeZone: tenantTimezone,
        });
        const customerName = user?.name || "Pelanggan Baru";
        const customerPhone = user?.phone_number || "Tidak diketahui";
        const waSessionId = tenantSettings?.wa_session_id || null;

        // Send WhatsApp notification to barber via Microservice
        if (barberData.phone) {
            const barberWaMessage = `🔔 *PESANAN BARU MASUK*\n\n` +
                `*Pelanggan:* ${customerName} (${customerPhone})\n` +
                `*Layanan:* ${serviceData.name} - Rp${snapshotPrice}\n` +
                `*Tipe:* ${serviceType === 'home' ? 'Home Service' : 'Di Barbershop'}\n` +
                `*Waktu:* ${formattedTime}\n` +
                (serviceType === 'home' ? `*Alamat:* ${customerAddress}\n` : '') +
                `\nMohon bersiap tepat waktu!`;

            let waServiceUrl = process.env.WHATSAPP_SERVICE_URL;
            const waSecret = process.env.WHATSAPP_SERVICE_SECRET;
            const ownerPhone = process.env.OWNER_PHONE_NUMBER;

            if (waServiceUrl) {
                if (!waServiceUrl.startsWith('http')) waServiceUrl = `https://${waServiceUrl}`;

                fetch(`${waServiceUrl}/send-message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-internal-secret': waSecret || '' },
                    body: JSON.stringify({ session_id: waSessionId, phoneNumber: barberData.phone, message: barberWaMessage })
                }).catch(err => console.error("Gagal mengirim WA ke Barber:", err));

                if (ownerPhone) {
                    const ownerWaMessage = `👑 *LAPORAN BOOKING BARU*\n\n` +
                        `*Pelanggan:* ${customerName} (${customerPhone})\n` +
                        `*Barber Terpilih:* ${barberData.name}\n` +
                        `*Layanan:* ${serviceData.name} - Rp${snapshotPrice}\n` +
                        `*Jadwal:* ${formattedTime}`;

                    fetch(`${waServiceUrl}/send-message`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-internal-secret': waSecret || '' },
                        body: JSON.stringify({ session_id: waSessionId, phoneNumber: ownerPhone, message: ownerWaMessage })
                    }).catch(err => console.error("Gagal mengirim WA ke Owner:", err));
                }
            }
        }

        // Fire Webhook
        const webhookUrl = process.env.WEBHOOK_URL;
        if (webhookUrl && webhookUrl.startsWith('http')) {
            const webhookPayload = {
                event: "booking_created",
                booking_id: newBooking.id,
                tenant_id: tenantId,
                customer: { name: customerName, phone: customerPhone, address: customerAddress },
                barber: { id: barberId, name: barberData.name },
                service: { name: serviceData.name, type: serviceType, price: snapshotPrice },
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
