import { NextRequest, NextResponse } from 'next/server';
import { createTenantClient } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET all time_off records for the tenant
export async function GET(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);

        const tenantId = user.tenant_id;
        const tenantClient = createTenantClient(tenantId!);

        // Fetch time off records and join with barbers to get their names
        const { data, error } = await tenantClient
            .from('time_off')
            .select(`
                *,
                barbers (
                    name
                )
            `)
            .order('start_date', { ascending: true });

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

// POST a new time_off record
export async function POST(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);

        const tenantId = user.tenant_id;
        const body = await request.json();

        // Validation
        if (!body.start_date || !body.end_date) {
             return NextResponse.json({ message: 'Tanggal mulai dan selesai wajib diisi.' }, { status: 400 });
        }
        
        const tenantClient = createTenantClient(tenantId!);

        const { data, error } = await tenantClient
            .from('time_off')
            .insert([{
                tenant_id: tenantId,
                barber_id: body.barber_id || null, // null means whole shop
                start_date: body.start_date,
                end_date: body.end_date,
                description: body.description || ''
            }])
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ message: 'Data cuti/libur berhasil ditambahkan.', data });
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

// DELETE a time_off record
export async function DELETE(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);

        const tenantId = user.tenant_id;
        const tenantClient = createTenantClient(tenantId!);
        
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ message: 'ID required' }, { status: 400 });
        }

        const { error } = await tenantClient
            .from('time_off')
            .delete()
            .eq('id', id);

        if (error) throw error;

        return NextResponse.json({ message: 'Data cuti/libur berhasil dihapus.' });
    } catch (error: any) {
         return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
