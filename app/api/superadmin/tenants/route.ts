import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

function requireSuperAdmin(request: NextRequest) {
    const user = getUserFromToken(request);
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'superadmin') return NextResponse.json({ message: 'Forbidden: Superadmin only' }, { status: 403 });
    return user;
}

export async function GET(request: NextRequest) {
    try {
        const user = requireSuperAdmin(request);
        if (user instanceof NextResponse) return user;

        const { searchParams } = new URL(request.url);
        const filterPlan      = searchParams.get('plan');        // 'annual' | 'monthly' | 'custom' | specific plan id | null
        const filterActive    = searchParams.get('is_active');   // 'true' | 'false' | null
        const filterSubdomain = searchParams.get('subdomain');   // 'custom' | null
        const sortBy          = searchParams.get('sort') || 'created_at';
        const sortAsc         = searchParams.get('dir') === 'asc';

        // ─── Fetch tenants dengan kolom baru ─────────────────────────────────────
        let query = supabaseAdmin
            .from('tenants')
            .select(`
                id, shop_name, slug, effective_slug, custom_slug,
                plan, billing_cycle,
                is_active, plan_expires_at, created_at, owner_user_id,
                subdomain_revisions_remaining
            `);

        // Filter plan: mendukung 'annual' (semua _annual), 'monthly' (semua non-annual), atau plan spesifik
        if (filterPlan === 'annual') {
            query = query.like('plan', '%_annual');
        } else if (filterPlan === 'monthly') {
            query = query.not('plan', 'like', '%_annual').not('plan', 'eq', 'trial');
        } else if (filterPlan) {
            query = query.eq('plan', filterPlan);
        }

        if (filterActive !== null && filterActive !== '') {
            query = query.eq('is_active', filterActive === 'true');
        }

        // Filter custom subdomain
        if (filterSubdomain === 'custom') {
            query = query.not('custom_slug', 'is', null);
        }

        const { data: tenants, error } = await query
            .order(sortBy === 'plan_expires_at' ? 'plan_expires_at' : 'created_at', { ascending: sortAsc });

        if (error) throw error;

        // ─── Owner phones ─────────────────────────────────────────────────────────
        const ownerIds = (tenants || []).map(t => t.owner_user_id).filter(Boolean);
        const { data: owners } = await supabaseAdmin
            .from('users')
            .select('id, phone_number, name')
            .in('id', ownerIds);

        const ownerMap = Object.fromEntries((owners || []).map(o => [o.id, o]));

        // ─── Total bookings per tenant ────────────────────────────────────────────
        const tenantIds = (tenants || []).map(t => t.id);
        const bookingCounts: Record<string, number> = {};
        if (tenantIds.length > 0) {
            const { data: bookings } = await supabaseAdmin
                .from('bookings')
                .select('tenant_id')
                .in('tenant_id', tenantIds);
            (bookings || []).forEach(b => {
                bookingCounts[b.tenant_id] = (bookingCounts[b.tenant_id] || 0) + 1;
            });
        }

        const enrichedTenants = (tenants || []).map(t => ({
            ...t,
            // Normalisasi billing_cycle: jika kolom belum ada nilainya, derive dari plan
            billing_cycle: t.billing_cycle || (t.plan?.endsWith('_annual') ? 'annual' : 'monthly'),
            effective_slug: t.effective_slug || t.slug,
            owner: ownerMap[t.owner_user_id] || null,
            total_bookings: bookingCounts[t.id] || 0,
        }));

        return NextResponse.json({ tenants: enrichedTenants });

    } catch (error: any) {
        console.error('[Superadmin Tenants] Error:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
