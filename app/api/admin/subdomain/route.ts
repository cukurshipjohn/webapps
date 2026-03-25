import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';
import { canCustomSubdomain } from '@/lib/billing-plans';
import { validateSlugFormat, checkSlugAvailability } from '@/lib/slug-validator';

export const dynamic = 'force-dynamic';

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'cukurship.id';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/subdomain
// Info subdomain tenant saat ini: slug awal, effective, custom, revisi tersisa
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
    try {
        // 1. Auth
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);

        const tenantId = user.tenant_id;
        if (!tenantId) {
            return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 403 });
        }

        // 2. Ambil data subdomain tenant
        const { data: tenant, error } = await supabaseAdmin
            .from('tenants')
            .select(`
                id, slug, effective_slug, custom_slug,
                subdomain_revisions_remaining, subdomain_revision_history,
                plan
            `)
            .eq('id', tenantId)   // ← WAJIB
            .single();

        if (error || !tenant) {
            return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 404 });
        }

        const effectiveSlug   = tenant.effective_slug || tenant.slug;
        const canCustomize     = canCustomSubdomain(tenant.plan || 'starter');

        return NextResponse.json({
            original_slug:            tenant.slug,
            current_effective_slug:   effectiveSlug,
            custom_slug:              tenant.custom_slug ?? null,
            revisions_remaining:      tenant.subdomain_revisions_remaining ?? 0,
            revision_history:         tenant.subdomain_revision_history ?? [],
            can_customize:            canCustomize,
            plan:                     tenant.plan || 'starter',
            current_url:              `https://${effectiveSlug}.${APP_DOMAIN}`,
        });

    } catch (error: any) {
        console.error('[Subdomain GET] Error:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/subdomain
// Set atau ganti custom subdomain tenant dengan tracking revisi
// Body: { new_slug: string }
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
    try {
        // 1. Auth
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);

        const tenantId = user.tenant_id;
        if (!tenantId) {
            return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 403 });
        }

        const body = await request.json();
        const new_slug = (body.new_slug || '').trim().toLowerCase();

        if (!new_slug) {
            return NextResponse.json({ message: 'new_slug diperlukan.' }, { status: 400 });
        }

        // 2. Ambil data tenant lengkap
        const { data: tenant, error: tenantError } = await supabaseAdmin
            .from('tenants')
            .select(`
                id, plan, slug, custom_slug, effective_slug,
                subdomain_revisions_remaining, subdomain_revision_history,
                owner_user_id
            `)
            .eq('id', tenantId)   // ← WAJIB
            .single();

        if (tenantError || !tenant) {
            return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 404 });
        }

        // 3. Cek apakah plan mendukung custom subdomain
        if (!canCustomSubdomain(tenant.plan || 'starter')) {
            return NextResponse.json({
                message: 'Fitur custom subdomain hanya tersedia untuk paket tahunan (Starter, Pro, atau Business Tahunan).',
            }, { status: 403 });
        }

        // 4. Validasi format slug baru
        const formatCheck = validateSlugFormat(new_slug);
        if (!formatCheck.valid) {
            return NextResponse.json({ message: formatCheck.error }, { status: 400 });
        }

        // 5. Cek ketersediaan (exclude tenant sendiri)
        const availability = await checkSlugAvailability(new_slug, tenantId);
        if (!availability.available) {
            return NextResponse.json({
                message: availability.reason || 'Subdomain tidak tersedia.',
            }, { status: 409 });
        }

        // 6. Tentukan apakah ini set pertama atau ganti
        const isFirstTime = tenant.custom_slug === null;

        if (!isFirstTime) {
            // Ganti slug — cek sisa revisi
            const revisionsLeft = tenant.subdomain_revisions_remaining ?? 0;
            if (revisionsLeft <= 0) {
                return NextResponse.json({
                    message: 'Jatah revisi subdomain kamu sudah habis. Upgrade ke paket yang lebih tinggi untuk menambah jatah.',
                }, { status: 403 });
            }
        }

        // 7. Jika bukan pertama kali → reservasi slug LAMA agar tidak direbut orang lain
        if (!isFirstTime && tenant.custom_slug) {
            const reserveUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

            const { error: reserveError } = await supabaseAdmin
                .from('reserved_slugs')
                .upsert(
                    {
                        slug: tenant.custom_slug,        // slug LAMA
                        tenant_id: tenantId,
                        reserved_until: reserveUntil,
                        reason: 'subdomain_change',
                        created_at: new Date().toISOString(),
                    },
                    { onConflict: 'slug' }
                );

            if (reserveError) {
                console.error('[Subdomain POST] Failed to reserve old slug:', reserveError);
                // Non-fatal — lanjutkan proses update
            }
        }

        // 8. Hitung sisa revisi setelah operasi ini
        // Set pertama → revisi tidak berkurang (ini bukan "ganti", ini "set awal")
        // Ganti berikutnya → berkurang 1
        const newRevisions = isFirstTime
            ? (tenant.subdomain_revisions_remaining ?? 0)
            : (tenant.subdomain_revisions_remaining ?? 0) - 1;

        // 9. Susun riwayat revisi (append entry baru)
        const existingHistory: Array<{ old_slug: string; new_slug: string; changed_at: string }> =
            tenant.subdomain_revision_history ?? [];

        const updatedHistory = [
            ...existingHistory,
            {
                old_slug:   tenant.custom_slug ?? tenant.slug,  // dari mana
                new_slug,                                        // ke mana
                changed_at: new Date().toISOString(),
            },
        ];

        // 10. Update tenants — WAJIB .eq('id', tenantId)
        const { error: updateError } = await supabaseAdmin
            .from('tenants')
            .update({
                custom_slug:                    new_slug,
                effective_slug:                 new_slug,   // langsung aktif untuk proxy routing
                subdomain_revisions_remaining:  newRevisions,
                subdomain_revision_history:     updatedHistory,
            })
            .eq('id', tenantId);   // ← WAJIB

        if (updateError) {
            console.error('[Subdomain POST] Failed to update tenant:', updateError);
            return NextResponse.json({ message: 'Gagal memperbarui subdomain.' }, { status: 500 });
        }

        const newUrl = `https://${new_slug}.${APP_DOMAIN}`;

        // 11. Kirim WA ke owner (non-blocking)
        sendSubdomainWA(tenant.owner_user_id, new_slug, newUrl, newRevisions).catch((err) =>
            console.error('[Subdomain POST] WA send failed:', err)
        );

        console.log(
            `[Subdomain POST] ✅ tenant=${tenantId} | ${isFirstTime ? 'set' : 'changed'} → ${new_slug} | revisions_left=${newRevisions}`
        );

        return NextResponse.json({
            success: true,
            new_slug,
            new_url: newUrl,
            revisions_remaining: newRevisions,
            message: 'Subdomain berhasil diperbarui!',
            is_first_time: isFirstTime,
        });

    } catch (error: any) {
        console.error('[Subdomain POST] Error:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Kirim notifikasi WA ke owner setelah ganti subdomain
// ─────────────────────────────────────────────────────────────────────────────
async function sendSubdomainWA(
    ownerUserId: string | null,
    newSlug: string,
    newUrl: string,
    revisionsRemaining: number
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

    const revisionNote = revisionsRemaining > 0
        ? `Sisa revisi: *${revisionsRemaining} kali*`
        : `⚠️ Jatah revisi sudah habis. Subdomain tidak bisa diubah lagi.`;

    const message =
        `✅ *Subdomain Berhasil Diperbarui!*\n\n` +
        `URL baru toko kamu:\n*${newUrl}*\n\n` +
        `${revisionNote}\n\n` +
        `💡 Bagikan URL baru ini ke pelangganmu ya! 💈`;

    await fetch(`${baseUrl}/send-message`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${waSecret}`,   // ← WHATSAPP_SERVICE_SECRET sebagai Bearer
        },
        body: JSON.stringify({ phoneNumber: owner.phone_number, message }),
    });
}
