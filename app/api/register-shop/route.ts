import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import jwt from 'jsonwebtoken';

const SLUG_REGEX = /^[a-z0-9-]+$/;
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'cukurship.id';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { shop_name, slug, owner_phone, owner_name, referral_code, affiliate_click_id } = body;

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
                effective_slug: slug,
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

        // ─── 8. PROSES AFFILIATE REFERRAL ─────────────────────────────────
        if (referral_code) {
            try {
                const { data: affiliate } = await supabaseAdmin
                    .from('affiliates')
                    .select('id, name, phone, status')
                    .eq('referral_code', referral_code)
                    .eq('status', 'active')
                    .maybeSingle();

                if (affiliate) {
                    // Update referred_by_code di tenants
                    await supabaseAdmin
                        .from('tenants')
                        .update({ referred_by_code: referral_code })
                        .eq('id', tenantId);

                    // Insert ke affiliate_referrals
                    await supabaseAdmin
                        .from('affiliate_referrals')
                        .insert({
                            affiliate_id: affiliate.id,
                            tenant_id: tenantId,
                            referral_code,
                            status: 'registered'
                        });

                    // Update total_referrals via direct update or standard query
                    const { data: currAff } = await supabaseAdmin
                        .from('affiliates')
                        .select('total_referrals')
                        .eq('id', affiliate.id)
                        .single();
                    
                    if (currAff) {
                        await supabaseAdmin
                            .from('affiliates')
                            .update({ total_referrals: (currAff.total_referrals || 0) + 1 })
                            .eq('id', affiliate.id);
                    }

                    // Update affiliate_clicks
                    if (affiliate_click_id) {
                        await supabaseAdmin
                            .from('affiliate_clicks')
                            .update({ 
                                converted: true, 
                                converted_tenant_id: tenantId 
                            })
                            .eq('id', affiliate_click_id)
                            .eq('affiliate_id', affiliate.id);
                    }

                    // Kirim Notifikasi WA ke Affiliator
                    let waServiceUrl = process.env.WHATSAPP_SERVICE_URL;
                    const waSecret = process.env.WHATSAPP_SERVICE_SECRET;
                    if (waServiceUrl && waSecret) {
                        if (!waServiceUrl.startsWith('http')) waServiceUrl = `https://${waServiceUrl}`;
                        const affMessage = `🎉 *Referral Baru!*\n\nToko *${shop_name}* baru saja mendaftar via kode kamu.\nStatus: Menunggu pembayaran pertama\nKode: ${referral_code}`;
                        
                        fetch(`${waServiceUrl}/send-message`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': waSecret,
                            },
                            body: JSON.stringify({ phoneNumber: affiliate.phone, message: affMessage }),
                        }).catch(err => console.error('[Register Shop] WA Affiliate error:', err));
                    }
                }
            } catch (affError) {
                console.error('[Register Shop] Affiliate referral tracking error:', affError);
            }
        }

        // ─── 9. KIRIM WA SAMBUTAN ─────────────────────────────────────────
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
                    'Authorization': waSecret,
                },
                body: JSON.stringify({ phoneNumber: owner_phone, message: welcomeMessage }),
            }).catch(err => console.error('[Register Shop] WA error:', err));
        }

        // ─── 10. RETURN SUCCESS ─────────────────────────────────────────────
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
