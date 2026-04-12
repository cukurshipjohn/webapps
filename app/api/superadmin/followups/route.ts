import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getUserFromToken, requireRole } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
      // FIX: getUserFromToken adalah sync function — tidak perlu await
      const user = getUserFromToken(req)
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      requireRole(['superadmin'], user.role)

      const { searchParams } = new URL(req.url)
      const tenantId  = searchParams.get('tenant_id')
      const caseType  = searchParams.get('case_type')
      const outcome   = searchParams.get('outcome')
      const startDate = searchParams.get('start_date')
      const endDate   = searchParams.get('end_date')
      const limit     = parseInt(searchParams.get('limit') ?? '100') // naikkan default dlm batas wajar

      let query = supabaseAdmin
        .from('superadmin_followups')
        .select(`
          id, case_type, channel, note, 
          outcome, scheduled_at, done_at,
          created_at, updated_at,
          tenants ( id, shop_name, slug ),
          users!admin_id ( name )
        `)
        // FIX: 'name' → 'shop_name' di join tenants
        // Kolom 'name' tidak ada di tabel tenants (nama kolom aktual: shop_name)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (tenantId) query = query.eq('tenant_id', tenantId)
      if (caseType) query = query.eq('case_type', caseType)
      if (outcome)  query = query.eq('outcome', outcome)
      if (startDate) query = query.gte('created_at', startDate)
      if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          query = query.lte('created_at', end.toISOString())
      }

      const { data, error } = await query

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ data })
  } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 403 })
  }
}

export async function POST(req: NextRequest) {
  try {
      // FIX: getUserFromToken adalah sync function — tidak perlu await
      const user = getUserFromToken(req)
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      requireRole(['superadmin'], user.role)

      const body = await req.json()
      const { 
        tenant_id, case_type, channel, 
        note, scheduled_at 
      } = body

      if (!tenant_id || !case_type || !channel) {
        return NextResponse.json(
          { error: 'tenant_id, case_type, channel wajib diisi' },
          { status: 400 }
        )
      }

      const { data, error } = await supabaseAdmin
        .from('superadmin_followups')
        .insert({
          tenant_id,
          admin_id:     user.userId,
          case_type,
          channel,
          note:         note ?? null,
          outcome:      'pending',
          scheduled_at: scheduled_at ?? null,
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
