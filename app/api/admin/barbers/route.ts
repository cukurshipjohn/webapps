import { NextRequest, NextResponse } from 'next/server';
import { createTenantClient } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        
        const tenantClient = createTenantClient(user.tenant_id!);

        const { data, error } = await tenantClient
            .from('barbers')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: error.message.includes('403') ? 403 : 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        
        if (!user.tenant_id) {
            return NextResponse.json({ message: 'Akses ditolak: Anda tidak terhubung ke tenant/barbershop mana pun.' }, { status: 403 });
        }

        // ─── PLAN ENFORCEMENT: cek limit max_barbers ───────────────
        const { data: tenantData } = await import('@/lib/supabase').then(m =>
            m.supabaseAdmin.from('tenants').select('max_barbers').eq('id', user.tenant_id!).single()
        );
        const { count: currentBarbers } = await import('@/lib/supabase').then(m =>
            m.supabaseAdmin.from('barbers').select('*', { count: 'exact', head: true }).eq('tenant_id', user.tenant_id!)
        );

        if (tenantData && typeof currentBarbers === 'number' && currentBarbers >= (tenantData.max_barbers ?? 2)) {
            return NextResponse.json({
                message: `Batas kapster tercapai (${tenantData.max_barbers} kapster). Upgrade plan untuk menambah lebih banyak kapster.`,
                upgrade_required: true,
            }, { status: 403 });
        }
        // ───────────────────────────────────────────────────────────
        
        const body = await request.json();
        const { name, phone, specialty, photo_url } = body;
        
        if (!name) return NextResponse.json({ message: 'Nama kapster wajib diisi' }, { status: 400 });
        
        const tenantClient = createTenantClient(user.tenant_id);

        const { data, error } = await tenantClient
            .from('barbers')
            .insert({
                name,
                phone: phone || null,
                specialty: specialty || null,
                photo_url: photo_url || null,
                tenant_id: user.tenant_id
            })
            .select()
            .single();
            
        if (error) throw error;
        return NextResponse.json({ message: 'Kapster berhasil ditambahkan', barber: data });
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        
        if (!user.tenant_id) {
            return NextResponse.json({ message: 'Akses ditolak: Anda tidak terhubung ke tenant mana pun.' }, { status: 403 });
        }
        
        const body = await request.json();
        const { id, name, phone, specialty, photo_url } = body;
        
        if (!id || !name) return NextResponse.json({ message: 'ID dan Nama wajib diisi' }, { status: 400 });
        
        const tenantClient = createTenantClient(user.tenant_id);

        // Memastikan barber ini milik tenant yang sedang login
        // Karena kita pakai tenantClient, RLS akan otomatis menolak jika bukan miliknya
        const { data: existing, error: findError } = await tenantClient
            .from('barbers')
            .select('id')
            .eq('id', id)
            .single();
            
        if (findError || !existing) {
            return NextResponse.json({ message: 'Kapster tidak ditemukan atau Anda tidak memiliki akses' }, { status: 404 });
        }
        
        const { data, error } = await tenantClient
            .from('barbers')
            .update({
                name,
                phone: phone || null,
                specialty: specialty || null,
                photo_url: photo_url || null
            })
            .eq('id', id)
            .select()
            .single();
            
        if (error) throw error;
        return NextResponse.json({ message: 'Data kapster berhasil diperbarui', barber: data });
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        
        if (!user.tenant_id) {
            return NextResponse.json({ message: 'Akses ditolak: Anda tidak terhubung ke tenant mana pun.' }, { status: 403 });
        }
        
        const body = await request.json();
        const { id } = body;
        
        if (!id) return NextResponse.json({ message: 'ID wajib diisi' }, { status: 400 });
        
        const tenantClient = createTenantClient(user.tenant_id);

        const { data: existing, error: findError } = await tenantClient
            .from('barbers')
            .select('id')
            .eq('id', id)
            .single();
            
        if (findError || !existing) {
            return NextResponse.json({ message: 'Kapster tidak ditemukan atau Anda tidak memiliki akses' }, { status: 404 });
        }
        
        // Cek apakah ada booking aktif (start_time > sekarang dan status != cancelled)
        const { count, error: countError } = await tenantClient
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('barber_id', id)
            .neq('status', 'cancelled')
            .gt('start_time', new Date().toISOString());
            
        if (countError) throw countError;
        
        if (count && count > 0) {
            return NextResponse.json({ 
                message: `Tidak dapat menghapus kapster ini. Masih ada ${count} pesanan aktif di masa mendatang.` 
            }, { status: 400 });
        }
        
        const { error } = await tenantClient
            .from('barbers')
            .delete()
            .eq('id', id);
            
        if (error) throw error;
        
        return NextResponse.json({ message: 'Kapster berhasil dihapus' });
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
