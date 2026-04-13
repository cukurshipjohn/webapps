import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * POST /api/cron/booking-reminders
 *
 * Dipanggil setiap 5 menit oleh node-cron di VPS WhatsApp service.
 * Query booking online yang mulai dalam 55–65 menit, belum dapat reminder,
 * lalu kirim WA ke pelanggan sebagai pengingat.
 *
 * Dilindungi CRON_SECRET agar tidak bisa dipanggil sembarang orang.
 */
export async function POST(req: NextRequest) {
  try {
    // ── Auth: validasi CRON_SECRET ─────────────────────────────────
    const secret = req.headers.get('x-cron-secret')
    if (!secret || secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const waServiceUrl = process.env.WHATSAPP_SERVICE_URL
    const waSecret     = process.env.WHATSAPP_SERVICE_SECRET
    if (!waServiceUrl || !waSecret) {
      return NextResponse.json({ error: 'WA service tidak dikonfigurasi' }, { status: 500 })
    }

    // ── Window waktu: booking yang mulai antara 55–65 menit dari sekarang ──
    const now      = new Date()
    const windowStart = new Date(now.getTime() + 55 * 60 * 1000)  // sekarang + 55 menit
    const windowEnd   = new Date(now.getTime() + 65 * 60 * 1000)  // sekarang + 65 menit

    // ── Ambil booking online yang masuk window ──────────────────────
    const { data: bookings, error: fetchError } = await supabaseAdmin
      .from('bookings')
      .select(`
        id,
        tenant_id,
        start_time,
        final_price,
        service_id,
        barber_id,
        user_id,
        users   ( name, phone_number ),
        barbers ( name ),
        services ( name ),
        tenant_settings ( wa_session_id, timezone )
      `)
      .eq('booking_source', 'online')
      .in('status', ['pending', 'confirmed'])
      .gte('start_time', windowStart.toISOString())
      .lte('start_time', windowEnd.toISOString())

    if (fetchError) {
      console.error('[cron/booking-reminders] fetch error:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!bookings || bookings.length === 0) {
      return NextResponse.json({ sent: 0, message: 'Tidak ada booking dalam window ini' })
    }

    // ── Untuk setiap booking, cek apakah reminder sudah pernah dikirim ──
    let sentCount = 0
    const results: any[] = []

    for (const booking of bookings) {
      // Cek di notification_logs: sudah ada entry type='booking_reminder' untuk booking ini?
      const { data: existingLog } = await supabaseAdmin
        .from('notification_logs')
        .select('id')
        .eq('booking_id', booking.id)
        .eq('type', 'booking_reminder')
        .maybeSingle()

      if (existingLog) {
        results.push({ booking_id: booking.id, status: 'skipped_already_sent' })
        continue
      }

      // Ambil data detail dari join
      const userRow    = booking.users    as any
      const barberRow  = booking.barbers  as any
      const serviceRow = booking.services as any
      const tsRow      = booking.tenant_settings as any

      const customerName  = userRow?.name         ?? 'Pelanggan'
      const customerPhone = userRow?.phone_number  ?? null
      const barberName    = barberRow?.name        ?? 'Barber kami'
      const serviceName   = serviceRow?.name       ?? 'Layanan'
      const sessionId     = tsRow?.wa_session_id   ?? null
      const timezone      = tsRow?.timezone        ?? 'Asia/Jakarta'

      // Format jam booking sesuai timezone tenant
      const bookingTime = new Date(booking.start_time).toLocaleString('id-ID', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: timezone,
      })

      if (!customerPhone) {
        results.push({ booking_id: booking.id, status: 'skipped_no_phone' })
        continue
      }

      // ── Kirim WA reminder ke pelanggan ────────────────────────────
      const message =
        `⏰ *Pengingat Booking CukurShip!*\n\n` +
        `Halo *${customerName}* 👋\n\n` +
        `Kamu punya jadwal dalam *1 jam lagi*:\n\n` +
        `📅 Waktu   : ${bookingTime}\n` +
        `✂️ Barber  : ${barberName}\n` +
        `💈 Layanan : ${serviceName}\n\n` +
        `Kami sudah menunggu kamu! Sampai jumpa 🙏`

      try {
        const waRes = await fetch(`${waServiceUrl}/send-message`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: waSecret },
          body:    JSON.stringify({ session_id: sessionId, phoneNumber: customerPhone, message }),
        })

        if (!waRes.ok) {
          results.push({ booking_id: booking.id, status: 'wa_failed', code: waRes.status })
          continue
        }

        // ── Catat ke notification_logs agar tidak kirim ulang ───────
        await supabaseAdmin.from('notification_logs').insert({
          booking_id: booking.id,
          tenant_id:  booking.tenant_id,
          user_id:    booking.user_id,
          type:       'booking_reminder',
          status:     'sent',
          sent_at:    new Date().toISOString(),
        })

        sentCount++
        results.push({ booking_id: booking.id, status: 'sent', customer: customerName })
      } catch (waErr: any) {
        console.error('[cron/booking-reminders] WA error:', waErr.message)
        results.push({ booking_id: booking.id, status: 'error', detail: waErr.message })
      }
    }

    console.log(`[cron/booking-reminders] selesai: ${sentCount} reminder terkirim dari ${bookings.length} booking`)
    return NextResponse.json({
      sent:    sentCount,
      checked: bookings.length,
      results,
    })

  } catch (err: any) {
    console.error('[cron/booking-reminders] unexpected error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
