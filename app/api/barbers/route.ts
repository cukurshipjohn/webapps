import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { getTenantFromRequest } from '../../../lib/tenant-context';

export async function GET(request: NextRequest) {
    // Ambil tenant dari header (di-inject oleh middleware)
    const { tenantId } = getTenantFromRequest(request);

    try {
        let query = supabaseAdmin
            .from('barbers')
            .select('*')
            .order('name', { ascending: true });

        // Filter per tenant jika ada
        if (tenantId) {
            query = query.eq('tenant_id', tenantId);
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
