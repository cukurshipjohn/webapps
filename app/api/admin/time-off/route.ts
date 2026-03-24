import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        if (!user.tenant_id) return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 403 });

        const { data, error } = await supabaseAdmin
            .from('time_off')
            .select(`*, barbers(name)`)
            .eq('tenant_id', user.tenant_id)
            .order('start_date', { ascending: true });

        if (error) throw error;
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        if (!user.tenant_id) return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 403 });

        const body = await request.json();
        if (!body.start_date || !body.end_date) {
             return NextResponse.json({ message: 'Tanggal mulai dan selesai wajib diisi.' }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin
            .from('time_off')
            .insert([{
                tenant_id: user.tenant_id,
                barber_id: body.barber_id || null,
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

export async function DELETE(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        if (!user.tenant_id) return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 403 });
        
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ message: 'ID required' }, { status: 400 });

        const { error } = await supabaseAdmin
            .from('time_off')
            .delete()
            .eq('id', id)
            .eq('tenant_id', user.tenant_id);

        if (error) throw error;
        return NextResponse.json({ message: 'Data cuti/libur berhasil dihapus.' });
    } catch (error: any) {
         return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
