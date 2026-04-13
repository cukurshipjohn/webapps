import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPosTokenFromRequest } from '@/lib/pos-auth'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/pos/pending-bookings/[id]/cancel
 *
 * Membatalkan booking online yang masih dalam status pending/confirmed.
 * Validasi:
 *  - Token POS valid
 *  - Booking milik tenant yang sama
 *  - Jika role 'barber', hanya bisa batalkan booking yang ditugaskan ke dirinya
 *  - booking_source harus 'online'
 *  - Status harus 'pending' atau 'confirmed' (bukan yang sudah selesai/batal)
 * Setelah batal, kirim WA ke pelanggan sebagai pemberitahuan (fire-and-forget).
 */
export async function PATCH(req: Request, { params }: any) {
  try {
    const payload = getPosTokenFromRequest(req as any)
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const bookingId = params.id

    // 1. Ambil booking — wajib online booking yang belum selesai/batal
    const { data: booking, error: fetchError } = await supabaseAdmin
      .from('bookings')
      .select('id, tenant_id, barber_id, status, booking_source, user_id, service_id, final_price')
      .eq('id', bookingId)
      .eq('booking_source', 'online')
      .in('status', ['pending', 'confirmed'])
      .single()

    if (fetchError || !booking) {
      return NextResponse.json(
        { error: 'Booking tidak ditemukan atau sudah diproses sebelumnya' },
        { status: 404 }
      )
    }

    // 2. Validasi kepemilikan tenant
    if (booking.tenant_id !== payload.tenantId) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    // 3. Jika role barber — hanya bisa batalkan booking miliknya
    if (payload.barberRole === 'barber' && booking.barber_id !== payload.barberId) {
      return NextResponse.json(
        { error: 'Kamu hanya bisa membatalkan booking yang ditugaskan padamu' },
        { status: 403 }
      )
    }

    // 4. Update status → cancelled
    const { error: updateError } = await supabaseAdmin
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', bookingId)

    if (updateError) {
      console.error('[cancel] update error:', updateError)
      return NextResponse.json({ error: 'Gagal membatalkan booking' }, { status: 500 })
    }

    // 5. Kirim WA ke pelanggan (fire-and-forget)
    ;(async () => {
      try {
        const waServiceUrl = process.env.WHATSAPP_SERVICE_URL
        const waSecret     = process.env.WHATSAPP_SERVICE_SECRET
        if (!waServiceUrl || !waSecret) return

        const [
          { data: userRow },
          { data: barberRow },
          { data: serviceRow },
          { data: tenantSettings },
        ] = await Promise.all([
          supabaseAdmin.from('users').select('name, phone_number').eq('id', booking.user_id!).single(),
          supabaseAdmin.from('barbers').select('name').eq('id', booking.barber_id!).single(),
          supabaseAdmin.from('services').select('name').eq('id', booking.service_id!).single(),
          supabaseAdmin.from('tenant_settings').select('wa_session_id').eq('tenant_id', booking.tenant_id).single(),
        ])

        const sessionId    = tenantSettings?.wa_session_id ?? null
        const customerName = userRow?.name         ?? 'Pelanggan'
        const customerPhone= userRow?.phone_number  ?? null
        const barberName   = barberRow?.name        ?? 'Barber'
        const serviceName  = serviceRow?.name       ?? 'Layanan'
        const now          = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' })

        if (customerPhone) {
          await fetch(`${waServiceUrl}/send-message`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Authorization: waSecret },
            body:    JSON.stringify({
              session_id:  sessionId,
              phoneNumber: customerPhone,
              message:
                `❌ *Booking Dibatalkan*\n\n` +
                `Halo *${customerName}*, mohon maaf booking kamu telah dibatalkan.\n\n` +
                `📋 *Detail:*\n` +
                `• Layanan : ${serviceName}\n` +
                `• Barber  : ${barberName}\n` +
                `• Waktu   : ${now}\n\n` +
                `Silakan hubungi toko untuk info lebih lanjut atau buat booking baru. 🙏`,
            }),
          }).catch(err => console.error('[cancel/wa] gagal kirim:', err))
        }
      } catch (e) {
        console.error('[cancel/wa] notification error:', e)
      }
    })()

    return NextResponse.json({
      success:    true,
      booking_id: bookingId,
    })

  } catch (error: any) {
    console.error('[pos/pending-bookings/:id/cancel] PATCH error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
