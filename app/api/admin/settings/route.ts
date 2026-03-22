import { NextRequest, NextResponse } from 'next/server';
import { createTenantClient } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        
        const tenantId = user.tenant_id;
        const tenantClient = createTenantClient(tenantId!);

        const { data, error } = await tenantClient
            .from('tenant_settings')
            .select('*')
            .single();

        if (error && error.code !== 'PGRST116') { // Ignore "Row not found" error if they don't have settings yet
            throw error;
        }
        
        // Return default empty structured data if completely missing
        if (!data) {
            return NextResponse.json({
                tenant_id: tenantId,
                shop_name: 'My Barbershop',
                shop_tagline: 'Tampil Kece, Harga Terjangkau',
                color_primary: '#F59E0B',
                color_primary_hover: '#D97706',
                color_background: '#0A0A0A',
                color_surface: '#171717',
                color_accent: '#FFFFFF',
                color_secondary: '#D97706',
                use_gradient: false,
                font_choice: 'modern',
                operating_open: '10:00',
                operating_close: '20:30',
                is_home_service_enabled: true
            });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: error.message.includes('403') ? 403 : 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        
        const tenantId = user.tenant_id;
        const body = await request.json();

        // Extra Validation (Optional basic checks)
        const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
        if (body.color_primary && !hexColorRegex.test(body.color_primary)) {
            return NextResponse.json({ message: 'Format warna primary tidak valid.' }, { status: 400 });
        }

        const tenantClient = createTenantClient(tenantId!);

        // Upsert logic: Update or Insert if not exists
        const { data: existingData } = await tenantClient
            .from('tenant_settings')
            .select('id')
            .single();

        let dbOperation;
        
        // Clean up the body to only contain allowed fields for tenant_settings
        const safeData = {
            shop_name: body.shop_name,
            shop_tagline: body.shop_tagline,
            logo_url: body.logo_url,
            hero_image_url: body.hero_image_url,
            color_primary: body.color_primary,
            color_primary_hover: body.color_primary_hover,
            color_background: body.color_background,
            color_surface: body.color_surface,
            color_accent: body.color_accent,
            color_secondary: body.color_secondary,
            use_gradient: body.use_gradient,
            font_choice: body.font_choice,
            whatsapp_owner: body.whatsapp_owner,
            operating_open: body.operating_open,
            operating_close: body.operating_close,
            is_home_service_enabled: body.is_home_service_enabled
        };

        if (existingData) {
            // UPDATE
            dbOperation = tenantClient
                .from('tenant_settings')
                .update(safeData)
                .select()
                .single();
        } else {
            // INSERT
            dbOperation = tenantClient
                .from('tenant_settings')
                .insert([{ ...safeData, tenant_id: tenantId }])
                .select()
                .single();
        }

        const { data, error } = await dbOperation;
        if (error) throw error;

        return NextResponse.json({ message: 'Pengaturan berhasil disimpan.', data });
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
