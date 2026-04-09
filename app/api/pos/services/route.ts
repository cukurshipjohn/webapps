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

    const { data: services, error } = await supabaseAdmin
      .from('services')
      .select('id, name, price, price_min, price_max, price_type, duration_minutes, service_type, is_active')
      .eq('tenant_id', payload.tenantId)
      .eq('is_active', true)
      .order('service_type')
      .order('name')

    if (error) {
      console.error('Database error in GET /api/pos/services:', error)
      return NextResponse.json({ error: 'Gagal mengambil layanan' }, { status: 500 })
    }

    return NextResponse.json({ services: services || [] })
  } catch (error: any) {
    console.error('Error GET /api/pos/services:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan sistem' }, { status: 500 })
  }
}
