import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Helper — validasi kepemilikan barber terhadap tenant yang login
async function validateBarberOwnership(barberId: string, tenantId: string) {
    const { data, error } = await supabaseAdmin
        .from('barbers')
        .select('id, name')
        .eq('id', barberId)
        .eq('tenant_id', tenantId)
        .single();
    if (error || !data) return null;
    return data;
}

// ═══════════════════════════════════════════════════════════════
// GET /api/admin/barbers/[id]/schedule
// Ambil jadwal 7 hari untuk kapster tertentu.
// Hari yang tidak ada record = kapster ikuti jam toko (default).
// ═══════════════════════════════════════════════════════════════
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        if (!user.tenant_id) return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });

        const { id: barberId } = await params;

        const barber = await validateBarberOwnership(barberId, user.tenant_id);
        if (!barber) {
            return NextResponse.json({ error: 'Kapster tidak ditemukan atau Anda tidak memiliki akses.' }, { status: 404 });
        }

        const { data: schedule, error } = await supabaseAdmin
            .from('barber_schedule')
            .select('id, day_of_week, open_time, close_time, is_working')
            .eq('barber_id', barberId)
            .eq('tenant_id', user.tenant_id)
            .order('day_of_week', { ascending: true });

        if (error) throw error;

        return NextResponse.json({
            barber_id:   barberId,
            barber_name: barber.name,
            schedule:    schedule || [],  // array 0–7 entri; hari yang hilang = ikuti jam toko
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// ═══════════════════════════════════════════════════════════════
// PUT /api/admin/barbers/[id]/schedule
// Upsert satu hari OR bulk 7 hari sekaligus.
//
// Body (satu hari):
//   { day_of_week: 1, open_time: "09:00", close_time: "17:00", is_working: true }
//
// Body (bulk):
//   { entries: [ { day_of_week, open_time, close_time, is_working }, ... ] }
// ═══════════════════════════════════════════════════════════════
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        if (!user.tenant_id) return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });

        const { id: barberId } = await params;

        const barber = await validateBarberOwnership(barberId, user.tenant_id);
        if (!barber) {
            return NextResponse.json({ error: 'Kapster tidak ditemukan atau Anda tidak memiliki akses.' }, { status: 404 });
        }

        const body = await request.json();

        // ── Tentukan apakah single-day atau bulk ──
        const isBulk = Array.isArray(body.entries);
        const rawEntries = isBulk
            ? body.entries
            : [{ day_of_week: body.day_of_week, open_time: body.open_time, close_time: body.close_time, is_working: body.is_working }];

        // ── Validasi tiap entri ──
        for (const entry of rawEntries) {
            const { day_of_week, open_time, close_time, is_working } = entry;

            if (day_of_week === undefined || day_of_week < 0 || day_of_week > 6) {
                return NextResponse.json({ error: `day_of_week harus antara 0 (Minggu) dan 6 (Sabtu). Diterima: ${day_of_week}` }, { status: 400 });
            }
            // Jika kapster kerja (is_working = true), jam harus disertakan
            if (is_working !== false) {
                if (!open_time || !close_time) {
                    return NextResponse.json({ error: `open_time dan close_time wajib diisi untuk hari ${day_of_week} saat is_working = true.` }, { status: 400 });
                }
                if (open_time >= close_time) {
                    return NextResponse.json({ error: `close_time harus lebih besar dari open_time untuk hari ${day_of_week}.` }, { status: 400 });
                }
            }
        }

        // ── Build upsert payload ──
        const upsertPayload = rawEntries.map((entry: any) => ({
            tenant_id:   user.tenant_id,
            barber_id:   barberId,
            day_of_week: entry.day_of_week,
            // Jika libur (is_working=false), simpan jam dummy agar constraint NOT NULL terpenuhi
            open_time:   entry.is_working === false ? '00:00' : entry.open_time,
            close_time:  entry.is_working === false ? '00:01' : entry.close_time,
            is_working:  entry.is_working ?? true,
        }));

        const { data, error } = await supabaseAdmin
            .from('barber_schedule')
            .upsert(upsertPayload, { onConflict: 'barber_id,day_of_week' })
            .select();

        if (error) throw error;

        return NextResponse.json({
            message: isBulk
                ? `Jadwal ${rawEntries.length} hari berhasil disimpan untuk ${barber.name}`
                : `Jadwal hari ${rawEntries[0].day_of_week} berhasil disimpan untuk ${barber.name}`,
            schedule: data,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// ═══════════════════════════════════════════════════════════════
// DELETE /api/admin/barbers/[id]/schedule
// Hapus jadwal hari tertentu → kapster kembali ikuti jam toko.
// Body: { day_of_week: 1 }   atau   { all: true } untuk reset semua
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

        const { id: barberId } = await params;

        const barber = await validateBarberOwnership(barberId, user.tenant_id);
        if (!barber) {
            return NextResponse.json({ error: 'Kapster tidak ditemukan atau Anda tidak memiliki akses.' }, { status: 404 });
        }

        const body = await request.json();

        let query = supabaseAdmin
            .from('barber_schedule')
            .delete()
            .eq('barber_id', barberId)
            .eq('tenant_id', user.tenant_id);

        if (body.all === true) {
            // Reset semua jadwal kapster → semua hari kembali ikuti jam toko
            const { error } = await query;
            if (error) throw error;
            return NextResponse.json({ message: `Semua jadwal kustom ${barber.name} dihapus. Kapster kini mengikuti jam toko.` });
        }

        if (body.day_of_week === undefined || body.day_of_week < 0 || body.day_of_week > 6) {
            return NextResponse.json({ error: 'day_of_week harus antara 0 dan 6, atau gunakan { all: true } untuk hapus semua.' }, { status: 400 });
        }

        const { error } = await query.eq('day_of_week', body.day_of_week);
        if (error) throw error;

        const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        return NextResponse.json({
            message: `Jadwal ${dayNames[body.day_of_week]} ${barber.name} dihapus. Hari ini kini mengikuti jam toko.`
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
