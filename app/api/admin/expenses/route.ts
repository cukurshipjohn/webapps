import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getUserFromToken, requireRole } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = getUserFromToken(req)
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    requireRole(['owner', 'superadmin'], user.role)
    const tenantId = user.tenant_id
    if (!tenantId) return NextResponse.json({ message: 'Tenant tidak ditemukan' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || 'all'
    const barber_id = searchParams.get('barber_id')
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    let query = supabaseAdmin
      .from('barber_expenses')
      .select(`
        id, category, description, amount,
        receipt_url, status, rejection_reason,
        submitted_at, reviewed_at,
        barbers ( id, name ),
        users!barber_expenses_reviewed_by_fkey ( name )
      `, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('submitted_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (status !== 'all') {
      query = query.eq('status', status)
    }
    if (barber_id) {
      query = query.eq('barber_id', barber_id)
    }

    const { data: expenses, count, error } = await query

    if (error) {
      console.error('[GET /admin/expenses] Query error:', error)
      return NextResponse.json({ error: 'Gagal memuat data' }, { status: 500 })
    }

    // Summary query
    const { data: summary } = await supabaseAdmin
      .from('barber_expenses')
      .select('status, amount')
      .eq('tenant_id', tenantId)

    const pendingCount = summary?.filter(s => s.status === 'pending').length || 0
    const pendingTotal = summary?.filter(s => s.status === 'pending').reduce((a, b) => a + (b.amount || 0), 0) || 0
    const approvedTotal = summary?.filter(s => s.status === 'approved').reduce((a, b) => a + (b.amount || 0), 0) || 0

    return NextResponse.json({
      expenses: expenses || [],
      total_count: count || 0,
      summary: {
        pending_count: pendingCount,
        pending_total: pendingTotal,
        approved_total: approvedTotal,
      }
    }, { status: 200 })

  } catch (error) {
    console.error('[GET /admin/expenses] Unexpected error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan internal' }, { status: 500 })
  }
}
