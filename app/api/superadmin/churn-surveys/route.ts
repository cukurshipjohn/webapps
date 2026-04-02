import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const VALID_REASONS = [
    'too_expensive',
    'not_using',
    'switched_competitor',
    'temporary_close',
    'other'
] as const;

export async function GET(request: NextRequest) {
    const user = getUserFromToken(request);
    if (!user || user.role !== 'superadmin') {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenant_id');
        const reason = searchParams.get('reason');

        let query = supabaseAdmin
            .from('churn_surveys')
            .select('*, tenants!inner(shop_name, slug)')
            .order('recorded_at', { ascending: false });

        if (tenantId) query = query.eq('tenant_id', tenantId);
        if (reason) query = query.eq('reason', reason);

        const { data, error } = await query;
        if (error) throw error;

        return NextResponse.json({ surveys: data });
    } catch (err: any) {
        console.error('[ChurnSurveys GET] Error:', err);
        return NextResponse.json({ message: err.message || 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const user = getUserFromToken(request);
    if (!user || user.role !== 'superadmin') {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { tenant_id, reason, detail_note } = body;

        if (!tenant_id) return NextResponse.json({ message: 'tenant_id wajib diisi' }, { status: 400 });
        if (!reason || !VALID_REASONS.includes(reason as any)) {
            return NextResponse.json({ message: 'reason tidak valid' }, { status: 400 });
        }

        // Insert churn survey
        const { data: survey, error: surveyErr } = await supabaseAdmin
            .from('churn_surveys')
            .insert({
                tenant_id,
                reason,
                detail_note: detail_note || null,
                recorded_by: 'superadmin'
            })
            .select('*')
            .single();

        if (surveyErr) throw surveyErr;

        // Auto insert into superadmin_followups
        const { error: followupErr } = await supabaseAdmin
            .from('superadmin_followups')
            .insert({
                tenant_id,
                admin_id: user.userId,
                case_type: 'churn',
                channel: 'internal_note',
                note: `Alasan churn: ${reason}. ${detail_note || ''}`,
                outcome: 'churned_confirmed'
            });

        if (followupErr) {
            console.warn('[ChurnSurveys POST] Failed to auto-insert followup:', followupErr);
        }

        // Matikan tenant
        const { error: deactErr } = await supabaseAdmin
            .from('tenants')
            .update({ is_active: false })
            .eq('id', tenant_id);

        if (deactErr) {
            console.warn('[ChurnSurveys POST] Failed to deactivate tenant:', deactErr);
        }

        return NextResponse.json({ success: true, survey }, { status: 201 });

    } catch (err: any) {
        console.error('[ChurnSurveys POST] Error:', err);
        return NextResponse.json({ message: err.message || 'Internal Server Error' }, { status: 500 });
    }
}
