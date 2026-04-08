import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from '@google/generative-ai'

// ─── INIT CLIENT ─────────────────────────────
const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY ?? ''
)

const model = genAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
  // gemini-1.5-flash: cepat, murah, cukup untuk
  // task parsing JSON sederhana seperti ini.
  // Alternatif jika butuh lebih akurat:
  // 'gemini-1.5-pro' (lebih lambat & mahal)

  generationConfig: {
    temperature:     0,
    // temperature 0 = deterministik, konsisten
    maxOutputTokens: 512,
    responseMimeType: 'application/json',
    // Force output JSON — sama seperti json_object
    // mode di OpenAI
  },

  safetySettings: [
    // Matikan semua filter safety untuk use case
    // bisnis (nama orang & layanan bisa kena filter)
    {
      category:  HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category:  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category:  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category:  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
  ],
})

// ─── RATE LIMITER ────────────────────────────
const lastCallMap = new Map<string, number>()
const MIN_INTERVAL_MS = 3000 // 3 detik per chatId

export function isRateLimited(chatId: string): boolean {
  const last = lastCallMap.get(chatId) ?? 0
  const now  = Date.now()
  if (now - last < MIN_INTERVAL_MS) return true
  lastCallMap.set(chatId, now)
  return false
}

// ─── PRE-FILTER ──────────────────────────────
export function looksLikeOrder(
  text:         string,
  barberNames:  string[],
  serviceNames: string[]
): boolean {
  if (text.length < 8)       return false
  if (text.startsWith('/'))  return false

  const textLower = text.toLowerCase()

  const allKeywords = [
    ...barberNames.map(n => n.toLowerCase()),
    ...serviceNames.map(n => n.toLowerCase()),
  ]

  return allKeywords.some(keyword => {
    if (keyword.length < 4) return false
    return textLower.includes(keyword.slice(0, 4))
  })
}

// ─── TYPES ───────────────────────────────────
export interface NLPResult {
  isValid:          boolean
  customer_name:    string | null
  barber_id:        string | null
  barber_name:      string | null
  services: Array<{
    service_id:  string
    fixed_price: number
  }>
  ambiguous_barber: boolean
  reason:           string | null
}

// ─── MAIN PARSER ─────────────────────────────
export async function parseOrderFromText(
  text:     string,
  barbers:  Array<{ id: string; name: string }>,
  services: Array<{
    id:         string
    name:       string
    price:      number
    price_type: string
    price_min:  number | null
    price_max:  number | null
  }>,
  isCentralized: boolean
): Promise<NLPResult> {

  const FALLBACK: NLPResult = {
    isValid:          false,
    customer_name:    null,
    barber_id:        null,
    barber_name:      null,
    services:         [],
    ambiguous_barber: false,
    reason:           'Gagal memproses dengan AI',
  }

  // Guard: pastikan API key tersedia
  if (!process.env.GEMINI_API_KEY) {
    return { ...FALLBACK, reason: 'GEMINI_API_KEY tidak tersedia' }
  }

  // Susun prompt:
  const prompt = `
Kamu adalah parser order kasir barbershop Indonesia.
Tugasmu: ekstrak informasi order dari teks bebas kasir.
Kembalikan HANYA JSON valid sesuai format di bawah.

DATA BARBER TERSEDIA:
${barbers.map(b =>
  `- id: "${b.id}", nama: "${b.name}"`
).join('\n')}

DATA LAYANAN TERSEDIA:
${services.map(s => {
  const harga = s.price_type === 'fixed'
    ? `Rp ${s.price} (fixed)`
    : s.price_type === 'range'
    ? `Rp ${s.price_min}–${s.price_max} (range, pilih tengah)`
    : 'harga custom (tanya kasir)'
  return `- id: "${s.id}", nama: "${s.name}", harga: ${harga}`
}).join('\n')}

MODE: ${isCentralized
  ? 'KASIR SENTRAL — barber_id WAJIB diisi dari daftar barber'
  : 'BARBER SENDIRI — barber_id isi null'
}

ATURAN PENTING:
1. Layanan range → fixed_price = nilai TENGAH dari range
2. Nama barber cocok >1 orang → ambiguous_barber: true, barber_id: null
3. Tidak ada nama pelanggan → customer_name: "Pelanggan Umum"
4. Tidak ada layanan cocok → isValid: false
5. Mode sentral tapi barber tidak cocok → isValid: false
6. Boleh ada lebih dari 1 layanan dalam satu order

FORMAT JSON WAJIB (kembalikan tepat seperti ini):
{
  "isValid": true,
  "customer_name": "nama atau Pelanggan Umum",
  "barber_id": "id atau null",
  "barber_name": "nama atau null",
  "ambiguous_barber": false,
  "services": [
    { "service_id": "id", "fixed_price": 35000 }
  ],
  "reason": null
}

TEKS KASIR:
"${text}"
`.trim()

  try {
    const result   = await model.generateContent(prompt)
    const response = result.response
    const rawText  = response.text()

    // Gemini kadang wrap JSON dengan markdown code block
    // meskipun responseMimeType sudah di-set.
    // Bersihkan jaga-jaga:
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/m, '')  // hapus opening fence
      .replace(/\s*```\s*$/m, '')        // hapus closing fence
      .replace(/[\u0000-\u001F\u007F]/g, // hapus control chars
        (c) => c === '\n' || c === '\r' || c === '\t' 
               ? c : ''
      )
      .trim()

    // Tambah validasi: pastikan hasil adalah JSON object
    if (!cleaned.startsWith('{')) {
      console.error('[NLP Gemini] Response bukan JSON object:', 
        cleaned.slice(0, 100))
      return {
        ...FALLBACK,
        reason: 'Response AI tidak dalam format JSON',
      }
    }

    const parsed = JSON.parse(cleaned) as NLPResult

    // Validasi field wajib ada:
    if (typeof parsed.isValid !== 'boolean') {
      return {
        ...FALLBACK,
        reason: 'Format JSON dari AI tidak lengkap',
      }
    }

    return parsed

  } catch (err) {
    console.error('[NLP Gemini Error]', err)
    return {
      ...FALLBACK,
      reason: err instanceof Error
        ? err.message
        : 'Unknown error dari Gemini',
    }
  }
}
