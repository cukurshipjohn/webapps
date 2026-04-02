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
        // Priority 1: header x-tenant-id dari middleware (subdomain routing)
        let tenantId = request.headers.get('x-tenant-id');

        // Priority 2: header x-tenant-slug atau hostname fallback
        if (!tenantId) {
            const slugFromHeader = request.headers.get('x-tenant-slug');
            const hostname = request.headers.get('host') || '';
            const rootDomain = (process.env.NEXT_PUBLIC_APP_DOMAIN || 'cukurship.id').replace(/^https?:\/\//, '');
            const slugFromHost = hostname.endsWith(`.${rootDomain}`)
                ? hostname.replace(`.${rootDomain}`, '')
                : null;
            const slug = slugFromHeader || slugFromHost;

            if (slug && !['www', 'app', 'api', 'mail', 'smtp'].includes(slug)) {
                const { createClient } = await import('@supabase/supabase-js');
                const sb = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.SUPABASE_SERVICE_ROLE_KEY!
                );
                const { data } = await sb
                    .from('tenants')
                    .select('id')
                    .or(`effective_slug.eq.${slug},slug.eq.${slug}`)
                    .single();
                if (data?.id) tenantId = data.id;
            }
        }

        // Priority 3: JWT token fallback (localhost / tanpa subdomain)
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
