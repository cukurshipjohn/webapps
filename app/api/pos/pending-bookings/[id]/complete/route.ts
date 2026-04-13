import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPosTokenFromRequest } from '@/lib/pos-auth'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: any) {
  try {
    const payload = getPosTokenFromRequest(req as any)
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const bookingId = params.id
    const body = await req.json()
    const { payment_method } = body

    if (!payment_method || !['cash', 'qris', 'transfer'].includes(payment_method)) {
      return NextResponse.json({ error: 'Metode pembayaran tidak valid' }, { status: 422 })
    }

    // 1. Ambil booking — wajib online booking yang belum selesai
    const { data: booking, error: fetchError } = await supabaseAdmin
      .from('bookings')
      .select('id, tenant_id, barber_id, status, booking_source, user_id, service_id, final_price')
      .eq('id', bookingId)
      .eq('booking_source', 'online') // FIX: booking dibuat dengan 'online' (bukan 'web')
      .in('status', ['pending', 'confirmed'])
      .single()

    if (fetchError || !booking) {
      return NextResponse.json(
        { error: 'Booking tidak ditemukan atau sudah diselesaikan' },
        { status: 404 }
      )
    }

    // 2. Validasi kepemilikan tenant
    if (booking.tenant_id !== payload.tenantId) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    // 3. Jika role barber — pastikan hanya boleh selesaikan booking miliknya
    if (payload.barberRole === 'barber' && booking.barber_id !== payload.barberId) {
      return NextResponse.json(
        { error: 'Kamu hanya bisa menyelesaikan booking yang ditugaskan padamu' },
        { status: 403 }
      )
    }

    // 4. Update status transaksi → completed
    // GAP #4 FIX: hapus updated_at — kolom ini tidak ada di skema tabel bookings
    const { error: updateError } = await supabaseAdmin
      .from('bookings')
      .update({
        status:         'completed',
        payment_method: payment_method,
        payment_status: 'paid',
      })
      .eq('id', bookingId)

    if (updateError) {
      console.error('[complete] update error:', updateError)
      return NextResponse.json({ error: 'Gagal memperbarui booking' }, { status: 500 })
    }

    // 5. GAP #2 FIX: Kirim notifikasi WA ke pelanggan, barber, dan owner
    // Semua fetch & send dilakukan fire-and-forget agar tidak memblokir response
    ;(async () => {
      try {
        const waServiceUrl = process.env.WHATSAPP_SERVICE_URL
        const waSecret     = process.env.WHATSAPP_SERVICE_SECRET
        const ownerPhone   = process.env.OWNER_PHONE_NUMBER
        if (!waServiceUrl || !waSecret) return

        // Ambil semua detail yang diperlukan secara paralel
        const [
          { data: userRow },
          { data: barberRow },
          { data: serviceRow },
          { data: tenantSettings },
        ] = await Promise.all([
          supabaseAdmin.from('users').select('name, phone_number').eq('id', booking.user_id!).single(),
          supabaseAdmin.from('barbers').select('name, phone').eq('id', booking.barber_id!).single(),
          supabaseAdmin.from('services').select('name').eq('id', booking.service_id!).single(),
          supabaseAdmin.from('tenant_settings').select('wa_session_id').eq('tenant_id', booking.tenant_id).single(),
        ])

        const sessionId    = tenantSettings?.wa_session_id ?? null
        const customerName = userRow?.name        ?? 'Pelanggan'
        const customerPhone= userRow?.phone_number ?? null
        const barberName   = barberRow?.name       ?? 'Barber'
        const barberPhone  = barberRow?.phone       ?? null
        const serviceName  = serviceRow?.name       ?? 'Layanan'
        const price        = (booking.final_price ?? 0).toLocaleString('id-ID')
        const payLabel     = payment_method === 'cash' ? 'Tunai' : payment_method === 'qris' ? 'QRIS' : 'Transfer'
        const now          = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' })

        const sendWA = (phoneNumber: string, message: string) =>
          fetch(`${waServiceUrl}/send-message`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Authorization: waSecret },
            body:    JSON.stringify({ session_id: sessionId, phoneNumber, message }),
          }).catch(err => console.error('[complete/wa] gagal kirim:', err))

        // 📩 WA ke Pelanggan
        if (customerPhone) {
          await sendWA(customerPhone,
            `✅ *Layanan Selesai!*\n\n` +
            `Halo *${customerName}*, terima kasih sudah kunjungi barbershop kami 🙏\n\n` +
            `📋 *Ringkasan Transaksi:*\n` +
            `• Layanan : ${serviceName}\n` +
            `• Barber  : ${barberName}\n` +
            `• Total   : Rp ${price}\n` +
            `• Bayar   : ${payLabel}\n` +
            `• Waktu   : ${now}\n\n` +
            `Sampai jumpa lagi! 💈`
          )
        }

        // 📩 WA ke Barber
        if (barberPhone) {
          await sendWA(barberPhone,
            `✅ *Booking Selesai*\n\n` +
            `Pelanggan  : ${customerName}\n` +
            `Layanan    : ${serviceName}\n` +
            `Total      : Rp ${price} (${payLabel})\n` +
            `Waktu      : ${now}`
          )
        }

        // 📩 WA ke Owner
        if (ownerPhone) {
          await sendWA(ownerPhone,
            `💰 *Transaksi Booking Selesai*\n\n` +
            `Pelanggan : ${customerName}\n` +
            `Barber    : ${barberName}\n` +
            `Layanan   : ${serviceName}\n` +
            `Nominal   : Rp ${price} (${payLabel})\n` +
            `Waktu     : ${now}`
          )
        }
      } catch (e) {
        console.error('[complete/wa] notification error:', e)
      }
    })()

    return NextResponse.json({
      success:    true,
      booking_id: bookingId,
    })

  } catch (error: any) {
    console.error('[pos/pending-bookings/:id/complete] PATCH error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
