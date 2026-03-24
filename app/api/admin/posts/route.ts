import { NextRequest, NextResponse } from 'next/server';
import { createTenantClient, supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';

// ── Helpers ──────────────────────────────────────────────
/**
 * Jika is_pinned=true, unpin semua post lain milik tenant (only 1 pinned at a time)
 */
async function unpinAllOtherPosts(tenantId: string, excludeId?: string) {
    const query = supabaseAdmin
        .from('posts')
        .update({ is_pinned: false })
        .eq('tenant_id', tenantId)
        .eq('is_pinned', true);

    if (excludeId) query.neq('id', excludeId);
    await query;
}

// ── GET — List posts milik tenant ─────────────────────────
export async function GET(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin', 'barber'], user.role);

        // Fallback ke DB jika JWT tidak punya tenant_id
        let tenantId = user.tenant_id;
        if (!tenantId) {
            const { data: ud } = await supabaseAdmin.from('users').select('tenant_id').eq('id', user.userId).single();
            tenantId = ud?.tenant_id;
        }
        if (!tenantId) return NextResponse.json({ message: 'Tenant tidak ditemukan' }, { status: 403 });

        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type');
        const isPublished = searchParams.get('is_published');

        // Fetch posts with notification count
        let query = supabaseAdmin
            .from('posts')
            .select(`
                id, type, title, body, image_url, cta_label, cta_url,
                promo_code, promo_discount_percent, is_pinned, is_published,
                published_at, expires_at, created_at, updated_at,
                notification_logs!notification_logs_post_id_fkey(status)
            `)
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });

        if (type) query = query.eq('type', type);
        if (isPublished !== null) query = query.eq('is_published', isPublished === 'true');

        const { data: rawPosts, error } = await query;
        if (error) throw error;

        // Get tenant plan for blast feature gating
        const { data: tenant } = await supabaseAdmin
            .from('tenants').select('plan').eq('id', tenantId).single();

        // Flatten notification count
        const posts = (rawPosts || []).map((p: any) => {
            const logs: any[] = p.notification_logs || [];
            return {
                ...p,
                notification_logs: undefined,
                notification_sent_count: logs.filter(l => l.status === 'sent').length,
            };
        });

        return NextResponse.json({
            posts,
            plan_key: tenant?.plan || 'starter',
        });

    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}


// ── POST — Buat post baru ─────────────────────────────────
export async function POST(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);

        const body = await request.json();
        const {
            type = 'info', title, body: postBody, image_url, cta_label, cta_url,
            promo_code, promo_discount_percent, is_pinned = false,
            is_published = true, expires_at
        } = body;

        // Validasi wajib
        if (!title || !postBody) {
            return NextResponse.json({ message: 'title dan body wajib diisi.' }, { status: 400 });
        }
        if (title.length > 100) {
            return NextResponse.json({ message: 'title maksimal 100 karakter.' }, { status: 400 });
        }
        if (postBody.length > 1000) {
            return NextResponse.json({ message: 'body maksimal 1000 karakter.' }, { status: 400 });
        }
        if (!['promo', 'info', 'status', 'event'].includes(type)) {
            return NextResponse.json({ message: 'type harus salah satu dari: promo, info, status, event.' }, { status: 400 });
        }

        const tenant_id = user.tenant_id;
        if (!tenant_id) return NextResponse.json({ message: 'Tenant tidak ditemukan' }, { status: 403 });

        // Unpin post lain jika ini akan di-pin
        if (is_pinned) await unpinAllOtherPosts(tenant_id);

        const { data, error } = await supabaseAdmin
            .from('posts')
            .insert({
                tenant_id,
                author_id: user.userId,
                type, title, body: postBody, image_url: image_url || null,
                cta_label: cta_label || null, cta_url: cta_url || null,
                promo_code: promo_code || null,
                promo_discount_percent: promo_discount_percent || null,
                is_pinned, is_published,
                expires_at: expires_at || null
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data, { status: 201 });

    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

// ── PUT — Update post ────────────────────────────────────
export async function PUT(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);

        const body = await request.json();
        const { id, ...fields } = body;

        if (!id) return NextResponse.json({ message: 'Post ID wajib diisi.' }, { status: 400 });

        // Validasi panjang jika disertakan
        if (fields.title && fields.title.length > 100)
            return NextResponse.json({ message: 'title maksimal 100 karakter.' }, { status: 400 });
        if (fields.body && fields.body.length > 1000)
            return NextResponse.json({ message: 'body maksimal 1000 karakter.' }, { status: 400 });

        const tenant_id = user.tenant_id;
        if (!tenant_id) return NextResponse.json({ message: 'Tenant tidak ditemukan' }, { status: 403 });

        // Validasi kepemilikan post
        const { data: existing } = await supabaseAdmin
            .from('posts').select('id').eq('id', id).eq('tenant_id', tenant_id).single();
        if (!existing) return NextResponse.json({ message: 'Post tidak ditemukan.' }, { status: 404 });

        // Unpin post lain jika ini akan di-pin
        if (fields.is_pinned === true) await unpinAllOtherPosts(tenant_id, id);

        const { data, error } = await supabaseAdmin
            .from('posts')
            .update({ ...fields, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('tenant_id', tenant_id)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);

    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

// ── DELETE — Hapus post ───────────────────────────────────
export async function DELETE(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);

        const body = await request.json();
        const { id } = body;
        if (!id) return NextResponse.json({ message: 'Post ID wajib diisi.' }, { status: 400 });

        const tenant_id = user.tenant_id;
        if (!tenant_id) return NextResponse.json({ message: 'Tenant tidak ditemukan' }, { status: 403 });

        const { error } = await supabaseAdmin
            .from('posts')
            .delete()
            .eq('id', id)
            .eq('tenant_id', tenant_id);

        if (error) throw error;
        return NextResponse.json({ message: 'Post berhasil dihapus.' });

    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
