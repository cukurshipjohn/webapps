import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);

        const { id } = await params;

        // Validate ownership
        const { data: post, error: findError } = await supabaseAdmin
            .from('posts')
            .select('id, is_published')
            .eq('id', id)
            .single();

        if (findError || !post) return NextResponse.json({ message: 'Post tidak ditemukan.' }, { status: 404 });

        const { data, error } = await supabaseAdmin
            .from('posts')
            .update({
                is_published: !post.is_published,
                published_at: !post.is_published ? new Date().toISOString() : post.is_published,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select('id, is_published')
            .single();

        if (error) throw error;
        return NextResponse.json(data);

    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
