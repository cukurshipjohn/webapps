/**
 * Phone normalization utilities for CukurShip POS
 *
 * Menghasilkan semua kemungkinan format nomor HP agar query ke database
 * bisa menemukan data yang tersimpan dalam format apa pun (08..., 628..., 8..., +628...).
 */

/**
 * Normalisasi nomor HP ke format 628...
 * Input: "0878...", "8778...", "+628...", "628..."
 * Output: "6287836993805"
 */
export function normalizePhone(raw: string): string {
  let phone = raw.replace(/\D/g, '') // hapus semua selain angka
  if (phone.startsWith('08')) {
    phone = '628' + phone.slice(2)
  } else if (phone.startsWith('0')) {
    phone = '62' + phone.slice(1)
  } else if (phone.startsWith('8')) {
    phone = '628' + phone.slice(1)
  }
  // jika sudah 628... biarkan
  return phone
}

/**
 * Kembalikan semua variasi format nomor untuk dipakai di OR query Supabase.
 * Input: nomor apa pun
 * Output: ["087836993805", "6287836993805", "7836993805"]
 *
 * Tujuannya agar query bisa menemukan nomor yang disimpan dalam format lain.
 */
export function phoneVariants(raw: string): string[] {
  const stripped = raw.replace(/\D/g, '')

  // Dapatkan digit inti (tanpa awalan 0, 62, 08, 628)
  let core = stripped
  if (core.startsWith('628')) core = core.slice(3)
  else if (core.startsWith('62')) core = core.slice(2)
  else if (core.startsWith('08')) core = core.slice(2)
  else if (core.startsWith('0')) core = core.slice(1)
  else if (core.startsWith('8')) core = core.slice(1)

  const variants = new Set<string>([
    `628${core}`,      // format internasional
    `08${core}`,       // format lokal Indonesia
    `8${core}`,        // tanpa awalan
  ])

  return Array.from(variants)
}
