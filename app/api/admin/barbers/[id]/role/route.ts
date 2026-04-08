import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin }            from '@/lib/supabase'
import { getUserFromToken }         from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req:     NextRequest,
  { params }: { params: { id: string } }
) {
  const user = getUserFromToken(req)
  if (!user || !['owner', 'superadmin'].includes(user.role)) {
    return NextResponse.json(
      { error: 'Unauthorized' }, { status: 401 }
    )
  }

  const tenantId = req.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json(
      { error: 'Tenant tidak ditemukan' }, { status: 400 }
    )
  }

  const body = await req.json()
  const newRole = body.role

  if (!['barber', 'cashier'].includes(newRole)) {
    return NextResponse.json(
      { error: 'Role tidak valid' }, { status: 400 }
    )
  }

  // Verifikasi barber milik tenant ini:
  const { data: barber } = await supabaseAdmin
    .from('barbers')
    .select('id, name, role')
    .eq('id', params.id)
    .eq('tenant_id', tenantId)
    .single()

  if (!barber) {
    return NextResponse.json(
      { error: 'Barber tidak ditemukan' }, { status: 404 }
    )
  }

  const { error } = await supabaseAdmin
    .from('barbers')
    .update({ role: newRole })
    .eq('id', params.id)
    .eq('tenant_id', tenantId)

  if (error) {
    return NextResponse.json(
      { error: error.message }, { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    barber_id: params.id,
    role: newRole,
  })
}
