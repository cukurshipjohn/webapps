import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const VALID_WIN_BACK = ['high', 'medium', 'low', 'unknown'] as const;

// ── Auth helper ──────────────────────────────────────────────────────────────
function authSuperAdmin(request: NextRequest) {
    const user = getUserFromToken(request);
    if (!user) return { error: NextResponse.json({ message: 'Unauthorized.' }, { status: 401 }) };
    if (user.role !== 'superadmin') return { error: NextResponse.json({ message: 'Forbidden: Superadmin only.' }, { status: 403 }) };
    return { user };
}

// ── PATCH /api/superadmin/churn-surveys/[id] ─────────────────────────────────
// Update existing churn survey. Note: 'outcome' is not a field in churn_surveys table, it's in followups.
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> } // NEXT_JS 15+ compatible
) {
    const { user, error: authErr } = authSuperAdmin(request);
    if (authErr) return authErr;

    try {
        const { id } = await context.params;
        const body = await request.json();
        
        // Hanya boleh update field tertentu
        const updates: Record<string, any> = {};

        if (body.win_back_potential !== undefined) {
             if (!VALID_WIN_BACK.includes(body.win_back_potential)) {
                 return NextResponse.json({
                     message: `win_back_potential tidak valid. Nilai yang diizinkan: ${VALID_WIN_BACK.join(', ')}`,
                 }, { status: 400 });
             }
             updates.win_back_potential = body.win_back_potential;
        }

        if (body.detail_note !== undefined) {
             updates.detail_note = body.detail_note;
        }

        if (body.follow_up_scheduled_at !== undefined) {
             updates.follow_up_scheduled_at = body.follow_up_scheduled_at;
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ message: 'Tidak ada data valid untuk diupdate.' }, { status: 400 });
        }

        const { data: survey, error: updateErr } = await supabaseAdmin
            .from('churn_surveys')
            .update(updates)
            .eq('id', id)
            .select(`
                id, tenant_id, recorded_by_admin_id, reason,
                detail_note, win_back_potential, recorded_at, follow_up_scheduled_at
            `)
            .single();

        if (updateErr) {
            if (updateErr.code === 'PGRST116') {
                 return NextResponse.json({ message: 'Churn survey tidak ditemukan.' }, { status: 404 });
            }
            throw updateErr;
        }

        return NextResponse.json({ data: survey }, { status: 200 });

    } catch (err: any) {
        console.error('[ChurnSurveys PATCH] Error:', err);
        return NextResponse.json({ message: err.message || 'Internal Server Error' }, { status: 500 });
    }
}
