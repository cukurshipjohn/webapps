import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getUserFromToken, requireRole } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
      const user = getUserFromToken(req)
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      requireRole(['superadmin'], user.role)

      const { searchParams } = new URL(req.url)
      const tenantId = searchParams.get('tenant_id')

      let query = supabaseAdmin
        .from('churn_surveys')
        .select(`
          id, reason, detail_note, 
          recorded_by, recorded_at,
          tenants ( id, shop_name )
        `)
        .order('recorded_at', { ascending: false })

      if (tenantId) query = query.eq('tenant_id', tenantId)

      const { data } = await query
      return NextResponse.json({ data })
  } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 403 })
  }
}

export async function POST(req: NextRequest) {
  try {
      const user = getUserFromToken(req)
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      requireRole(['superadmin'], user.role)

      const body = await req.json()
      const { tenant_id, reason, detail_note } = body

      if (!tenant_id || !reason) {
        return NextResponse.json(
          { error: 'tenant_id dan reason wajib diisi' },
          { status: 400 }
        )
      }

      const { data, error } = await supabaseAdmin
        .from('churn_surveys')
        .insert({
          tenant_id,
          reason,
          detail_note: detail_note ?? null,
          recorded_by: 'superadmin',
        })
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ data }, { status: 201 })
  } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 403 })
  }
}
