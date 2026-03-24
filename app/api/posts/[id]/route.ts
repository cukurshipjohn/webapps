import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// ── GET /api/posts/[id] — Detail satu post publik ─────────
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const tenantId = request.headers.get('x-tenant-id');
        if (!tenantId) {
            return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 404 });
        }

        const { id } = params;
        const now = new Date().toISOString();

        const { data, error } = await supabaseAdmin
            .from('posts')
            .select('id, type, title, body, image_url, cta_label, cta_url, promo_code, promo_discount_percent, is_pinned, published_at, expires_at')
            .eq('id', id)
            .eq('tenant_id', tenantId)
            .eq('is_published', true)
            .lte('published_at', now)
            .or(`expires_at.is.null,expires_at.gt.${now}`)
            .single();

        if (error || !data) {
            return NextResponse.json({ message: 'Post tidak ditemukan atau sudah tidak aktif.' }, { status: 404 });
        }

        return NextResponse.json(data);

    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
