import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin', 'barber'], user.role);
        if (!user.tenant_id) return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 403 });

        const { data, error } = await supabaseAdmin
            .from('services')
            .select('*')
            .eq('tenant_id', user.tenant_id)
            .order('created_at', { ascending: true });
            
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
        if (!user.tenant_id) return NextResponse.json({ message: 'Akses ditolak.' }, { status: 403 });
        
        const body = await request.json();
        const { name, price, duration_minutes, service_type } = body;
        
        if (!name || !price || !duration_minutes || !service_type) {
            return NextResponse.json({ message: 'Semua field (nama, harga, durasi, tipe) wajib diisi' }, { status: 400 });
        }
        
        const prefix = service_type === 'HOME' ? 'HOME | ' : 'BARBER | ';
        const formattedName = name.startsWith(prefix) ? name : `${prefix}${name}`;

        const { data, error } = await supabaseAdmin
            .from('services')
            .insert({
                name: formattedName,
                price: parseFloat(price),
                duration_minutes: parseInt(duration_minutes, 10),
                service_type,
                tenant_id: user.tenant_id
            })
            .select()
            .single();
            
        if (error) throw error;
        return NextResponse.json({ message: 'Layanan berhasil ditambahkan', service: data });
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        if (!user.tenant_id) return NextResponse.json({ message: 'Akses ditolak.' }, { status: 403 });
        
        const body = await request.json();
        const { id, name, price, duration_minutes, service_type } = body;
        if (!id || !name || !price || !duration_minutes || !service_type) {
            return NextResponse.json({ message: 'Semua field wajib diisi' }, { status: 400 });
        }

        const { data: existing, error: findError } = await supabaseAdmin
            .from('services')
            .select('id, name')
            .eq('id', id)
            .eq('tenant_id', user.tenant_id)
            .single();
            
        if (findError || !existing) {
            return NextResponse.json({ message: 'Layanan tidak ditemukan atau Anda tidak memiliki akses' }, { status: 404 });
        }

        const prefix = service_type === 'HOME' ? 'HOME | ' : 'BARBER | ';
        let cleanName = name.replace('HOME | ', '').replace('BARBER | ', '');
        const formattedName = `${prefix}${cleanName}`;
        
        const { data, error } = await supabaseAdmin
            .from('services')
            .update({ name: formattedName, price: parseFloat(price), duration_minutes: parseInt(duration_minutes, 10), service_type })
            .eq('id', id)
            .eq('tenant_id', user.tenant_id)
            .select()
            .single();
            
        if (error) throw error;
        return NextResponse.json({ message: 'Layanan berhasil diperbarui', service: data });
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        if (!user.tenant_id) return NextResponse.json({ message: 'Akses ditolak.' }, { status: 403 });
        
        const body = await request.json();
        const { id } = body;
        if (!id) return NextResponse.json({ message: 'ID wajib diisi' }, { status: 400 });

        const { data: existing, error: findError } = await supabaseAdmin
            .from('services')
            .select('id')
            .eq('id', id)
            .eq('tenant_id', user.tenant_id)
            .single();
            
        if (findError || !existing) {
            return NextResponse.json({ message: 'Layanan tidak ditemukan atau Anda tidak memiliki akses' }, { status: 404 });
        }
        
        const { count, error: countError } = await supabaseAdmin
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('service_id', id)
            .eq('tenant_id', user.tenant_id)
            .neq('status', 'cancelled')
            .gt('start_time', new Date().toISOString());
            
        if (countError) throw countError;
        if (count && count > 0) {
            return NextResponse.json({ 
                message: `Tidak dapat menghapus layanan ini karena sedang digunakan di ${count} pesanan aktif.` 
            }, { status: 400 });
        }
        
        const { error } = await supabaseAdmin
            .from('services')
            .delete()
            .eq('id', id)
            .eq('tenant_id', user.tenant_id);
            
        if (error) throw error;
        return NextResponse.json({ message: 'Layanan berhasil dihapus' });
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
