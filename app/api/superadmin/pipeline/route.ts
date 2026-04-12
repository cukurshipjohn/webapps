import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getUserFromToken, requireRole } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    // FIX #3: getUserFromToken adalah fungsi synchronous — tidak perlu await
    const user = getUserFromToken(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    requireRole(['superadmin'], user.role)

    const { searchParams } = new URL(req.url)
    const stage = searchParams.get('stage') ?? 'all'
    const days  = parseInt(searchParams.get('days') ?? '30')

    const now = new Date()

    let query = supabaseAdmin
      .from('tenants')
      .select(`
        id,
        shop_name,
        slug,
        plan,
        plan_expires_at,
        is_active,
        timezone,
        owner_user_id,
        created_at,
        users!owner_user_id ( 
          name, 
          phone 
        ),
        superadmin_followups (
          id,
          case_type,
          outcome,
          created_at,
          done_at
        )
      `)
      // FIX #1 & #2: 'name' → 'shop_name', 'plan_id' → 'plan'
      // Kedua kolom ini tidak ada di tabel tenants, menyebabkan PostgreSQL
      // melempar error dan endpoint mengembalikan 500 setiap kali diakses.
      .order('plan_expires_at', { ascending: true })

    if (stage === 'expiring_soon') {
      const threshold = new Date(now.getTime() + days * 24*60*60*1000).toISOString()
      query = query
        .eq('is_active', true)
        .gt('plan_expires_at', now.toISOString())
        .lte('plan_expires_at', threshold)
    } else if (stage === 'churned') {
      query = query
        .eq('is_active', true)
        .lt('plan_expires_at', now.toISOString())
    } else if (stage === 'at_risk') {
      query = query.eq('is_active', true)
    } else if (stage === 'healthy') {
      const threshold = new Date(now.getTime() + 30 * 24*60*60*1000).toISOString()
      query = query
        .eq('is_active', true)
        .gt('plan_expires_at', threshold)
    }

    const { data: tenants, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const tenantIds = tenants?.map(t => t.id) ?? []
    let bookingCountMap: Record<string, number> = {}

    if (tenantIds.length > 0) {
      const since14Days = new Date(now.getTime() - 14 * 24*60*60*1000).toISOString()
      const { data: bookingStats } = await supabaseAdmin
        .from('bookings')
        .select('tenant_id, id')
        .in('tenant_id', tenantIds)
        .eq('status', 'completed')
        .gte('created_at', since14Days)

      bookingCountMap = (bookingStats ?? []).reduce(
        (acc, b) => {
          acc[b.tenant_id] = (acc[b.tenant_id] ?? 0) + 1
          return acc
        },
        {} as Record<string, number>
      )
    }

    const enriched = (tenants ?? []).map(tenant => {
      const bookingsLast14 = bookingCountMap[tenant.id] ?? 0
      const expiresAt = tenant.plan_expires_at ? new Date(tenant.plan_expires_at) : null
      const daysUntilExpiry = expiresAt
        ? Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null

      let tenantStage: string
      if (expiresAt && expiresAt < now) {
        tenantStage = 'churned'
      } else if (daysUntilExpiry !== null && daysUntilExpiry <= 7) {
        tenantStage = 'expiring_soon'
      } else if (bookingsLast14 === 0) {
        tenantStage = 'at_risk'
      } else {
        tenantStage = 'healthy'
      }

      const pendingFollowups = (tenant.superadmin_followups ?? []).filter(f => (f as any).outcome === 'pending').length

      return {
        ...tenant,
        bookings_last_14_days: bookingsLast14,
        days_until_expiry:     daysUntilExpiry,
        stage:                 tenantStage,
        pending_followups:     pendingFollowups,
        last_followup_at:      tenant.superadmin_followups?.at(-1)?.created_at ?? null,
      }
    })

    const result = stage === 'at_risk' ? enriched.filter(t => t.stage === 'at_risk') : enriched

    const summary = {
      total:          enriched.length,
      expiring_soon:  enriched.filter(t => t.stage === 'expiring_soon').length,
      at_risk:        enriched.filter(t => t.stage === 'at_risk').length,
      churned:        enriched.filter(t => t.stage === 'churned').length,
      healthy:        enriched.filter(t => t.stage === 'healthy').length,
    }

    return NextResponse.json({ data: result, summary })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 403 })
  }
}
