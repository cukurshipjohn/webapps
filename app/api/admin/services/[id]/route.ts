import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════
// PATCH /api/admin/services/[id] — Update layanan
// ═══════════════════════════════════════════════════════════════
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        if (!user.tenant_id) return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });

        const { id: serviceId } = await params;
        const body = await request.json();

        // ── Validasi ownership ──
        const { data: existing, error: findError } = await supabaseAdmin
            .from('services')
            .select('id, name, service_type, tenant_id')
            .eq('id', serviceId)
            .eq('tenant_id', user.tenant_id)
            .single();

        if (findError || !existing) {
            return NextResponse.json({ error: 'Layanan tidak ditemukan atau Anda tidak memiliki akses.' }, { status: 404 });
        }

        // ── Blokir perubahan service_type (immutable setelah dibuat) ──
        if (body.service_type !== undefined && body.service_type !== existing.service_type) {
            return NextResponse.json({
                error: 'Tipe layanan tidak dapat diubah setelah dibuat. Hapus layanan ini dan buat baru jika ingin mengganti tipe.'
            }, { status: 400 });
        }

        // ── Validasi price_type jika dikirim ──
        if (body.price_type !== undefined) {
            if (!['fixed', 'range', 'custom'].includes(body.price_type)) {
                return NextResponse.json({ error: 'price_type tidak valid.' }, { status: 400 });
            }
            if (body.price_type === 'range') {
                const pMin = body.price_min ?? null;
                const pMax = body.price_max ?? null;
                if (pMin === null || pMax === null) {
                    return NextResponse.json({ error: 'price_min dan price_max wajib diisi untuk tipe harga range.' }, { status: 400 });
                }
                if (Number(pMin) >= Number(pMax)) {
                    return NextResponse.json({ error: 'price_min harus lebih kecil dari price_max.' }, { status: 400 });
                }
            }
        }

        // ── Build update payload (hanya field yang dikirim) ──
        const updatePayload: Record<string, any> = {};
        if (body.name !== undefined) updatePayload.name = body.name.trim();
        if (body.price !== undefined) updatePayload.price = Number(body.price);
        if (body.price_type !== undefined) updatePayload.price_type = body.price_type;
        if (body.price_min !== undefined) updatePayload.price_min = body.price_min !== null ? Number(body.price_min) : null;
        if (body.price_max !== undefined) updatePayload.price_max = body.price_max !== null ? Number(body.price_max) : null;
        if (body.duration_minutes !== undefined) updatePayload.duration_minutes = parseInt(body.duration_minutes, 10);
        if (body.is_active !== undefined) updatePayload.is_active = body.is_active;
        if (body.show_in_pos !== undefined) updatePayload.show_in_pos = body.show_in_pos;

        if (Object.keys(updatePayload).length === 0) {
            return NextResponse.json({ error: 'Tidak ada field yang diubah.' }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin
            .from('services')
            .update(updatePayload)
            .eq('id', serviceId)
            .eq('tenant_id', user.tenant_id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({
            message: 'Layanan berhasil diperbarui',
            service: data
        });
    } catch (error: any) {
        if (error.message?.includes('403 Forbidden')) {
            return NextResponse.json({ error: error.message }, { status: 403 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// ═══════════════════════════════════════════════════════════════
// DELETE /api/admin/services/[id] — Hard delete layanan
// FK bookings.service_id → SET NULL (riwayat booking tetap aman)
// FK service_barber_pricing.service_id → CASCADE (otomatis dibersihkan)
// ═══════════════════════════════════════════════════════════════
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        if (!user.tenant_id) return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });

        const { id: serviceId } = await params;

        // ── Validasi ownership ──
        const { data: existing, error: findError } = await supabaseAdmin
            .from('services')
            .select('id, name, tenant_id')
            .eq('id', serviceId)
            .eq('tenant_id', user.tenant_id)
            .single();

        if (findError || !existing) {
            return NextResponse.json({ error: 'Layanan tidak ditemukan atau Anda tidak memiliki akses.' }, { status: 404 });
        }

        // ── Hard delete — FK constraints handle cleanup automatically:
        //    bookings.service_id → SET NULL   (riwayat booking tetap ada)
        //    service_barber_pricing → CASCADE  (data pricing barber ikut terhapus)
        const { error } = await supabaseAdmin
            .from('services')
            .delete()
            .eq('id', serviceId)
            .eq('tenant_id', user.tenant_id);

        if (error) throw error;

        return NextResponse.json({
            message: `Layanan "${existing.name}" berhasil dihapus`,
            service_id: serviceId
        });
    } catch (error: any) {
        if (error.message?.includes('403 Forbidden')) {
            return NextResponse.json({ error: error.message }, { status: 403 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
