import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin', 'barber'], user.role);
        
        const tenantId = user.tenant_id;
        if (!tenantId) return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 403 });

        // Use admin client (service role) to bypass RLS — filtering by tenant_id explicitly
        const { data, error } = await supabaseAdmin
            .from('tenant_settings')
            .select('*')
            .eq('tenant_id', tenantId)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }
        
        if (!data) {
            return NextResponse.json({
                tenant_id: tenantId,
                shop_name: 'My Barbershop',
                shop_tagline: 'Tampil Kece, Harga Terjangkau',
                logo_url: null,
                hero_image_url: null,
                color_primary: '#F59E0B',
                color_primary_hover: '#D97706',
                color_background: '#0A0A0A',
                color_surface: '#171717',
                color_accent: '#FFFFFF',
                color_secondary: '#D97706',
                use_gradient: false,
                font_choice: 'modern',
                whatsapp_owner: null,
                operating_open: '10:00',
                operating_close: '20:00',
                is_home_service_enabled: true
            });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('[Settings GET]', error);
        return NextResponse.json(
            { message: error.message },
            { status: error.message?.includes('403') ? 403 : 500 }
        );
    }
}

export async function PUT(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        
        const tenantId = user.tenant_id;
        if (!tenantId) return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 403 });

        const body = await request.json();

        // Basic hex validation
        const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
        if (body.color_primary && !hexColorRegex.test(body.color_primary)) {
            return NextResponse.json({ message: 'Format warna primary tidak valid.' }, { status: 400 });
        }

        // Only save safe/allowed fields
        const safeData = {
            shop_name:               body.shop_name,
            shop_tagline:            body.shop_tagline,
            logo_url:                body.logo_url ?? null,
            hero_image_url:          body.hero_image_url ?? null,
            color_primary:           body.color_primary,
            color_primary_hover:     body.color_primary_hover,
            color_background:        body.color_background,
            color_surface:           body.color_surface,
            color_accent:            body.color_accent,
            color_secondary:         body.color_secondary,
            use_gradient:            body.use_gradient,
            font_choice:             body.font_choice,
            whatsapp_owner:          body.whatsapp_owner ?? null,
            operating_open:          body.operating_open,
            operating_close:         body.operating_close,
            is_home_service_enabled: body.is_home_service_enabled,
            updated_at:              new Date().toISOString(),
        };

        // Check if record already exists for this tenant
        const { data: existing } = await supabaseAdmin
            .from('tenant_settings')
            .select('id')
            .eq('tenant_id', tenantId)
            .single();

        let data, error;

        if (existing) {
            // UPDATE
            ({ data, error } = await supabaseAdmin
                .from('tenant_settings')
                .update(safeData)
                .eq('tenant_id', tenantId)
                .select()
                .single());
        } else {
            // INSERT
            ({ data, error } = await supabaseAdmin
                .from('tenant_settings')
                .insert([{ ...safeData, tenant_id: tenantId }])
                .select()
                .single());
        }

        if (error) throw error;

        return NextResponse.json({ message: 'Pengaturan berhasil disimpan.', data });
    } catch (error: any) {
        console.error('[Settings PUT]', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
