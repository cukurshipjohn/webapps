'use client'

import { useEffect, useState } from 'react'

interface SummaryData {
  periode: { dari: string; sampai: string }
  ringkasan: {
    totalTransaksi: number
    totalPendapatan: number
    totalDibatalkan: number
    totalPending: number
    rataRataPerTransaksi: number
  }
  rekapBarber: Array<{
    nama: string
    total: number
    pendapatan: number
  }>
  rekapPembayaran: Array<{
    method: string
    total: number
  }>
  rekapSumber: Array<{
    source: string
    total: number
    pendapatan: number
  }>
}

interface Props {
  dateFrom: string
  dateTo: string
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount)
}

function labelPayment(method: string): string {
  const map: Record<string, string> = {
    cash: 'Cash',
    qris: 'QRIS',
    transfer: 'Transfer',
    'Tidak Dicatat': 'Belum Dicatat',
  }
  return map[method] ?? method
}

function labelSource(source: string): string {
  const map: Record<string, string> = {
    online: 'Booking Online',
    pos_kasir: 'Kasir Bot',
    telegram_walk_in: 'Kasir Bot (Walk-in)',
    walk_in: 'Walk-in Manual',
  }
  return map[source] ?? source
}

function ProgressBar({
  value, max, color = 'bg-primary'
}: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0
  return (
    <div className="w-full bg-neutral-800 rounded-full h-1.5 mt-1">
      <div
        className={`h-1.5 rounded-full ${color} transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function BookingSummaryPanel({ dateFrom, dateTo }: Props) {
  const [data, setData]       = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [open, setOpen]       = useState(true)

  useEffect(() => {
    if (!dateFrom || !dateTo) return

    async function fetchSummary() {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
        const res = await fetch(`/api/admin/bookings/summary?${params}`)
        if (!res.ok) {
          const e = await res.json()
          setError(e.error ?? 'Gagal memuat ringkasan')
          return
        }
        setData(await res.json())
      } catch {
        setError('Gagal terhubung ke server')
      } finally {
        setLoading(false)
      }
    }

    fetchSummary()
  }, [dateFrom, dateTo])

  if (loading) return (
    <div className="glass rounded-2xl border border-neutral-800/50 p-4 mb-6 animate-pulse">
      <div className="h-4 bg-neutral-800 rounded w-48 mb-3" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 bg-neutral-800 rounded-xl" />
        ))}
      </div>
    </div>
  )

  if (error) return (
    <div className="glass rounded-2xl border border-red-500/20 bg-red-500/5 p-3 mb-6 text-sm text-red-400">
      ⚠️ {error}
    </div>
  )

  if (!data) return null

  const { ringkasan, rekapBarber, rekapPembayaran, rekapSumber } = data
  const maxBarberPendapatan = Math.max(...rekapBarber.map(b => b.pendapatan), 1)

  return (
    <div className="glass rounded-2xl border border-neutral-800/50 mb-6 overflow-hidden">

      {/* Header toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-neutral-800/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold text-white">📊 Ringkasan Laporan</span>
          <span className="text-xs text-neutral-500 font-mono">
            {data.periode.dari} → {data.periode.sampai}
          </span>
        </div>
        <span className="text-neutral-500 text-xs">
          {open ? '▲ Sembunyikan' : '▼ Tampilkan'}
        </span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 border-t border-neutral-800/50">

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4">

            {/* Total Pendapatan */}
            <div className="rounded-xl bg-primary/10 border border-primary/20 p-3.5">
              <p className="text-[11px] text-neutral-400 mb-1.5 font-medium uppercase tracking-wider">
                Total Pendapatan
              </p>
              <p className="text-xl font-bold text-primary leading-tight">
                {formatRupiah(ringkasan.totalPendapatan)}
              </p>
            </div>

            {/* Transaksi Selesai */}
            <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-3.5">
              <p className="text-[11px] text-neutral-400 mb-1.5 font-medium uppercase tracking-wider">
                Transaksi Selesai
              </p>
              <p className="text-xl font-bold text-green-400 leading-tight">
                {ringkasan.totalTransaksi}
                <span className="text-xs font-normal text-neutral-500 ml-1">trx</span>
              </p>
            </div>

            {/* Rata-rata per transaksi */}
            <div className="rounded-xl bg-neutral-800/60 border border-neutral-700/50 p-3.5">
              <p className="text-[11px] text-neutral-400 mb-1.5 font-medium uppercase tracking-wider">
                Rata-rata / Trx
              </p>
              <p className="text-xl font-bold text-white leading-tight">
                {formatRupiah(ringkasan.rataRataPerTransaksi)}
              </p>
            </div>

            {/* Dibatalkan / Pending */}
            <div className="rounded-xl bg-red-500/8 border border-red-500/20 p-3.5">
              <p className="text-[11px] text-neutral-400 mb-1.5 font-medium uppercase tracking-wider">
                Batal / Pending
              </p>
              <p className="text-xl font-bold text-red-400 leading-tight">
                {ringkasan.totalDibatalkan}
                <span className="text-xs font-normal text-neutral-500 mx-1">/</span>
                <span className="text-yellow-400">{ringkasan.totalPending}</span>
              </p>
            </div>
          </div>

          {/* Rekap Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Rekap Per Barber */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
              <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                💈 Per Barber
              </p>
              {rekapBarber.length === 0 ? (
                <p className="text-xs text-neutral-600">Tidak ada data</p>
              ) : (
                <div className="space-y-3">
                  {rekapBarber.map(b => (
                    <div key={b.nama}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white font-medium truncate max-w-[120px]">
                          {b.nama}
                        </span>
                        <div className="text-right">
                          <span className="text-sm font-semibold text-primary">
                            {formatRupiah(b.pendapatan)}
                          </span>
                          <span className="text-xs text-neutral-500 ml-1">({b.total}x)</span>
                        </div>
                      </div>
                      <ProgressBar value={b.pendapatan} max={maxBarberPendapatan} color="bg-primary" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Rekap Per Metode Bayar */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
              <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                💳 Metode Bayar
              </p>
              {rekapPembayaran.length === 0 ? (
                <p className="text-xs text-neutral-600">Tidak ada data</p>
              ) : (
                <div className="space-y-3">
                  {rekapPembayaran.map(p => {
                    const pct = ringkasan.totalPendapatan > 0
                      ? Math.round((p.total / ringkasan.totalPendapatan) * 100)
                      : 0
                    const colorMap: Record<string, string> = {
                      cash: 'bg-green-500',
                      qris: 'bg-blue-500',
                      transfer: 'bg-purple-500',
                    }
                    return (
                      <div key={p.method}>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-white">{labelPayment(p.method)}</span>
                          <div className="text-right">
                            <span className="text-sm font-semibold text-white">
                              {formatRupiah(p.total)}
                            </span>
                            <span className="text-xs text-neutral-500 ml-1">{pct}%</span>
                          </div>
                        </div>
                        <ProgressBar
                          value={p.total}
                          max={ringkasan.totalPendapatan}
                          color={colorMap[p.method] ?? 'bg-primary'}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Rekap Per Sumber */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
              <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                📡 Asal Transaksi
              </p>
              {rekapSumber.length === 0 ? (
                <p className="text-xs text-neutral-600">Tidak ada data</p>
              ) : (
                <div className="space-y-3">
                  {rekapSumber.map(s => {
                    const pct = ringkasan.totalTransaksi > 0
                      ? Math.round((s.total / ringkasan.totalTransaksi) * 100)
                      : 0
                    const colorMap: Record<string, string> = {
                      online: 'bg-blue-500',
                      pos_kasir: 'bg-orange-500',
                      telegram_walk_in: 'bg-orange-400',
                      walk_in: 'bg-yellow-500',
                    }
                    return (
                      <div key={s.source}>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-white">{labelSource(s.source)}</span>
                          <div className="text-right">
                            <span className="text-sm font-semibold text-white">{s.total}x</span>
                            <span className="text-xs text-neutral-500 ml-1">{pct}%</span>
                          </div>
                        </div>
                        <ProgressBar
                          value={s.total}
                          max={ringkasan.totalTransaksi}
                          color={colorMap[s.source] ?? 'bg-primary'}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
