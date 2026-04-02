import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// ── Auth helper ──────────────────────────────────────────────────────────────
function authSuperAdmin(request: NextRequest) {
    const user = getUserFromToken(request);
    if (!user) return { error: NextResponse.json({ message: 'Unauthorized.' }, { status: 401 }) };
    if (user.role !== 'superadmin') return { error: NextResponse.json({ message: 'Forbidden: Superadmin only.' }, { status: 403 }) };
    return { user };
}

// ── GET /api/superadmin/tenants/pipeline ─────────────────────────────────────
export async function GET(request: NextRequest) {
    const { user, error: authErr } = authSuperAdmin(request);
    if (authErr) return authErr;

    try {
        // Ambil data tenant beserta relasinya menggunakan join + limit 1 di foreign table
        const { data: tenantsData, error: tenantsErr } = await supabaseAdmin
            .from('tenants')
            .select(`
                id, shop_name, slug, plan, plan_expires_at, is_active,
                users ( phone_number ),
                churn_surveys ( id ),
                superadmin_followups ( created_at ),
                tenant_activity_events ( created_at ),
                bookings ( created_at )
            `)
            .order('created_at', { foreignTable: 'superadmin_followups', ascending: false })
            .limit(1, { foreignTable: 'superadmin_followups' })
            .order('created_at', { foreignTable: 'tenant_activity_events', ascending: false })
            .limit(1, { foreignTable: 'tenant_activity_events' })
            .order('created_at', { foreignTable: 'bookings', ascending: false })
            .limit(1, { foreignTable: 'bookings' })
            .limit(1, { foreignTable: 'churn_surveys' });

        if (tenantsErr) throw tenantsErr;

        const summary = {
            healthy: 0,
            expiring_soon: 0,
            expired: 0,
            churned: 0,
            dormant: 0,
        };

        const now = new Date();
        const nowMs = now.getTime();

        const formattedTenants = (tenantsData || []).map((t: any) => {
            const planExpiresAt = t.plan_expires_at ? new Date(t.plan_expires_at) : null;
            let daysUntilExpiry = 999;
            if (planExpiresAt) {
                // Selisih hari = (Expiry - Now) / ms dalam sehari
                daysUntilExpiry = Math.ceil((planExpiresAt.getTime() - nowMs) / (1000 * 60 * 60 * 24));
            }

            const lastActivityAt = t.tenant_activity_events?.[0]?.created_at || null;
            const lastBookingAt = t.bookings?.[0]?.created_at || null;
            const hasChurnSurvey = Array.isArray(t.churn_surveys) && t.churn_surveys.length > 0;
            const lastFollowupAt = t.superadmin_followups?.[0]?.created_at || null;
            const ownerPhone = Array.isArray(t.users) 
                               ? t.users[0]?.phone_number 
                               : (t.users?.phone_number || null);

            let pipelineStage = 'unknown';

            if (t.is_active) {
                let isDormant = true;
                if (lastActivityAt) {
                    const activityDaysAgo = Math.floor((nowMs - new Date(lastActivityAt).getTime()) / (1000 * 60 * 60 * 24));
                    if (activityDaysAgo <= 14) isDormant = false;
                }

                if (isDormant) {
                    pipelineStage = 'dormant';
                    summary.dormant++;
                } else if (daysUntilExpiry > 14) {
                    pipelineStage = 'healthy';
                    summary.healthy++;
                } else {
                    pipelineStage = 'expiring_soon';
                    summary.expiring_soon++;
                }
            } else { // is_active === false
                if (hasChurnSurvey) {
                    pipelineStage = 'churned';
                    summary.churned++;
                } else if (planExpiresAt && planExpiresAt <= now) {
                    pipelineStage = 'expired';
                    summary.expired++;
                } else {
                    // Kasus edge-case (dinonaktifkan manual tapi belum exp)
                    pipelineStage = 'dormant';
                    summary.dormant++;
                }
            }

            return {
                id: t.id,
                shop_name: t.shop_name,
                slug: t.slug,
                plan: t.plan,
                plan_expires_at: t.plan_expires_at,
                days_until_expiry: daysUntilExpiry,
                owner_phone: ownerPhone,
                pipeline_stage: pipelineStage,
                last_activity_at: lastActivityAt,
                last_booking_at: lastBookingAt,
                has_churn_survey: hasChurnSurvey,
                last_followup_at: lastFollowupAt,
            };
        });

        // Urutkan default: expiring_soon -> expired -> dormant -> healthy -> churned
        const stageOrder: Record<string, number> = {
            'expiring_soon': 1,
            'expired': 2,
            'dormant': 3,
            'healthy': 4,
            'churned': 5,
            'unknown': 6,
        };

        formattedTenants.sort((a, b) => {
            const scoreA = stageOrder[a.pipeline_stage] || 99;
            const scoreB = stageOrder[b.pipeline_stage] || 99;
            if (scoreA !== scoreB) return scoreA - scoreB;
            // jika sama, urutkan berdasarkan hari kadaluarsa terdekat
            return a.days_until_expiry - b.days_until_expiry;
        });

        return NextResponse.json({
            summary,
            tenants: formattedTenants,
        });

    } catch (err: any) {
        console.error('[Tenant Pipeline] Error:', err);
        return NextResponse.json({ message: err.message || 'Internal Server Error' }, { status: 500 });
    }
}
