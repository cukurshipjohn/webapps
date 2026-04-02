import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Mapping health score ke label deskriptif
function getHealthLabel(score: number): string {
  if (score <= 30) return 'dormant';
  if (score <= 60) return 'at_risk';
  if (score <= 80) return 'active';
  return 'thriving';
}

/**
 * Menghitung health score (0-100) berdasarkan aktivitas tenant:
 * - Base: jumlah total event dalam `days` hari (max 50 poin)
 * - +20 poin jika ada owner_login dalam 7 hari terakhir
 * - +20 poin jika ada booking_created dalam 7 hari terakhir
 * - +10 poin bonus jika total_events > 20
 */
function calculateHealthScore(params: {
  totalEvents: number;
  hasRecentLogin: boolean;
  hasRecentBooking: boolean;
}): number {
  const { totalEvents, hasRecentLogin, hasRecentBooking } = params;

  let score = 0;

  // Base score dari volume aktivitas dalam periode (max 50 poin)
  score += Math.min(totalEvents * 2, 50);

  // Bonus aktifnya owner: login dalam 7 hari terakhir
  if (hasRecentLogin) score += 20;

  // Bonus bisnis berjalan: ada booking masuk dalam 7 hari terakhir
  if (hasRecentBooking) score += 20;

  // Bonus volume tinggi: lebih dari 20 event = tenant benar-benar aktif
  if (totalEvents > 20) score += 10;

  // Cap di 100
  return Math.min(score, 100);
}

/**
 * GET /api/superadmin/tenants/activity?tenant_id=xxx&days=30
 *
 * Mengambil ringkasan aktivitas tenant beserta health score.
 * Hanya bisa diakses oleh superadmin.
 */
export async function GET(request: NextRequest) {
  try {
    // ── 1. Auth Guard: Hanya superadmin ──────────────────────────────
    const authUser = getUserFromToken(request);

    if (!authUser) {
      return NextResponse.json({ message: 'Unauthorized: Token tidak valid atau tidak ada.' }, { status: 401 });
    }

    try {
      requireRole(['superadmin'], authUser.role);
    } catch {
      return NextResponse.json({ message: 'Forbidden: Hanya superadmin yang dapat mengakses endpoint ini.' }, { status: 403 });
    }

    // ── 2. Parse Query Params ─────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenant_id');
    const daysParam = searchParams.get('days');
    const days = daysParam ? Math.max(1, Math.min(parseInt(daysParam, 10) || 30, 365)) : 30;

    if (!tenantId) {
      return NextResponse.json({ message: 'Parameter tenant_id wajib diisi.' }, { status: 400 });
    }

    // Hitung batas waktu periode yang diminta
    const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Hitung batas 7 hari terakhir (untuk bonus health score)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // ── 3. Query Aktivitas Tenant ─────────────────────────────────────
    const { data: events, error: eventsError } = await supabaseAdmin
      .from('tenant_activity_events')
      .select('event_type, created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', periodStart)
      .order('created_at', { ascending: false });

    if (eventsError) {
      console.error('[TenantActivity] Query error:', eventsError.message);
      return NextResponse.json({ message: 'Gagal mengambil data aktivitas.' }, { status: 500 });
    }

    // ── 4. Agregasi events_by_type ────────────────────────────────────
    const eventsByType: Record<string, number> = {};
    for (const event of events ?? []) {
      eventsByType[event.event_type] = (eventsByType[event.event_type] ?? 0) + 1;
    }

    const totalEvents = events?.length ?? 0;
    const lastActivityAt = events?.[0]?.created_at ?? null;

    // ── 5. Cek aktivitas dalam 7 hari terakhir (untuk health score bonus) ──
    const hasRecentLogin = (events ?? []).some(
      (e) => e.event_type === 'owner_login' && e.created_at >= sevenDaysAgo
    );

    const hasRecentBooking = (events ?? []).some(
      (e) => e.event_type === 'booking_created' && e.created_at >= sevenDaysAgo
    );

    // ── 6. Hitung Health Score ────────────────────────────────────────
    const healthScore = calculateHealthScore({ totalEvents, hasRecentLogin, hasRecentBooking });
    const healthLabel = getHealthLabel(healthScore);

    // ── 7. Return Response ────────────────────────────────────────────
    return NextResponse.json({
      tenant_id: tenantId,
      period_days: days,
      total_events: totalEvents,
      last_activity_at: lastActivityAt,
      events_by_type: eventsByType,
      health_score: healthScore,
      health_label: healthLabel,
    });

  } catch (error: any) {
    console.error('[TenantActivity] Unexpected error:', error);
    return NextResponse.json(
      { message: error.message || 'Terjadi kesalahan internal.' },
      { status: 500 }
    );
  }
}
