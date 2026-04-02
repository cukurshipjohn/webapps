import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('Authorization');
    const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

    if (!authHeader || authHeader !== expectedToken) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const now = new Date();
        const inSevenDays = new Date(now.getTime() + 7 * 86400000);

        // LANGKAH 1 — Cari tenant expiring dalam 7 hari
        const { data: expiringTenants, error: getErr } = await supabaseAdmin
            .from('tenants')
            .select('id, shop_name, plan, plan_expires_at')
            .eq('is_active', true)
            .neq('plan', 'trial')
            .gte('plan_expires_at', now.toISOString())
            .lte('plan_expires_at', inSevenDays.toISOString());

        if (getErr) throw getErr;

        let scanned = expiringTenants?.length || 0;
        let inserted = 0;
        let skipped = 0;

        const threeDaysAgo = new Date(now.getTime() - 3 * 86400000).toISOString();

        // LANGKAH 2 — Untuk setiap tenant
        for (const tenant of expiringTenants || []) {
            // Cek duplikat follow-up renewal_reminder pending dalam 3 hari terakhir
            const { data: existingFollowup, error: existErr } = await supabaseAdmin
                .from('superadmin_followups')
                .select('id')
                .eq('tenant_id', tenant.id)
                .eq('case_type', 'renewal_reminder')   // case_type yang benar di DB
                .eq('outcome', 'pending')
                .gt('created_at', threeDaysAgo)
                .single();

            // PGRST116 = 0 row = belum ada = tidak duplikat
            if (existErr && existErr.code !== 'PGRST116') {
                console.error('[HealthCheck] Error checking duplicates:', existErr);
                continue;
            }

            if (existingFollowup) {
                skipped++;
                continue;
            }

            const expiresAtDate = new Date(tenant.plan_expires_at);
            const remainingDays = Math.ceil((expiresAtDate.getTime() - now.getTime()) / 86400000);

            // Insert — gunakan kolom yang benar: message_sent (bukan note)
            const { error: insertErr } = await supabaseAdmin
                .from('superadmin_followups')
                .insert({
                    tenant_id: tenant.id,
                    admin_id: null,
                    case_type: 'renewal_reminder',          // case_type valid di DB
                    channel: 'whatsapp',
                    outcome: 'pending',
                    message_sent: `Auto: Langganan ${tenant.shop_name} habis dalam ${remainingDays} hari (${expiresAtDate.toLocaleDateString('id-ID')})`,
                    scheduled_at: now.toISOString()
                });

            if (insertErr) {
                console.error('[HealthCheck] Insert failed:', insertErr);
            } else {
                inserted++;
            }
        }

        return NextResponse.json({
            success: true,
            scanned,
            inserted,
            skipped,
            timestamp: now.toISOString()
        });

    } catch (err: any) {
        console.error('[HealthCheck] Error:', err);
        return NextResponse.json({ message: err.message || 'Internal Server Error' }, { status: 500 });
    }
}
