import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const VALID_OUTCOMES = [
    'no_response',
    'interested',
    'renewed',
    'churned_confirmed',
    'pending'
] as const;

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> } // Next.js 15+ convention for dynamic route params
) {
    const user = getUserFromToken(request);
    if (!user || user.role !== 'superadmin') {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    try {
        const { id } = await context.params;
        if (!id) return NextResponse.json({ message: 'ID required' }, { status: 400 });

        const body = await request.json();
        const { outcome, note, done_at } = body;

        let payload: any = {};

        if (outcome !== undefined) {
             if (!VALID_OUTCOMES.includes(outcome as any)) {
                 return NextResponse.json({ message: 'outcome tidak valid' }, { status: 400 });
             }
             payload.outcome = outcome;

             if (outcome !== 'pending' && done_at === undefined) {
                 payload.done_at = new Date().toISOString();
             }
        }

        if (note !== undefined) payload.note = note;
        if (done_at !== undefined) payload.done_at = done_at;

        if (Object.keys(payload).length === 0) {
            return NextResponse.json({ message: 'Tidak ada data valid untuk diupdate' }, { status: 400 });
        }

        const { data: updated, error } = await supabaseAdmin
            .from('superadmin_followups')
            .update(payload)
            .eq('id', id)
            .select('id, outcome, done_at')
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                 return NextResponse.json({ message: 'Follow-up tidak ditemukan' }, { status: 404 });
            }
            throw error;
        }

        return NextResponse.json({ success: true, updated });

    } catch (err: any) {
        console.error('[Followups PATCH] Error:', err);
        return NextResponse.json({ message: err.message || 'Internal Server Error' }, { status: 500 });
    }
}
