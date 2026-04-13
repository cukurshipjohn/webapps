import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { getTenantFromRequest } from '../../../lib/tenant-context';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'barbershop' atau 'home'

    // Ambil tenant dari header (di-inject oleh middleware).
    // Catatan: proxy.ts hanya men-set x-tenant-id untuk page requests.
    // Untuk API calls dari customer portal, yang tersedia hanya x-tenant-slug.
    const { tenantId, tenantSlug } = getTenantFromRequest(request);

    try {
        // Resolve tenant ID: coba dari x-tenant-id dulu,
        // fallback ke lookup DB menggunakan x-tenant-slug jika kosong.
        let resolvedTenantId = tenantId;
        if (!resolvedTenantId && tenantSlug) {
            const { data: tenantData } = await supabaseAdmin
                .from('tenants')
                .select('id')
                .or(`slug.eq.${tenantSlug},effective_slug.eq.${tenantSlug}`)
                .single();
            resolvedTenantId = tenantData?.id ?? null;
        }

        let query = supabaseAdmin
            .from('services')
            .select('*')
            .eq('is_active', true)
            .order('price', { ascending: true });

        // Wajib filter per tenant — jangan kembalikan data lintas tenant
        if (resolvedTenantId) {
            query = query.eq('tenant_id', resolvedTenantId);
        }

        // Filter berdasarkan service_type (kolom enum, bukan prefix nama lama)
        // Ini mendukung format baru admin panel sekaligus backward-compatible
        // dengan layanan lama karena kolom service_type selalu diisi saat insert.
        if (type === 'barbershop') {
            query = query.eq('service_type', 'barbershop');
        } else if (type === 'home') {
            query = query.eq('service_type', 'home_service');
        } else {
            // Default: exclude pos_kasir — hanya untuk kasir internal, bukan booking
            query = query.neq('service_type', 'pos_kasir');
        }

        const { data: services, error } = await query;
        if (error) throw error;
        return NextResponse.json(services);
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

export async function POST() {
    // Seed services (hanya untuk setup awal, tidak perlu tenant di sini)
    try {
        const { error } = await supabaseAdmin
            .from('services')
            .insert([
                // Barbershop
                { name: "BARBER | Haircut", price: 15000, duration_minutes: 30 },
                { name: "BARBER | Haircut + Keramas", price: 20000, duration_minutes: 45 },
                // Home Service
                { name: "HOME | 1 Orang", price: 35000, duration_minutes: 45 },
                { name: "HOME | 2 Orang", price: 50000, duration_minutes: 60 },
                { name: "HOME | 3 Orang", price: 60000, duration_minutes: 75 },
                { name: "HOME | 5+ Orang", price: 75000, duration_minutes: 90 },
            ]);
        if (error) throw error;
        return new NextResponse('Services seeded successfully', { status: 201 });
    } catch (error: any) {
        return new NextResponse(error.message, { status: 500 });
    }
}

