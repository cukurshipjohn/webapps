import { NextRequest, NextResponse } from 'next/server'
import { getUserFromToken, requireRole } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

// ─── HELPER: Format Rupiah ────────────────────────
function formatRupiah(amount: number | null): string {
  if (amount === null || amount === undefined) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount)
}

// ─── HELPER: Format Tanggal WIB ──────────────────
function formatDateWIB(isoString: string | null): string {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── HELPER: Label booking_source ────────────────
function labelSource(source: string | null): string {
  const map: Record<string, string> = {
    online: 'Booking Online',
    pos_kasir: 'Kasir Bot',
    telegram_walk_in: 'Kasir Bot (Walk-in)',
    walk_in: 'Walk-in Manual',
  }
  return map[source ?? ''] ?? source ?? '-'
}

// ─── HELPER: Label payment_method ────────────────
function labelPayment(method: string | null): string {
  const map: Record<string, string> = {
    cash: 'Cash',
    qris: 'QRIS',
    transfer: 'Transfer',
  }
  return map[method ?? ''] ?? method ?? '-'
}

// ─── HELPER: Label status ─────────────────────────
function labelStatus(status: string | null): string {
  const map: Record<string, string> = {
    completed: 'Selesai',
    cancelled: 'Dibatalkan',
    pending: 'Menunggu',
    confirmed: 'Dikonfirmasi',
  }
  return map[status ?? ''] ?? status ?? '-'
}

export async function GET(req: NextRequest) {
  // ─── AUTH ──────────────────────────────────────
  const user = await getUserFromToken(req)
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' }, { status: 401 }
    )
  }
  requireRole(['owner', 'superadmin'], user.role)

  const tenantId = user.tenant_id
  if (!tenantId) {
    return NextResponse.json(
      { error: 'Tenant ID tidak ditemukan' }, { status: 400 }
    )
  }

  // ─── QUERY PARAMS ─────────────────────────────
  const { searchParams } = new URL(req.url)
  const dateFrom  = searchParams.get('date_from')   // YYYY-MM-DD
  const dateTo    = searchParams.get('date_to')     // YYYY-MM-DD
  const format    = searchParams.get('format') ?? 'csv' // 'csv' | 'xlsx'
  const status    = searchParams.get('status')      // opsional filter
  const barberId  = searchParams.get('barber_id')   // opsional filter
  const source    = searchParams.get('source')      // opsional filter

  // ─── VALIDASI TANGGAL ─────────────────────────
  if (!dateFrom || !dateTo) {
    return NextResponse.json(
      { error: 'Parameter date_from dan date_to wajib diisi' },
      { status: 400 }
    )
  }

  const fromDate = new Date(`${dateFrom}T00:00:00+07:00`)
  const toDate   = new Date(`${dateTo}T23:59:59+07:00`)

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return NextResponse.json(
      { error: 'Format tanggal tidak valid. Gunakan YYYY-MM-DD' },
      { status: 400 }
    )
  }

  if (fromDate > toDate) {
    return NextResponse.json(
      { error: 'date_from tidak boleh lebih besar dari date_to' },
      { status: 400 }
    )
  }

  // Maksimal rentang 366 hari untuk keamanan
  const diffDays = 
    (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)
  if (diffDays > 366) {
    return NextResponse.json(
      { error: 'Rentang maksimal 1 tahun per export' },
      { status: 400 }
    )
  }

  // ─── QUERY DATABASE ───────────────────────────
  let query = supabaseAdmin
    .from('bookings')
    .select(`
      id,
      created_at,
      scheduled_at,
      customer_name,
      customer_phone,
      status,
      final_price,
      payment_method,
      booking_source,
      notes,
      services (
        name,
        price,
        service_type
      ),
      barbers (
        name
      )
    `)
    .eq('tenant_id', tenantId)
    .gte('created_at', fromDate.toISOString())
    .lte('created_at', toDate.toISOString())
    .order('created_at', { ascending: false })

  // Filter opsional
  if (status)   query = query.eq('status', status)
  if (barberId) query = query.eq('barber_id', barberId)
  if (source)   query = query.eq('booking_source', source)

  const { data: bookings, error } = await query

  if (error) {
    console.error('[EXPORT] Supabase error:', error)
    return NextResponse.json(
      { error: 'Gagal mengambil data dari database' },
      { status: 500 }
    )
  }

  if (!bookings || bookings.length === 0) {
    return NextResponse.json(
      { error: 'Tidak ada data di rentang tanggal yang dipilih' },
      { status: 404 }
    )
  }

  // ─── TRANSFORM DATA KE BARIS LAPORAN ──────────
  const rows = bookings.map((b, index) => ({
    'No': index + 1,
    'ID Transaksi': b.id,
    'Tanggal Transaksi': formatDateWIB(b.created_at),
    'Tanggal Booking': formatDateWIB(b.scheduled_at),
    'Nama Pelanggan': b.customer_name ?? '-',
    'No. HP Pelanggan': b.customer_phone ?? '-',
    'Barber': (b.barbers as any)?.name ?? '-',
    'Layanan': (b.services as any)?.name ?? '-',
    'Jenis Layanan': (() => {
      const type = (b.services as any)?.service_type
      if (type === 'barbershop')   return 'Barbershop'
      if (type === 'home_service') return 'Home Service'
      if (type === 'pos_kasir')    return 'Kasir POS'
      return type ?? '-'
    })(),
    'Harga Transaksi': b.final_price ?? 
                       (b.services as any)?.price ?? 0,
    'Harga Transaksi (Format)': formatRupiah(
      b.final_price ?? (b.services as any)?.price ?? 0
    ),
    'Metode Bayar': labelPayment(b.payment_method),
    'Status': labelStatus(b.status),
    'Asal Transaksi': labelSource(b.booking_source),
    'Catatan': (b as any).notes ?? '-',
  }))

  // ─── SUMMARY ROW ──────────────────────────────
  const totalPendapatan = rows
    .filter(r => r['Status'] === 'Selesai')
    .reduce((sum, r) => sum + (r['Harga Transaksi'] as number), 0)

  const totalTransaksi = rows.filter(
    r => r['Status'] === 'Selesai'
  ).length

  // ─── NAMA FILE ────────────────────────────────
  const fileName = `laporan-transaksi_${dateFrom}_sd_${dateTo}`

  // ─════════════════════════════════════════════════
  // OUTPUT FORMAT: CSV
  // ════════════════════════════════════════════════
  if (format === 'csv') {
    const headers = Object.keys(rows[0])
    const csvRows = [
      // Header baris info
      [`Laporan Transaksi CukurShip`],
      [`Periode: ${dateFrom} s/d ${dateTo}`],
      [`Total Transaksi Selesai: ${totalTransaksi}`],
      [`Total Pendapatan: "${formatRupiah(totalPendapatan)}"`],
      [`Diekspor: ${new Date().toLocaleString('id-ID', { 
        timeZone: 'Asia/Jakarta' 
      })}`],
      [], // baris kosong
      headers, // header kolom
      // Data rows
      ...rows.map(row => 
        headers.map(h => {
          const val = (row as any)[h]
          // Escape koma dan newline untuk CSV
          const str = String(val ?? '')
          return str.includes(',') || str.includes('\n') || str.includes('"')
            ? `"${str.replace(/"/g, '""')}"` 
            : str
        })
      ),
    ]

    const csvContent = csvRows
      .map(row => (Array.isArray(row) ? row.join(',') : row))
      .join('\n')

    // BOM untuk Excel bisa baca UTF-8 dengan benar
    const bom = '\uFEFF'

    return new NextResponse(bom + csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 
          `attachment; filename="${fileName}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  // ─════════════════════════════════════════════════
  // OUTPUT FORMAT: XLSX (Excel)
  // ════════════════════════════════════════════════
  if (format === 'xlsx') {
    const workbook  = XLSX.utils.book_new()

    // ── Sheet 1: Data Transaksi ──
    const worksheetData = [
      // Info baris atas
      ['Laporan Transaksi CukurShip'],
      [`Periode: ${dateFrom} s/d ${dateTo}`],
      [`Total Transaksi Selesai: ${totalTransaksi}`],
      [`Total Pendapatan: ${formatRupiah(totalPendapatan)}`],
      [`Diekspor: ${new Date().toLocaleString('id-ID', { 
        timeZone: 'Asia/Jakarta' 
      })}`],
      [], // baris kosong
      Object.keys(rows[0]), // header kolom
      ...rows.map(row => Object.values(row)),
    ]

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)

    // Set lebar kolom otomatis
    worksheet['!cols'] = [
      { wch: 4  },  // No
      { wch: 36 },  // ID Transaksi
      { wch: 20 },  // Tanggal Transaksi
      { wch: 20 },  // Tanggal Booking
      { wch: 20 },  // Nama Pelanggan
      { wch: 16 },  // No. HP
      { wch: 16 },  // Barber
      { wch: 22 },  // Layanan
      { wch: 14 },  // Jenis Layanan
      { wch: 14 },  // Harga (angka)
      { wch: 18 },  // Harga (format)
      { wch: 14 },  // Metode Bayar
      { wch: 12 },  // Status
      { wch: 18 },  // Asal Transaksi
      { wch: 30 },  // Catatan
    ]

    XLSX.utils.book_append_sheet(
      workbook, worksheet, 'Transaksi'
    )

    // ── Sheet 2: Rekap Per Barber ──
    const barberMap = new Map<string, {
      nama: string
      total: number
      pendapatan: number
    }>()

    rows.forEach(row => {
      if (row['Status'] !== 'Selesai') return
      const nama = row['Barber'] as string
      const existing = barberMap.get(nama) ?? 
        { nama, total: 0, pendapatan: 0 }
      existing.total++
      existing.pendapatan += row['Harga Transaksi'] as number
      barberMap.set(nama, existing)
    })

    const rekapBarber = [
      ['Rekap Per Barber'],
      [`Periode: ${dateFrom} s/d ${dateTo}`],
      [],
      ['Nama Barber', 'Total Transaksi', 
       'Total Pendapatan', 'Pendapatan (Format)'],
      ...Array.from(barberMap.values()).map(b => [
        b.nama, b.total, b.pendapatan, formatRupiah(b.pendapatan)
      ]),
      [],
      ['TOTAL', totalTransaksi, 
       totalPendapatan, formatRupiah(totalPendapatan)],
    ]

    const wsBarber = XLSX.utils.aoa_to_sheet(rekapBarber)
    wsBarber['!cols'] = [
      { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 20 }
    ]
    XLSX.utils.book_append_sheet(workbook, wsBarber, 'Rekap Barber')

    // ── Sheet 3: Rekap Per Metode Bayar ──
    const paymentMap = new Map<string, number>()
    rows.forEach(row => {
      if (row['Status'] !== 'Selesai') return
      const method = row['Metode Bayar'] as string
      paymentMap.set(
        method, 
        (paymentMap.get(method) ?? 0) + 
        (row['Harga Transaksi'] as number)
      )
    })

    const rekapPayment = [
      ['Rekap Per Metode Pembayaran'],
      [`Periode: ${dateFrom} s/d ${dateTo}`],
      [],
      ['Metode Bayar', 'Total Pendapatan', 'Pendapatan (Format)'],
      ...Array.from(paymentMap.entries()).map(([method, total]) => [
        method, total, formatRupiah(total)
      ]),
    ]

    const wsPayment = XLSX.utils.aoa_to_sheet(rekapPayment)
    wsPayment['!cols'] = [
      { wch: 16 }, { wch: 16 }, { wch: 20 }
    ]
    XLSX.utils.book_append_sheet(
      workbook, wsPayment, 'Rekap Pembayaran'
    )

    // Generate buffer
    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    })

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 
          'application/vnd.openxmlformats-officedocument' +
          '.spreadsheetml.sheet',
        'Content-Disposition': 
          `attachment; filename="${fileName}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  return NextResponse.json(
    { error: 'Format tidak valid. Gunakan csv atau xlsx' },
    { status: 400 }
  )
}
