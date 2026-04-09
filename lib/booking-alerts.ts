import { supabaseAdmin } from './supabase'

/**
 * Menghitung booking online (booking_source = 'web') yang BELUM diselesaikan
 * kasir pada hari ini.
 *
 * Role 'barber'   → hanya booking milik barber tersebut
 * Role 'cashier'  → semua booking tenant hari ini (lintas barber)
 */
export async function countPendingBookings(
  tenantId: string,
  barberId: string | null,
  role: 'barber' | 'cashier'
): Promise<{ count: number; bookings: any[] }> {

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  let query = supabaseAdmin
    .from('bookings')
    .select(`
      id,
      booking_group_id,
      users ( name ),
      start_time,
      status,
      barber_id,
      services ( name ),
      barbers ( name )
    `, { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('booking_source', 'web')
    .in('status', ['pending', 'confirmed'])
    .gte('start_time', todayStart.toISOString())
    .lte('start_time', todayEnd.toISOString())
    .order('start_time', { ascending: true })

  // Kasir individu hanya melihat booking miliknya
  if (role === 'barber' && barberId) {
    query = query.eq('barber_id', barberId)
  }

  const { data, count, error } = await query

  if (error) {
    console.error('[booking-alerts] countPendingBookings error:', error)
    return { count: 0, bookings: [] }
  }

  return { count: count ?? 0, bookings: data ?? [] }
}
