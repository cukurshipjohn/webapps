import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken } from '@/lib/auth';

const PAGE_SIZE = 10;

// ── GET /api/posts — Public feed posts untuk tenant ───────
// Tidak butuh auth. tenant_id dibaca dari:
// 1. Header x-tenant-id (diset oleh proxy.ts dari subdomain)
// 2. JWT token user (fallback untuk localhost:3000/dashboard)
export async function GET(request: NextRequest) {
    try {
        // Priority 1: header dari proxy subdomain
        let tenantId = request.headers.get('x-tenant-id');

        // Priority 2: JWT token fallback (localhost / tanpa subdomain)
        if (!tenantId) {
            const user = getUserFromToken(request);
            if (user?.tenant_id) {
                tenantId = user.tenant_id;
            }
        }

        if (!tenantId) {
            // Bukan subdomain tenant & tidak ada token → kembalikan data kosong
            return NextResponse.json({ data: [], page: 1, has_more: false });
        }

        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const type = searchParams.get('type'); // filter opsional
        const now = new Date().toISOString();

        let query = supabaseAdmin
            .from('posts')
            .select('id, type, title, body, image_url, cta_label, cta_url, promo_code, promo_discount_percent, is_pinned, published_at, expires_at')
            .eq('tenant_id', tenantId)
            .eq('is_published', true)
            .lte('published_at', now)
            .or(`expires_at.is.null,expires_at.gt.${now}`)
            .order('is_pinned', { ascending: false })
            .order('published_at', { ascending: false })
            .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

        if (type) query = query.eq('type', type);

        const { data, error } = await query;
        if (error) throw error;

        return NextResponse.json({
            data,
            page,
            has_more: data.length === PAGE_SIZE
        });

    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
