import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import jwt from 'jsonwebtoken';

const SLUG_REGEX = /^[a-z0-9-]+$/;
const ROOT_DOMAIN = 'cukurship.id';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { shop_name, slug, owner_phone, owner_name } = body;

        // ─── 1. VALIDASI INPUT ─────────────────────────────────────────────
        if (!shop_name || !slug || !owner_phone || !owner_name) {
            return NextResponse.json({ message: 'Semua field wajib diisi.' }, { status: 400 });
        }

        if (!SLUG_REGEX.test(slug)) {
            return NextResponse.json({
                message: 'URL toko hanya boleh mengandung huruf kecil, angka, dan tanda hubung (-).'
            }, { status: 400 });
        }

        if (slug.length < 3 || slug.length > 32) {
            return NextResponse.json({
                message: 'URL toko harus antara 3 sampai 32 karakter.'
            }, { status: 400 });
        }

        // ─── 2. CEK KETERSEDIAAN SLUG ──────────────────────────────────────
        const { data: existingTenant } = await supabaseAdmin
            .from('tenants')
            .select('id')
            .eq('slug', slug)
            .maybeSingle();

        if (existingTenant) {
            return NextResponse.json({
                message: 'Nama URL sudah digunakan. Silakan pilih yang lain.'
            }, { status: 409 });
        }

        // ─── 3. BUAT / UPDATE USER ─────────────────────────────────────────
        const { data: existingUser } = await supabaseAdmin
            .from('users')
            .select('id, role')
            .eq('phone_number', owner_phone)
            .maybeSingle();

        let userId: string;

        if (existingUser) {
            // Update role menjadi owner
            await supabaseAdmin
                .from('users')
                .update({ name: owner_name, role: 'owner' })
                .eq('id', existingUser.id);
            userId = existingUser.id;
        } else {
            // Buat user baru
            const { data: newUser, error: userError } = await supabaseAdmin
                .from('users')
                .insert({ phone_number: owner_phone, name: owner_name, role: 'owner' })
                .select('id')
                .single();

            if (userError) throw userError;
            userId = newUser.id;
        }

        // ─── 4. BUAT TENANT ────────────────────────────────────────────────
        const planExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 hari

        const { data: newTenant, error: tenantError } = await supabaseAdmin
            .from('tenants')
            .insert({
                slug,
                shop_name,
                owner_user_id: userId,
                plan: 'trial',
                plan_expires_at: planExpiresAt.toISOString(),
                is_active: true,
                max_barbers: 2,
                max_bookings_per_month: 50,
            })
            .select('id')
            .single();

        if (tenantError) throw tenantError;

        const tenantId = newTenant.id;

        // ─── 5. BUAT TENANT_SETTINGS DEFAULT ──────────────────────────────
        await supabaseAdmin
            .from('tenant_settings')
            .insert({
                tenant_id: tenantId,
                shop_name,
                color_primary: '#F59E0B',   // Amber Classic
                color_bg: '#0A0A0A',
                color_surface: '#1C1C1C',
                font_choice: 'Inter',
                use_gradient: false,
                home_service_active: false,
            });

        // ─── 6. UPDATE USER.TENANT_ID ─────────────────────────────────────
        await supabaseAdmin
            .from('users')
            .update({ tenant_id: tenantId })
            .eq('id', userId);

        // ─── 7. GENERATE JWT ──────────────────────────────────────────────
        const token = jwt.sign(
            {
                id: userId,
                phoneNumber: owner_phone,
                role: 'owner',
                tenant_id: tenantId,
            },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '24h' }
        );

        // ─── 8. KIRIM WA SAMBUTAN ─────────────────────────────────────────
        let waServiceUrl = process.env.WHATSAPP_SERVICE_URL;
        const waSecret = process.env.WHATSAPP_SERVICE_SECRET;

        if (waServiceUrl && waSecret) {
            if (!waServiceUrl.startsWith('http')) waServiceUrl = `https://${waServiceUrl}`;

            const welcomeMessage =
                `Halo ${owner_name}! Toko *${shop_name}* kamu sudah berhasil didaftarkan! 🎉\n\n` +
                `🌐 *URL Toko:* https://${slug}.${ROOT_DOMAIN}\n` +
                `🛡️ *Panel Admin:* https://${slug}.${ROOT_DOMAIN}/admin\n\n` +
                `⏳ Masa trial gratis *14 hari* dimulai sekarang.\n` +
                `Selamat beroperasi dan semoga sukses selalu! ✂️`;

            fetch(`${waServiceUrl}/send-message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-internal-secret': waSecret,
                },
                body: JSON.stringify({ phoneNumber: owner_phone, message: welcomeMessage }),
            }).catch(err => console.error('[Register Shop] WA error:', err));
        }

        // ─── 9. RETURN SUCCESS ─────────────────────────────────────────────
        const response = NextResponse.json({
            success: true,
            token,
            shop_url: `${slug}.${ROOT_DOMAIN}`,
            tenant_id: tenantId,
            message: `Toko ${shop_name} berhasil didaftarkan!`,
        }, { status: 201 });

        // Set cookie supaya langsung login di browser
        response.cookies.set({
            name: 'token',
            value: token,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24, // 24 jam
        });

        return response;
    } catch (error: any) {
        console.error('[Register Shop] Error:', error);
        return NextResponse.json({
            message: error.message || 'Terjadi kesalahan saat mendaftarkan toko.',
        }, { status: 500 });
    }
}
