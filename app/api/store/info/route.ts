import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/tenant-context';

// Public endpoint — no auth required, readeable by anyone visiting the tenant subdomain
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        // Resolve tenant from x-tenant-id header injected by proxy.ts
        const { tenantId } = getTenantFromRequest(request);

        if (!tenantId) {
            return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 404 });
        }

        // Fetch tenant_settings (public info only)
        const { data: settings } = await supabaseAdmin
            .from('tenant_settings')
            .select('shop_name, shop_tagline, logo_url, hero_image_url, color_primary, color_background, color_surface, whatsapp_owner, operating_open, operating_close, is_home_service_enabled')
            .eq('tenant_id', tenantId)
            .single();

        // Fallback to tenants table if tenant_settings missing
        const { data: tenant } = await supabaseAdmin
            .from('tenants')
            .select('shop_name, slug')
            .eq('id', tenantId)
            .single();

        return NextResponse.json({
            tenant_id: tenantId,
            shop_name: settings?.shop_name || tenant?.shop_name || 'Barbershop',
            shop_tagline: settings?.shop_tagline || 'Tampil Kece, Harga Terjangkau',
            logo_url: settings?.logo_url || null,
            hero_image_url: settings?.hero_image_url || null,
            color_primary: settings?.color_primary || '#F59E0B',
            whatsapp_owner: settings?.whatsapp_owner || null,
            operating_open: settings?.operating_open || '10:00',
            operating_close: settings?.operating_close || '20:30',
            is_home_service_enabled: settings?.is_home_service_enabled ?? true,
            slug: tenant?.slug || null,
        });

    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
