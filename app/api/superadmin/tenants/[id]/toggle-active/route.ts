import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

function requireSuperAdmin(request: NextRequest) {
    const user = getUserFromToken(request);
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'superadmin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    return user;
}

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const user = requireSuperAdmin(request);
        if (user instanceof NextResponse) return user;

        const tenantId = params.id;

        // Ambil status tenant saat ini
        const { data: tenant, error: fetchError } = await supabaseAdmin
            .from('tenants')
            .select('id, shop_name, is_active, owner_user_id')
            .eq('id', tenantId)
            .single();

        if (fetchError || !tenant) {
            return NextResponse.json({ message: 'Tenant tidak ditemukan' }, { status: 404 });
        }

        const newActiveState = !tenant.is_active;

        // Update status
        const { error: updateError } = await supabaseAdmin
            .from('tenants')
            .update({ is_active: newActiveState })
            .eq('id', tenantId);

        if (updateError) throw updateError;

        // Kirim WA notifikasi ke owner jika dinonaktifkan
        if (!newActiveState) {
            const { data: owner } = await supabaseAdmin
                .from('users')
                .select('phone_number')
                .eq('id', tenant.owner_user_id)
                .single();

            if (owner?.phone_number) {
                const waUrl = process.env.WHATSAPP_SERVICE_URL;
                const waSecret = process.env.WHATSAPP_SERVICE_SECRET;
                if (waUrl && waSecret) {
                    await fetch(`${waUrl}/send-message`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-internal-secret': waSecret },
                        body: JSON.stringify({
                            phoneNumber: owner.phone_number,
                            message: `⚠️ *Akun CukurShip Dinonaktifkan*\n\nHalo, akun barbershop *${tenant.shop_name}* Anda telah dinonaktifkan sementara oleh administrator CukurShip.\n\nSilakan hubungi support untuk informasi lebih lanjut.`,
                        }),
                    }).catch(() => {}); // non-blocking
                }
            }
        }

        return NextResponse.json({
            message: `Tenant berhasil ${newActiveState ? 'diaktifkan' : 'dinonaktifkan'}`,
            is_active: newActiveState,
        });

    } catch (error: any) {
        console.error('[Superadmin Toggle Active] Error:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
