import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { getTenantFromRequest } from '../../../lib/tenant-context';

export async function GET(request: NextRequest) {
    // Ambil tenant dari header. Proxy hanya set x-tenant-id untuk page requests;
    // untuk API calls dari customer portal hanya x-tenant-slug yang tersedia.
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
            .from('barbers')
            .select('*')
            .eq('role', 'barber')
            .eq('is_active', true)
            .order('name', { ascending: true });

        // Wajib filter per tenant — jangan tampilkan barber lintas tenant
        if (resolvedTenantId) {
            query = query.eq('tenant_id', resolvedTenantId);
        }

        const { data: barbers, error } = await query;
        if (error) throw error;
        return NextResponse.json(barbers);
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

export async function POST() {
    // Seed barbers (hanya untuk setup awal)
    try {
        const { error } = await supabaseAdmin
            .from('barbers')
            .insert([
                { name: 'John Doe', phone: '+1234567890', specialty: 'Classic Cuts' },
                { name: 'Jane Smith', phone: '+10987654321', specialty: 'Modern Styles' }
            ]);

        if (error) throw error;
        return new NextResponse('Barbers seeded successfully', { status: 201 });
    } catch (error: any) {
        return new NextResponse(error.message, { status: 500 });
    }
}
