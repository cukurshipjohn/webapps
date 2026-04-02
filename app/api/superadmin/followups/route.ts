import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const VALID_CASE_TYPES = ['renewal', 'usage_check', 'churn', 'upgrade_offer', 'custom'] as const;
const VALID_CHANNELS = ['whatsapp', 'phone', 'email', 'internal_note'] as const;

export async function GET(request: NextRequest) {
    const user = getUserFromToken(request);
    if (!user || user.role !== 'superadmin') {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenant_id');
        const caseType = searchParams.get('case_type');
        const outcome = searchParams.get('outcome');
        const limitStr = searchParams.get('limit') || '50';
        let limit = parseInt(limitStr, 10);
        if (isNaN(limit) || limit <= 0) limit = 50;
        if (limit > 100) limit = 100;

        let query = supabaseAdmin
            .from('superadmin_followups')
            .select('*, tenants!inner(shop_name, slug)')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (tenantId) query = query.eq('tenant_id', tenantId);
        if (caseType) query = query.eq('case_type', caseType);
        if (outcome) query = query.eq('outcome', outcome);

        const { data, error } = await query;
        if (error) throw error;

        const formatted = (data || []).map(f => ({
            id: f.id,
            tenant_id: f.tenant_id,
            shop_name: (f.tenants as any)?.shop_name,
            slug: (f.tenants as any)?.slug,
            case_type: f.case_type,
            channel: f.channel,
            note: f.note,
            outcome: f.outcome,
            scheduled_at: f.scheduled_at,
            done_at: f.done_at,
            created_at: f.created_at
        }));

        return NextResponse.json({ followups: formatted });
    } catch (err: any) {
        console.error('[Followups GET] Error:', err);
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
        const { tenant_id, case_type, channel, note, outcome, scheduled_at } = body;

        if (!tenant_id) return NextResponse.json({ message: 'tenant_id wajib diisi' }, { status: 400 });
        if (!case_type || !VALID_CASE_TYPES.includes(case_type as any)) {
            return NextResponse.json({ message: 'case_type tidak valid' }, { status: 400 });
        }
        if (!channel || !VALID_CHANNELS.includes(channel as any)) {
            return NextResponse.json({ message: 'channel tidak valid' }, { status: 400 });
        }

        const { data: tenantCheck, error: tcErr } = await supabaseAdmin
            .from('tenants')
            .select('id')
            .eq('id', tenant_id)
            .single();

        if (tcErr || !tenantCheck) {
            return NextResponse.json({ message: 'Tenant tidak valid atau tidak ditemukan' }, { status: 400 });
        }

        const admin_id = user.userId;
        const finalOutcome = outcome || 'pending';

        const payload: any = {
            tenant_id,
            admin_id,
            case_type,
            channel,
            note: note || '',
            outcome: finalOutcome
        };

        if (scheduled_at) payload.scheduled_at = scheduled_at;
        if (finalOutcome !== 'pending') payload.done_at = new Date().toISOString();

        const { data: followup, error: insertErr } = await supabaseAdmin
            .from('superadmin_followups')
            .insert(payload)
            .select('*')
            .single();

        if (insertErr) throw insertErr;

        return NextResponse.json({ success: true, followup }, { status: 201 });
    } catch (err: any) {
        console.error('[Followups POST] Error:', err);
        return NextResponse.json({ message: err.message || 'Internal Server Error' }, { status: 500 });
    }
}
