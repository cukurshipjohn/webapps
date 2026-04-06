import { NextRequest, NextResponse } from 'next/server'
import { getUserFromToken, requireRole } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = getUserFromToken(req)
  if (!user) return NextResponse.json(
    { error: 'Unauthorized' }, { status: 401 }
  )
  requireRole(['owner', 'superadmin'], user.role)

  const tenantId = user.tenant_id
  if (!tenantId) return NextResponse.json(
    { error: 'Tenant tidak ditemukan' }, { status: 400 }
  )

  const { searchParams } = new URL(req.url)
  const dateFrom = searchParams.get('date_from')
  const dateTo   = searchParams.get('date_to')

  if (!dateFrom || !dateTo) return NextResponse.json(
    { error: 'date_from dan date_to wajib diisi' },
    { status: 400 }
  )

  const fromISO = new Date(`${dateFrom}T00:00:00+07:00`).toISOString()
  const toISO   = new Date(`${dateTo}T23:59:59+07:00`).toISOString()

  // ─── QUERY SEMUA BOOKING DI RENTANG ───────────
  const { data: bookings, error } = await supabaseAdmin
    .from('bookings')
    .select(`
      id,
      status,
      final_price,
      payment_method,
      booking_source,
      services ( price ),
      barbers  ( name )
    `)
    .eq('tenant_id', tenantId)
    .gte('created_at', fromISO)
    .lte('created_at', toISO)

  if (error) return NextResponse.json(
    { error: 'Gagal mengambil data' }, { status: 500 }
  )

  // ─── HANYA HITUNG YANG COMPLETED ──────────────
  const completed = (bookings ?? []).filter(
    b => b.status === 'completed'
  )

  // Harga aktual per booking
  const getPrice = (b: any): number =>
    b.final_price ?? b.services?.price ?? 0

  // ─── TOTAL RINGKASAN ──────────────────────────
  const totalTransaksi  = completed.length
  const totalPendapatan = completed.reduce(
    (sum, b) => sum + getPrice(b), 0
  )
  const totalDibatalkan = (bookings ?? []).filter(
    b => b.status === 'cancelled'
  ).length
  const totalPending = (bookings ?? []).filter(
    b => b.status === 'pending'
  ).length

  // ─── REKAP PER BARBER ─────────────────────────
  const barberMap = new Map<string, {
    nama: string
    total: number
    pendapatan: number
  }>()

  completed.forEach(b => {
    const nama = (b.barbers as any)?.name ?? 'Tidak Diketahui'
    const existing = barberMap.get(nama) ??
      { nama, total: 0, pendapatan: 0 }
    existing.total++
    existing.pendapatan += getPrice(b)
    barberMap.set(nama, existing)
  })

  const rekapBarber = Array.from(barberMap.values())
    .sort((a, b) => b.pendapatan - a.pendapatan)

  // ─── REKAP PER METODE BAYAR ───────────────────
  const paymentMap = new Map<string, number>()
  completed.forEach(b => {
    const method = b.payment_method ?? 'Tidak Dicatat'
    paymentMap.set(
      method, (paymentMap.get(method) ?? 0) + getPrice(b)
    )
  })

  const rekapPembayaran = Array.from(paymentMap.entries())
    .map(([method, total]) => ({ method, total }))
    .sort((a, b) => b.total - a.total)

  // ─── REKAP PER SUMBER TRANSAKSI ───────────────
  const sourceMap = new Map<string, {
    total: number, pendapatan: number
  }>()
  completed.forEach(b => {
    const src = b.booking_source ?? 'unknown'
    const ex  = sourceMap.get(src) ??
      { total: 0, pendapatan: 0 }
    ex.total++
    ex.pendapatan += getPrice(b)
    sourceMap.set(src, ex)
  })

  const rekapSumber = Array.from(sourceMap.entries())
    .map(([source, data]) => ({ source, ...data }))

  return NextResponse.json({
    periode: { dari: dateFrom, sampai: dateTo },
    ringkasan: {
      totalTransaksi,
      totalPendapatan,
      totalDibatalkan,
      totalPending,
      rataRataPerTransaksi: totalTransaksi > 0
        ? Math.round(totalPendapatan / totalTransaksi)
        : 0,
    },
    rekapBarber,
    rekapPembayaran,
    rekapSumber,
  })
}
