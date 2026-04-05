import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════
// PATCH — Hubungkan / Update Chat ID Telegram barber
// ═══════════════════════════════════════════════════════════════
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);

        if (!user.tenant_id) {
            return NextResponse.json({ message: 'Akses ditolak: Anda tidak terhubung ke tenant mana pun.' }, { status: 403 });
        }

        const { id: barberId } = await params;
        const body = await request.json();
        const { telegram_chat_id, telegram_username } = body;

        // ── Validasi 1: telegram_chat_id wajib ada dan berupa angka 5-15 digit ──
        if (!telegram_chat_id || typeof telegram_chat_id !== 'string') {
            return NextResponse.json({
                error: 'VALIDATION_ERROR',
                message: 'Chat ID Telegram wajib diisi.'
            }, { status: 400 });
        }

        const chatIdClean = telegram_chat_id.trim();
        if (!/^\d{5,15}$/.test(chatIdClean)) {
            return NextResponse.json({
                error: 'INVALID_CHAT_ID',
                message: 'Chat ID harus berupa angka saja (5-15 digit). Jangan ketik @username, ketik angkanya.'
            }, { status: 400 });
        }

        // ── Validasi 2: Pastikan barber ini milik tenant yang sama ──
        const { data: barber, error: findError } = await supabaseAdmin
            .from('barbers')
            .select('id, name, tenant_id')
            .eq('id', barberId)
            .eq('tenant_id', user.tenant_id)
            .single();

        if (findError || !barber) {
            return NextResponse.json({
                message: 'Kapster tidak ditemukan atau Anda tidak memiliki akses.'
            }, { status: 404 });
        }

        // ── Validasi 3: Cek duplikat dalam tenant yang sama ──
        const { data: dupSameTenant } = await supabaseAdmin
            .from('barbers')
            .select('id, name')
            .eq('telegram_chat_id', chatIdClean)
            .eq('tenant_id', user.tenant_id)
            .neq('id', barberId)
            .maybeSingle();

        if (dupSameTenant) {
            return NextResponse.json({
                error: 'CHAT_ID_DUPLICATE',
                message: `Chat ID ini sudah terdaftar untuk barber lain (${dupSameTenant.name}) di toko ini.`
            }, { status: 409 });
        }

        // ── Validasi 4: Cek duplikat lintas tenant ──
        const { data: dupOtherTenant } = await supabaseAdmin
            .from('barbers')
            .select('id, tenant_id')
            .eq('telegram_chat_id', chatIdClean)
            .neq('tenant_id', user.tenant_id)
            .maybeSingle();

        if (dupOtherTenant) {
            return NextResponse.json({
                error: 'CHAT_ID_TAKEN',
                message: 'Chat ID ini sudah digunakan di toko lain.'
            }, { status: 409 });
        }

        // ── Update barber ──
        const usernameClean = telegram_username
            ? telegram_username.trim().replace(/^@/, '')
            : null;

        const { data: updated, error: updateError } = await supabaseAdmin
            .from('barbers')
            .update({
                telegram_chat_id: chatIdClean,
                telegram_username: usernameClean || null,
            })
            .eq('id', barberId)
            .eq('tenant_id', user.tenant_id)
            .select('id, name, telegram_chat_id, telegram_username')
            .single();

        if (updateError) throw updateError;

        return NextResponse.json({
            success: true,
            barber: updated,
            message: `Telegram ${updated.name} berhasil dihubungkan`
        });

    } catch (error: any) {
        if (error.message?.includes('403 Forbidden')) {
            return NextResponse.json({ message: error.message }, { status: 403 });
        }
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

// ═══════════════════════════════════════════════════════════════
// DELETE — Putuskan koneksi Telegram barber
// ═══════════════════════════════════════════════════════════════
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);

        if (!user.tenant_id) {
            return NextResponse.json({ message: 'Akses ditolak: Anda tidak terhubung ke tenant mana pun.' }, { status: 403 });
        }

        const { id: barberId } = await params;

        // Pastikan barber ini milik tenant yang sama
        const { data: barber, error: findError } = await supabaseAdmin
            .from('barbers')
            .select('id, name, tenant_id')
            .eq('id', barberId)
            .eq('tenant_id', user.tenant_id)
            .single();

        if (findError || !barber) {
            return NextResponse.json({
                message: 'Kapster tidak ditemukan atau Anda tidak memiliki akses.'
            }, { status: 404 });
        }

        const { error: updateError } = await supabaseAdmin
            .from('barbers')
            .update({
                telegram_chat_id: null,
                telegram_username: null,
            })
            .eq('id', barberId)
            .eq('tenant_id', user.tenant_id);

        if (updateError) throw updateError;

        return NextResponse.json({
            success: true,
            message: `Telegram ${barber.name} berhasil diputuskan`
        });

    } catch (error: any) {
        if (error.message?.includes('403 Forbidden')) {
            return NextResponse.json({ message: error.message }, { status: 403 });
        }
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
