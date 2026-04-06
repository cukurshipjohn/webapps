import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// ─── KONSTANTA THRESHOLD ──────────────────────
const RENEWAL_WARN_DAYS   = [7, 14, 30]
const INACTIVE_DAYS       = 14
const ZERO_BOOKING_DAYS   = 7

export async function GET(req: NextRequest) {

  // Guard: hanya boleh dipanggil Vercel Cron
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: 'Unauthorized' }, { status: 401 }
    )
  }

  const now    = new Date()
  const report = {
    scanned:   0,
    renewal:   0,
    inactive:  0,
    churn:     0,
    skipped:   0,
    errors:    [] as string[],
  }

  // ── AMBIL SEMUA TENANT AKTIF ─────────────────
  const { data: tenants, error } = await supabaseAdmin
    .from('tenants')
    .select(`
      id,
      name,
      plan_id,
      plan_expires_at,
      is_active,
      timezone
    `)
    .eq('is_active', true)
    .not('plan_id', 'eq', 'trial')
  // Trial tidak perlu follow-up renewal

  if (error || !tenants) {
    return NextResponse.json(
      { error: 'Failed to fetch tenants' },
      { status: 500 }
    )
  }

  for (const tenant of tenants) {
    report.scanned++

    try {
      // ── CEK 1: AKAN HABIS MASA AKTIF ─────────
      if (tenant.plan_expires_at) {
        const expiresAt  = new Date(tenant.plan_expires_at)
        const daysLeft   = Math.ceil(
          (expiresAt.getTime() - now.getTime()) 
          / (1000 * 60 * 60 * 24)
        )

        if (RENEWAL_WARN_DAYS.includes(daysLeft)) {
          // Cek apakah follow-up renewal hari ini
          // sudah ada (hindari duplikat):
          const { count } = await supabaseAdmin
            .from('superadmin_followups')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenant.id)
            .eq('case_type', 'renewal')
            .eq('outcome', 'pending')
            .gte('created_at', 
              new Date(now.getTime() - 24*60*60*1000)
                .toISOString()
            )

          if (!count || count === 0) {
            await supabaseAdmin
              .from('superadmin_followups')
              .insert({
                tenant_id:    tenant.id,
                admin_id:     process.env.SUPERADMIN_USER_ID,
                case_type:    'renewal',
                channel:      'whatsapp',
                note: `Otomatis: Langganan habis ${daysLeft} hari lagi (${new Date(tenant.plan_expires_at).toLocaleDateString('id-ID')})`,
                outcome:      'pending',
                scheduled_at: now.toISOString(),
              })
            report.renewal++
          } else {
            report.skipped++
          }
        }
      }

      // ── CEK 2: TIDAK ADA BOOKING SAMA SEKALI ──
      // dalam ZERO_BOOKING_DAYS hari terakhir
      const zeroBookingThreshold = new Date(
        now.getTime() - ZERO_BOOKING_DAYS * 24*60*60*1000
      ).toISOString()

      const { count: bookingCount } = await supabaseAdmin
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('status', 'completed')
        .gte('created_at', zeroBookingThreshold)

      if (bookingCount === 0) {
        // Cek apakah usage_check sudah ada 7 hari ini:
        const { count: existingCheck } = await supabaseAdmin
          .from('superadmin_followups')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .eq('case_type', 'usage_check')
          .eq('outcome', 'pending')
          .gte('created_at',
            new Date(now.getTime() - 7*24*60*60*1000)
              .toISOString()
          )

        if (!existingCheck || existingCheck === 0) {
          await supabaseAdmin
            .from('superadmin_followups')
            .insert({
              tenant_id:    tenant.id,
              admin_id:     process.env.SUPERADMIN_USER_ID,
              case_type:    'usage_check',
              channel:      'whatsapp',
              note: `Otomatis: Tidak ada transaksi selesai dalam ${ZERO_BOOKING_DAYS} hari terakhir`,
              outcome:      'pending',
              scheduled_at: now.toISOString(),
            })
          report.inactive++
        } else {
          report.skipped++
        }
      }

      // ── CEK 3: LANGGANAN HABIS TIDAK PERPANJANG
      // is_active=true tapi plan_expires_at sudah lewat
      if (
        tenant.plan_expires_at &&
        new Date(tenant.plan_expires_at) < now
      ) {
        const { count: existingChurn } = await supabaseAdmin
          .from('superadmin_followups')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .eq('case_type', 'churn')
          .gte('created_at',
            new Date(now.getTime() - 3*24*60*60*1000)
              .toISOString()
          )

        if (!existingChurn || existingChurn === 0) {
          await supabaseAdmin
            .from('superadmin_followups')
            .insert({
              tenant_id:    tenant.id,
              admin_id:     process.env.SUPERADMIN_USER_ID,
              case_type:    'churn',
              channel:      'whatsapp',
              note: `Otomatis: Langganan habis sejak ${new Date(tenant.plan_expires_at).toLocaleDateString('id-ID')}, belum perpanjang`,
              outcome:      'pending',
              scheduled_at: now.toISOString(),
            })
          report.churn++
        } else {
          report.skipped++
        }
      }

    } catch (err) {
      report.errors.push(
        `tenant ${tenant.id}: ${String(err)}`
      )
    }
  }

  return NextResponse.json({
    success: true,
    timestamp: now.toISOString(),
    report,
  })
}
