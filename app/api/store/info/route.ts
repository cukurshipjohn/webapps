import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/tenant-context';

// Public endpoint — no auth required, readable by anyone visiting the tenant subdomain
export const dynamic = 'force-dynamic';

function formatTime(raw: string | null): string | null {
    if (!raw) return null;
    // DB stores as HH:MM:SS — trim to HH:MM
    return raw.slice(0, 5);
}

export async function GET(request: NextRequest) {
    try {
        const { tenantId } = getTenantFromRequest(request);

        if (!tenantId) {
            return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 404 });
        }

        // Fetch tenant_settings (all public-safe fields)
        const { data: settings } = await supabaseAdmin
            .from('tenant_settings')
            .select(`
                shop_name, shop_tagline, logo_url, hero_image_url,
                color_primary, color_primary_hover, color_secondary,
                color_background, color_surface, color_accent,
                use_gradient, font_choice,
                whatsapp_owner, operating_open, operating_close,
                is_home_service_enabled
            `)
            .eq('tenant_id', tenantId)
            .single();

        // Fallback to tenants table for shop_name & slug
        const { data: tenant } = await supabaseAdmin
            .from('tenants')
            .select('shop_name, slug')
            .eq('id', tenantId)
            .single();

        // Fetch active barbers (public info: name + specialty + photo)
        const { data: barbers } = await supabaseAdmin
            .from('barbers')
            .select('id, name, specialty, photo_url')
            .eq('tenant_id', tenantId)
            .order('name', { ascending: true });

        // Fetch active services (public info: name, price, duration, type)
        const { data: services } = await supabaseAdmin
            .from('services')
            .select('id, name, price, duration_minutes, service_type')
            .eq('tenant_id', tenantId)
            .order('service_type', { ascending: true })
            .order('price', { ascending: true });

        return NextResponse.json({
            tenant_id:                tenantId,
            shop_name:                settings?.shop_name            || tenant?.shop_name || 'Barbershop',
            shop_tagline:             settings?.shop_tagline         || 'Tampil Kece, Harga Terjangkau',
            logo_url:                 settings?.logo_url             ?? null,
            hero_image_url:           settings?.hero_image_url       ?? null,
            // Colors
            color_primary:            settings?.color_primary        || '#F59E0B',
            color_primary_hover:      settings?.color_primary_hover  || '#D97706',
            color_secondary:          settings?.color_secondary      || '#D97706',
            color_background:         settings?.color_background     || '#0A0A0A',
            color_surface:            settings?.color_surface        || '#171717',
            color_accent:             settings?.color_accent         || '#FFFFFF',
            use_gradient:             settings?.use_gradient         ?? false,
            font_choice:              settings?.font_choice          || 'modern',
            // Contact & Hours
            whatsapp_owner:           settings?.whatsapp_owner       ?? null,
            operating_open:           formatTime(settings?.operating_open  ?? null),
            operating_close:          formatTime(settings?.operating_close ?? null),
            is_home_service_enabled:  settings?.is_home_service_enabled ?? true,
            // Slug, Barbers & Services
            slug:    tenant?.slug || null,
            barbers: barbers || [],
            services: services || [],
        });

    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
