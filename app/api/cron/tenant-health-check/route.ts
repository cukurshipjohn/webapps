import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    // ── Auth Cron Token ──────────────────────────────────────────────────────
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const logs: string[] = [];
        const now = new Date();
        const nowMs = now.getTime();
        const DAY_MS = 24 * 60 * 60 * 1000;

        // =========================================================================
        // TAHAP 1: Deteksi Tenant "Expiring Soon" (7-14 hari)
        // =========================================================================
        const date14DaysFromNow = new Date(nowMs + (14 * DAY_MS)).toISOString();
        
        const { data: expiringTenants, error: err1 } = await supabaseAdmin
            .from('tenants')
            .select('id, shop_name, plan_expires_at')
            .eq('is_active', true)
            .gte('plan_expires_at', now.toISOString())
            .lte('plan_expires_at', date14DaysFromNow);
            
        if (err1) throw err1;

        for (const t of (expiringTenants || [])) {
            const daysLeft = Math.ceil((new Date(t.plan_expires_at).getTime() - nowMs) / DAY_MS);
            
            // Cek apakah sudah ada follow-up renewal_reminder dalam 3 hari terakhir
            const date3DaysAgo = new Date(nowMs - (3 * DAY_MS)).toISOString();
            
            const { count } = await supabaseAdmin
                .from('superadmin_followups')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', t.id)
                .eq('case_type', 'renewal_reminder')
                .gte('created_at', date3DaysAgo);
                
            if (count === 0) {
                await supabaseAdmin.from('superadmin_followups').insert({
                    tenant_id: t.id,
                    admin_id: null,
                    case_type: 'renewal_reminder',
                    channel: 'internal_note',
                    message_sent: `AUTO: Langganan tenant ${t.shop_name} akan habis dalam ${daysLeft} hari (expires: ${new Date(t.plan_expires_at).toLocaleDateString()}). Segera follow-up!`,
                    outcome: 'pending',
                    scheduled_at: now.toISOString()
                });
                logs.push(`[Expiring] Follow-up dibuat untuk ${t.shop_name} (${daysLeft} hari lagi)`);
            }
        }

        // =========================================================================
        // TAHAP 2: Deteksi Tenant "Dormant" (tidak ada aktivitas 14+ hari)
        // =========================================================================
        const { data: activeTenants, error: err2 } = await supabaseAdmin
            .from('tenants')
            .select('id, shop_name')
            .eq('is_active', true);

        if (err2) throw err2;

        const date14DaysAgo = new Date(nowMs - (14 * DAY_MS)).toISOString();
        const date7DaysAgo = new Date(nowMs - (7 * DAY_MS)).toISOString();

        for (const t of (activeTenants || [])) {
            // Cek aktivitas terakhir 14 hari
            const { count: actCount } = await supabaseAdmin
                .from('tenant_activity_events')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', t.id)
                .gte('created_at', date14DaysAgo);
                
            if (actCount === 0) {
                // Dormant! Cek apakah sudah difollow-up dalam 7 hari terakhir
                const { count: fuCount } = await supabaseAdmin
                    .from('superadmin_followups')
                    .select('*', { count: 'exact', head: true })
                    .eq('tenant_id', t.id)
                    .eq('case_type', 'usage_coaching')
                    .gte('created_at', date7DaysAgo);
                
                if (fuCount === 0) {
                    await supabaseAdmin.from('superadmin_followups').insert({
                        tenant_id: t.id,
                        admin_id: null,
                        case_type: 'usage_coaching',
                        channel: 'internal_note',
                        message_sent: `AUTO: Tenant ${t.shop_name} tidak ada aktivitas selama 14+ hari. Perlu coaching/aktivasi fitur.`,
                        outcome: 'pending',
                        scheduled_at: now.toISOString()
                    });
                    logs.push(`[Dormant] Follow-up dibuat untuk ${t.shop_name}`);
                }
            }
        }

        // =========================================================================
        // TAHAP 3: Deteksi Tenant "Expired" Tanpa Survey
        // =========================================================================
        const { data: expiredTenants, error: err3 } = await supabaseAdmin
            .from('tenants')
            .select('id, shop_name, plan_expires_at')
            .eq('is_active', false)
            .lt('plan_expires_at', now.toISOString())
            .gte('plan_expires_at', date7DaysAgo); // Baru expired maks 7 hari lalu

        if (err3) throw err3;

        for (const t of (expiredTenants || [])) {
            // Cek apakah sudah mengisi churn_surveys
            const { count: surveyCount } = await supabaseAdmin
                .from('churn_surveys')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', t.id);

            if (surveyCount === 0) {
                // Cek apakah sudah ada notif churn_prevention (hindari duplicate)
                const { count: preventCount } = await supabaseAdmin
                    .from('superadmin_followups')
                    .select('*', { count: 'exact', head: true })
                    .eq('tenant_id', t.id)
                    .eq('case_type', 'churn_prevention');
                
                if (preventCount === 0) {
                    await supabaseAdmin.from('superadmin_followups').insert({
                        tenant_id: t.id,
                        admin_id: null,
                        case_type: 'churn_prevention',
                        channel: 'internal_note',
                        message_sent: `AUTO: Tenant ${t.shop_name} baru expired dan belum mengisi churn survey. Lakukan exit interview!`,
                        outcome: 'pending',
                        scheduled_at: now.toISOString()
                    });
                    logs.push(`[Expired-NoSurvey] Follow-up dibuat untuk ${t.shop_name}`);
                }
            }
        }

        return NextResponse.json({ 
            success: true, 
            message: 'Tenant health check cron executed successfully',
            logs 
        });

    } catch (error: any) {
        console.error('[Tenant Health Check Cron] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
