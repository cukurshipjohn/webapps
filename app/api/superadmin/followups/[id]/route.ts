import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const VALID_OUTCOMES = [
    'pending',
    'no_response',
    'interested',
    'renewed',
    'upgraded',
    'churned_confirmed',
    'not_applicable',
] as const;

// ── Auth helper ──────────────────────────────────────────────────────────────
function authSuperAdmin(request: NextRequest) {
    const user = getUserFromToken(request);
    if (!user) return { error: NextResponse.json({ message: 'Unauthorized.' }, { status: 401 }) };
    if (user.role !== 'superadmin') return { error: NextResponse.json({ message: 'Forbidden: Superadmin only.' }, { status: 403 }) };
    return { user };
}

// ── PATCH /api/superadmin/followups/[id] ─────────────────────────────────────
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> } // NEXT_JS 15+ compatible
) {
    const { user, error: authErr } = authSuperAdmin(request);
    if (authErr) return authErr;

    try {
        const { id } = await context.params;
        const body = await request.json();
        
        const updates: Record<string, any> = {};

        if (body.outcome !== undefined) {
             if (!VALID_OUTCOMES.includes(body.outcome)) {
                 return NextResponse.json({
                     message: `outcome tidak valid. Nilai diizinkan: ${VALID_OUTCOMES.join(', ')}`,
                 }, { status: 400 });
             }
             updates.outcome = body.outcome;

             // Auto set done_at jika outcome dirubah dan bukan 'pending'
             if (body.outcome !== 'pending' && body.done_at === undefined) {
                 // Periksa done_at sudah ada atau belum
                 const { data: current } = await supabaseAdmin
                     .from('superadmin_followups')
                     .select('done_at')
                     .eq('id', id)
                     .single();
                 
                 if (!current?.done_at) {
                     updates.done_at = new Date().toISOString();
                 }
             }
        }

        if (body.done_at !== undefined) {
             updates.done_at = body.done_at;
        }

        if (body.message_sent !== undefined) {
             updates.message_sent = body.message_sent;
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ message: 'Tidak ada data valid untuk diupdate.' }, { status: 400 });
        }

        const { data: followup, error: updateErr } = await supabaseAdmin
            .from('superadmin_followups')
            .update(updates)
            .eq('id', id)
            .select('*')
            .single();

        if (updateErr) {
            if (updateErr.code === 'PGRST116') {
                 return NextResponse.json({ message: 'Follow-up log tidak ditemukan.' }, { status: 404 });
            }
            throw updateErr;
        }

        return NextResponse.json({ data: followup }, { status: 200 });

    } catch (err: any) {
        console.error('[Followups PATCH] Error:', err);
        return NextResponse.json({ message: err.message || 'Internal Server Error' }, { status: 500 });
    }
}
