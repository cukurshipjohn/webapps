import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/tenant-context';
import { trackTenantActivity } from '@/lib/activity-tracker';
import jwt from 'jsonwebtoken';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { phoneNumber, otpCode, isAffiliateLogin, isSuperadminLogin } = body;

        if (!phoneNumber || !otpCode) {
            return NextResponse.json({ message: 'Nomor HP dan kode OTP diperlukan.' }, { status: 400 });
        }

        // Baca tenant context dari middleware header
        const { tenantId } = getTenantFromRequest(request);

        // --- MIDTRANS REVIEW BYPASS (MAGIC OTP) ---
        // TODO: Ubah NEXT_PUBLIC_REVIEW_BYPASS_ENABLED menjadi 'false' di Vercel Auth setelah disetujui
        const isBypassEnabled = process.env.NEXT_PUBLIC_REVIEW_BYPASS_ENABLED === 'true';
        const isMagicOtp = isBypassEnabled && phoneNumber === '08111111111' && otpCode === '123456';

        if (!isMagicOtp) {
            // 1. Cek OTP di Supabase — harus cocok, belum expired, belum dipakai
            const { data: sessions, error: fetchError } = await supabaseAdmin
                .from('otp_sessions')
                .select('*')
                .eq('phone_number', phoneNumber)
                .eq('otp_code', otpCode)
                .eq('used', false)
                .gt('expires_at', new Date().toISOString())
                .limit(1);

            if (fetchError) throw fetchError;

            if (!sessions || sessions.length === 0) {
                return NextResponse.json({
                    message: 'Kode OTP tidak valid atau sudah kadaluarsa.'
                }, { status: 401 });
            }

            // 2. Tandai OTP sebagai sudah dipakai
            await supabaseAdmin
                .from('otp_sessions')
                .update({ used: true })
                .eq('id', sessions[0].id);
        }
        // --- END MIDTRANS REVIEW BYPASS ---

        // 3. Cek apakah ini affiliate login — buat JWT khusus affiliator
        if (isAffiliateLogin) {
            const { data: affUser, error: affError } = await supabaseAdmin
                .from('affiliates')
                .select('id, name, phone, tier, referral_code, commission_rate, status')
                .eq('phone', phoneNumber)
                .single();

            if (affError || !affUser) {
                return NextResponse.json({ message: 'Data affiliator tidak ditemukan.' }, { status: 404 });
            }

            const affToken = jwt.sign(
                {
                    affiliate_id: affUser.id,
                    phone: affUser.phone,
                    name: affUser.name,
                    tier: affUser.tier,
                    role: 'affiliate',
                },
                process.env.JWT_SECRET || 'fallback_secret',
                { expiresIn: '7d' }
            );

            const affResponse = NextResponse.json({
                message: 'Login affiliator berhasil!',
                token: affToken,
                affiliate: {
                    id: affUser.id,
                    name: affUser.name,
                    phone: affUser.phone,
                    tier: affUser.tier,
                    referral_code: affUser.referral_code,
                },
            });

            affResponse.cookies.set({
                name: 'affiliate_token',
                value: affToken,
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/',
                maxAge: 60 * 60 * 24 * 7, // 7 hari
            });

            return affResponse;
        }

        // 3. Cari atau buat user — assign tenant_id jika ada
        const { data: existingUsers } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('phone_number', phoneNumber)
            .limit(1);

        let user;
        if (!existingUsers || existingUsers.length === 0) {
            const { data: newUser, error: createError } = await supabaseAdmin
                .from('users')
                .insert({ 
                    phone_number: phoneNumber,
                    // Assign tenant_id jika pengunjung dari subdomain tenant
                    ...(tenantId ? { tenant_id: tenantId } : {})
                })
                .select()
                .single();

            if (createError) throw createError;
            user = newUser;
        } else {
            user = existingUsers[0];
        }

        // 4. Terbitkan JWT token
        // Superadmin override: role di JWT menjadi 'superadmin' HANYA jika:
        //   (a) request berasal dari halaman superadmin login (isSuperadminLogin=true), DAN
        //   (b) nomor cocok dengan SUPERADMIN_PHONE di env
        // Semua flow lain (owner, customer, dll) tetap menggunakan role dari DB.
        const superadminPhone = process.env.SUPERADMIN_PHONE;
        const effectiveRole = (isSuperadminLogin && superadminPhone && phoneNumber === superadminPhone)
            ? 'superadmin'
            : user.role;

        const token = jwt.sign(
            { 
                id: user.id, 
                phoneNumber: user.phone_number,
                role: effectiveRole,
                tenant_id: user.tenant_id
            },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '24h' }
        );

        const response = NextResponse.json({
            message: 'Login berhasil!',
            token, // tetapkan dikirim untuk backward compatibility
            user: { 
                id: user.id, 
                phoneNumber: user.phone_number,
                name: user.name,
                address: user.address,
                photoUrl: user.photo_url,
                hobbies: user.hobbies,
                role: effectiveRole,
                tenant_id: user.tenant_id
            },
            requireProfileCompletion: !user.name // Jika name null/kosong, berarti user baru
        });

        // Set HttpOnly cookie
        response.cookies.set({
            name: 'token',
            value: token,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 // 24 hours
        });

        // Fire-and-forget: catat event owner_login jika user adalah owner dan punya tenant_id
        // TIDAK mempengaruhi flow login — jika gagal, login tetap sukses
        if (user.role === 'owner' && user.tenant_id) {
            trackTenantActivity({
                tenantId: user.tenant_id,
                eventType: 'owner_login',
                metadata: { login_at: new Date().toISOString() },
            }).catch(() => {}); // silent fail
        }

        return response;
    } catch (error: any) {
        console.error('Verify OTP error:', error);
        return NextResponse.json({
            message: error.message || 'Terjadi kesalahan internal.',
        }, { status: 500 });
    }
}
