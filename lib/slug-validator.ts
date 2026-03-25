import { supabaseAdmin } from '@/lib/supabase';

// ─── Daftar slug yang dilarang (dicadangkan untuk sistem) ────────────────────
const BLACKLIST = new Set([
    'www', 'app', 'api', 'admin', 'mail', 'ftp', 'dashboard',
    'superadmin', 'register', 'login', 'billing', 'support',
    'help', 'docs', 'status', 'blog', 'cukurship', 'static', 'cdn',
]);

/**
 * Validasi format slug custom subdomain.
 * Harus dipanggil SEBELUM checkSlugAvailability.
 */
export function validateSlugFormat(slug: string): { valid: boolean; error?: string } {
    if (!slug || slug.trim().length === 0) {
        return { valid: false, error: 'Subdomain tidak boleh kosong' };
    }

    const s = slug.trim().toLowerCase();

    if (s.length < 3) {
        return { valid: false, error: 'Subdomain minimal 3 karakter' };
    }

    if (s.length > 30) {
        return { valid: false, error: 'Subdomain maksimal 30 karakter' };
    }

    if (!/^[a-z0-9-]+$/.test(s)) {
        return { valid: false, error: 'Hanya huruf kecil, angka, dan tanda hubung (-)' };
    }

    if (s.startsWith('-') || s.endsWith('-')) {
        return { valid: false, error: 'Tidak boleh diawali/diakhiri tanda hubung' };
    }

    if (s.includes('--')) {
        return { valid: false, error: 'Tidak boleh mengandung dua tanda hubung berturut-turut' };
    }

    if (BLACKLIST.has(s)) {
        return { valid: false, error: 'Nama ini tidak tersedia' };
    }

    return { valid: true };
}

/**
 * Cek ketersediaan slug di database.
 * Memeriksa tabel tenants (effective_slug, custom_slug, slug) dan reserved_slugs.
 *
 * @param slug           - Slug yang ingin dicek
 * @param excludeTenantId - UUID tenant yang dikecualikan (agar tenant tidak conflict dengan dirinya sendiri)
 */
export async function checkSlugAvailability(
    slug: string,
    excludeTenantId?: string
): Promise<{ available: boolean; reason?: string }> {
    // Cek 1: Apakah slug sudah dipakai di tabel tenants?
    // Memeriksa effective_slug (slug aktif routing), custom_slug, dan slug awal
    const { data: existing } = await supabaseAdmin
        .from('tenants')
        .select('id, effective_slug, custom_slug, slug')
        .or(`effective_slug.eq.${slug},custom_slug.eq.${slug},slug.eq.${slug}`)
        .maybeSingle();  // maybeSingle agar tidak error jika tidak ada

    if (existing && existing.id !== excludeTenantId) {
        return { available: false, reason: 'Sudah digunakan barbershop lain' };
    }

    // Cek 2: Apakah slug masih dalam masa reservasi?
    // (slug lama yang baru saja dilepas, reserved selama 30 hari)
    const { data: reserved } = await supabaseAdmin
        .from('reserved_slugs')
        .select('slug, reserved_until, tenant_id')
        .eq('slug', slug)
        .gt('reserved_until', new Date().toISOString())
        .maybeSingle();

    if (reserved) {
        // Kecualikan jika yang mereservasi adalah tenant yang sama
        if (reserved.tenant_id !== excludeTenantId) {
            return { available: false, reason: 'Nama ini baru saja dipakai dan masih direservasi' };
        }
    }

    return { available: true };
}
