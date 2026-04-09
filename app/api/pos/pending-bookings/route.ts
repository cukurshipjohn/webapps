import { NextResponse } from 'next/server'
import { getPosTokenFromRequest } from '@/lib/pos-auth'
import { countPendingBookings } from '@/lib/booking-alerts'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const payload = getPosTokenFromRequest(req as any)
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await countPendingBookings(
      payload.tenantId,
      payload.barberRole === 'barber' ? payload.barberId : null,
      payload.barberRole as 'barber' | 'cashier'
    )

    return NextResponse.json({
      pending_count: result.count,
      bookings: result.bookings.map((b: any) => ({
        id:         b.id,
        group_id:   b.booking_group_id,
        customer:   b.users?.name ?? 'Tamu',
        barber:     b.barbers?.name ?? '—',
        service:    b.services?.name ?? '—',
        start_time: b.start_time,
        status:     b.status,
      }))
    })
  } catch (error: any) {
    console.error('[pos/pending-bookings] GET error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
