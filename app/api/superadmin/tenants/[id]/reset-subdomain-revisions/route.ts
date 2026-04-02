import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * PATCH /api/superadmin/tenants/[id]/reset-subdomain-revisions
 * Superadmin: Tambah jatah revisi custom subdomain ke tenant tertentu.
 * Body: { add_revisions: number } (1–5)
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // ─── 1. Auth ────────────────────────────────────────────────────────────
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        if (user.role !== 'superadmin') {
            return NextResponse.json({ message: 'Forbidden: Superadmin only' }, { status: 403 });
        }

        const tenantId = (await params).id;
        if (!tenantId) return NextResponse.json({ message: 'ID tenant diperlukan.' }, { status: 400 });

        // ─── 2. Validasi body ────────────────────────────────────────────────────
        const body = await request.json();
        const addRevisions = Number(body.add_revisions);

        if (!Number.isInteger(addRevisions) || addRevisions < 1 || addRevisions > 5) {
            return NextResponse.json({
                message: 'add_revisions harus bilangan bulat antara 1–5.',
            }, { status: 400 });
        }

        // ─── 3. Ambil tenant (SELECT eksplisit) ──────────────────────────────────
        const { data: tenant, error: tenantError } = await supabaseAdmin
            .from('tenants')
            .select('id, plan, subdomain_revisions_remaining, shop_name, owner_user_id')
            .eq('id', tenantId)   // ← WAJIB
            .single();

        if (tenantError || !tenant) {
            return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 404 });
        }

        // ─── 4. Hitung total baru ────────────────────────────────────────────────
        const currentRevisions = tenant.subdomain_revisions_remaining ?? 0;
        const newRevisions     = currentRevisions + addRevisions;

        // ─── 5. Update tenants .eq('id', tenantId) ───────────────────────────────
        const { error: updateError } = await supabaseAdmin
            .from('tenants')
            .update({ subdomain_revisions_remaining: newRevisions })
            .eq('id', tenantId);   // ← WAJIB (bukan .eq('tenant_id', ...))

        if (updateError) {
            console.error('[Reset Revisions] Failed to update:', updateError);
            return NextResponse.json({ message: 'Gagal memperbarui revisi.' }, { status: 500 });
        }

        console.log(`[Reset Revisions] ✅ tenant=${tenantId} | ${currentRevisions} → ${newRevisions} (+${addRevisions})`);

        // ─── 6. Kirim WA ke owner (non-blocking) ────────────────────────────────
        sendRevisionWA(tenant.owner_user_id, tenant.shop_name, addRevisions, newRevisions).catch(err =>
            console.error('[Reset Revisions] WA error:', err)
        );

        return NextResponse.json({
            success: true,
            new_revisions_remaining: newRevisions,
        });

    } catch (error: any) {
        console.error('[Reset Revisions] Error:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

// ─── Helper: Kirim WA notifikasi ke owner tenant ─────────────────────────────
async function sendRevisionWA(
    ownerUserId: string | null,
    shopName: string,
    addedRevisions: number,
    newTotal: number
): Promise<void> {
    if (!ownerUserId) return;

    const { data: owner } = await supabaseAdmin
        .from('users')
        .select('phone_number')
        .eq('id', ownerUserId)
        .single();

    if (!owner?.phone_number) return;

    const waUrl    = process.env.WHATSAPP_SERVICE_URL;
    const waSecret = process.env.WHATSAPP_SERVICE_SECRET;
    if (!waUrl || !waSecret) return;

    const baseUrl = waUrl.startsWith('http') ? waUrl : `https://${waUrl}`;

    const message =
        `ℹ️ *Info dari Tim CukurShip:*\n\n` +
        `Jatah revisi custom subdomain kamu telah ditambah *${addedRevisions} kali*.\n` +
        `Sisa revisi sekarang: *${newTotal} kali*.\n\n` +
        `Hubungi support jika ada pertanyaan.`;

    await fetch(`${baseUrl}/send-message`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${waSecret}`,
        },
        body: JSON.stringify({ phoneNumber: owner.phone_number, message }),
    });
}
