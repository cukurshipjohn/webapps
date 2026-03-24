import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';

export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);

        const { id } = params;

        // Validate ownership
        const { data: post, error: findError } = await supabaseAdmin
            .from('posts')
            .select('id, is_pinned, tenant_id')
            .eq('id', id)
            .single();

        if (findError || !post) return NextResponse.json({ message: 'Post tidak ditemukan.' }, { status: 404 });

        const newPinned = !post.is_pinned;

        // If pinning → unpin all others first
        if (newPinned) {
            await supabaseAdmin
                .from('posts')
                .update({ is_pinned: false })
                .eq('tenant_id', post.tenant_id)
                .eq('is_pinned', true)
                .neq('id', id);
        }

        const { data, error } = await supabaseAdmin
            .from('posts')
            .update({ is_pinned: newPinned, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select('id, is_pinned')
            .single();

        if (error) throw error;
        return NextResponse.json(data);

    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
