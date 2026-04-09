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
      .select('id, tenant_id, barber_id, status, booking_source')
      .eq('id', bookingId)
      .eq('booking_source', 'web')
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
    const { error: updateError } = await supabaseAdmin
      .from('bookings')
      .update({
        status:         'completed',
        payment_method: payment_method,
        payment_status: 'paid',
        updated_at:     new Date().toISOString(),
      })
      .eq('id', bookingId)

    if (updateError) {
      console.error('[complete] update error:', updateError)
      return NextResponse.json({ error: 'Gagal memperbarui booking' }, { status: 500 })
    }

    return NextResponse.json({
      success:    true,
      booking_id: bookingId,
    })

  } catch (error: any) {
    console.error('[pos/pending-bookings/:id/complete] PATCH error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
