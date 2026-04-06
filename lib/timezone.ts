// ─── KONSTANTA TIMEZONE INDONESIA ─────────────────
export const TIMEZONE_OPTIONS = [
  {
    value: 'Asia/Jakarta',
    label: 'WIB — Waktu Indonesia Barat (UTC+7)',
    shortLabel: 'WIB',
    offset: '+07:00',
    regions: 'Jawa, Sumatra, Kalimantan Barat & Tengah',
  },
  {
    value: 'Asia/Makassar',
    label: 'WITA — Waktu Indonesia Tengah (UTC+8)',
    shortLabel: 'WITA',
    offset: '+08:00',
    regions: 'Bali, NTB, NTT, Kalimantan Timur, Sulawesi',
  },
  {
    value: 'Asia/Jayapura',
    label: 'WIT — Waktu Indonesia Timur (UTC+9)',
    shortLabel: 'WIT',
    offset: '+09:00',
    regions: 'Maluku, Papua',
  },
] as const

export type IndonesiaTimezone =
  | 'Asia/Jakarta'
  | 'Asia/Makassar'
  | 'Asia/Jayapura'

export function getTimezoneLabel(tz: string): string {
  return TIMEZONE_OPTIONS.find(t => t.value === tz)
    ?.shortLabel ?? 'WIB'
}

export function getTimezoneOffset(tz: string): string {
  return TIMEZONE_OPTIONS.find(t => t.value === tz)
    ?.offset ?? '+07:00'
}

// ─── FORMAT TANGGAL DALAM TIMEZONE TENANT ─────────

/**
 * Format ISO timestamp ke string tanggal lokal tenant
 * Contoh: formatInTZ('2026-04-06T01:30:00Z', 'Asia/Makassar')
 * Output: "06/04/2026, 09.30" (WITA = UTC+8)
 */
export function formatInTZ(
  isoString: string | null | undefined,
  timezone: string,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!isoString) return '-'

  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }

  return new Date(isoString).toLocaleString(
    'id-ID',
    options ?? defaultOptions
  )
}

/**
 * Format hanya tanggal (tanpa jam)
 */
export function formatDateInTZ(
  isoString: string | null | undefined,
  timezone: string
): string {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleDateString('id-ID', {
    timeZone: timezone,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Format hanya jam
 */
export function formatTimeInTZ(
  isoString: string | null | undefined,
  timezone: string
): string {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleTimeString('id-ID', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Konversi "YYYY-MM-DD" + timezone tenant
 * ke rentang UTC untuk query database
 *
 * Contoh penggunaan di API:
 * const { start, end } = dateRangeToUTC('2026-04-06', 'Asia/Makassar')
 * query.gte('created_at', start).lte('created_at', end)
 */
export function dateRangeToUTC(
  dateStr: string,  // 'YYYY-MM-DD' dalam timezone tenant
  timezone: string
): { start: string; end: string } {
  const offsetMap: Record<string, number> = {
    'Asia/Jakarta':  7,
    'Asia/Makassar': 8,
    'Asia/Jayapura': 9,
  }
  const offsetHours = offsetMap[timezone] ?? 7

  const startLocal = new Date(`${dateStr}T00:00:00`)
  const endLocal   = new Date(`${dateStr}T23:59:59`)

  // Konversi ke UTC
  const startUTC = new Date(
    startLocal.getTime() - offsetHours * 60 * 60 * 1000
  )
  const endUTC = new Date(
    endLocal.getTime() - offsetHours * 60 * 60 * 1000
  )

  return {
    start: startUTC.toISOString(),
    end:   endUTC.toISOString(),
  }
}

/**
 * Ambil "hari ini" dalam timezone tenant
 * Return format 'YYYY-MM-DD'
 */
export function getTodayInTZ(timezone: string): string {
  return new Date().toLocaleDateString('sv-SE', {
    timeZone: timezone,
    // 'sv-SE' locale menghasilkan format YYYY-MM-DD
  })
}

/**
 * Ambil jam operasional "sekarang" dalam timezone tenant
 * Untuk cek apakah toko sedang buka
 */
export function getCurrentHourInTZ(timezone: string): number {
  return parseInt(
    new Date().toLocaleString('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    })
  )
}

/**
 * Untuk bot Telegram — format struk
 */
export function formatReceiptDateTime(
  timezone: string
): string {
  const now = new Date()
  const label = getTimezoneLabel(timezone)

  const tanggal = now.toLocaleDateString('id-ID', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const jam = now.toLocaleTimeString('id-ID', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  })

  return `${tanggal}, ${jam} ${label}`
}
