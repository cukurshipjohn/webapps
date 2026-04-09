import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPosTokenFromRequest } from '@/lib/pos-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const payload = getPosTokenFromRequest(req as any)
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Hari ini jam 00:00:00 local time
    // Catatan: tergantung timezone server, lebih aman pass date dari client jika ingin sangat spesifik.
    // Tapi kita pakai logika dari server saja dulu.
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    let query = supabaseAdmin
      .from('bookings')
      .select('final_price, booking_group_id', { count: 'exact' })
      .eq('tenant_id', payload.tenantId)
      .eq('booking_source', 'web_pos')
      .gte('created_at', todayStart.toISOString())

    // Kasir sentral: tampilkan semua barber dalam 1 toko
    // Barber biasa: hanya barber_id miliknya
    if (payload.barberRole === 'barber') {
      query = query.eq('barber_id', payload.barberId)
    }

    const { data: bookings, error } = await query

    if (error) {
      return NextResponse.json({ error: 'Gagal mengambil data hari ini' }, { status: 500 })
    }

    let txCount = 0
    let totalOmset = 0
    let itemCount = 0
    
    if (bookings) {
      const groupIds = new Set()
      bookings.forEach(b => {
        itemCount++
        totalOmset += (b.final_price || 0)
        if (b.booking_group_id) {
          groupIds.add(b.booking_group_id)
        }
      })
      txCount = groupIds.size
    }

    return NextResponse.json({
      tx_count: txCount,
      total_omset: totalOmset,
      item_count: itemCount
    })

  } catch (error: any) {
    console.error('Error GET /api/pos/today:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan sistem' }, { status: 500 })
  }
}
