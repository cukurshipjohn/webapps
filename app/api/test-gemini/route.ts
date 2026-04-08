import { NextResponse } from 'next/server'
import { parseOrderFromText } from '@/lib/nlp-kasir'

export async function GET() {
  const testResult = await parseOrderFromText(
    'Budi potong sama beli pomade',
    [{ id: 'barber-1', name: 'Mas Abdi' }],
    [
      { id: 'svc-1', name: 'Potong', price: 35000, price_type: 'fixed', price_min: null, price_max: null },
      { id: 'svc-2', name: 'Pomade', price: 50000, price_type: 'fixed', price_min: null, price_max: null },
    ],
    false
  )

  console.log('[TEST GEMINI NLP]:', testResult)

  return NextResponse.json(testResult)
}
