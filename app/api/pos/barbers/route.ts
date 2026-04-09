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

    if (payload.barberRole !== 'cashier') {
      return NextResponse.json({ error: 'Hanya kasir sentral yang bisa mengakses' }, { status: 403 })
    }

    const { data: barbers, error } = await supabaseAdmin
      .from('barbers')
      .select('id, name, role')
      .eq('tenant_id', payload.tenantId)
      .eq('is_active', true)
      .eq('role', 'barber')
      .order('name')

    if (error) {
      return NextResponse.json({ error: 'Gagal mengambil barber' }, { status: 500 })
    }

    return NextResponse.json({ barbers: barbers || [] })
  } catch (error: any) {
    console.error('Error GET /api/pos/barbers:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan sistem' }, { status: 500 })
  }
}
