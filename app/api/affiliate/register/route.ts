import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { generateReferralCode } from '@/lib/affiliate';
import crypto from 'crypto';

/**
 * POST /api/affiliate/register
 * Publik — tidak perlu auth.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            name,
            phone,
            email,
            tier,
            bank_name,
            bank_account_number,
            bank_account_name,
        } = body;

        // ─── 1. Validasi input wajib ────────────────────────────────────────
        if (!name || !phone || !tier) {
            return NextResponse.json({ message: 'Nama, nomor WA, dan tier wajib diisi.' }, { status: 400 });
        }
        if (!['referral', 'reseller'].includes(tier)) {
            return NextResponse.json({ message: 'Tier tidak valid.' }, { status: 400 });
        }

        // ─── 2. Cek duplikat nomor WA ────────────────────────────────────────
        const { data: existing } = await supabaseAdmin
            .from('affiliates')
            .select('id')
            .eq('phone', phone)
            .maybeSingle();

        if (existing) {
            return NextResponse.json({ message: 'Nomor WA sudah terdaftar sebagai affiliator.' }, { status: 409 });
        }

        // ─── 3. Generate referral code yang unik ─────────────────────────────
        let referralCode = generateReferralCode(name);
        let isUnique = false;
        let attempts = 0;

        while (!isUnique && attempts < 5) {
            const { data: codeCheck } = await supabaseAdmin
                .from('affiliates')
                .select('id')
                .eq('referral_code', referralCode)
                .maybeSingle();

            if (!codeCheck) {
                isUnique = true;
            } else {
                referralCode = generateReferralCode(name);
                attempts++;
            }
        }

        if (!isUnique) {
            return NextResponse.json({ message: 'Gagal menghasilkan kode unik. Coba lagi.' }, { status: 500 });
        }

        // ─── 4. Tentukan status & commission_rate berdasarkan tier ───────────
        const status       = 'unverified';
        const commissionRate   = tier === 'referral' ? 10.00 : 20.00;
        const commissionType   = tier === 'referral' ? 'one_time' : 'recurring';
        const verificationToken = crypto.randomUUID();

        // ─── 5. Insert ke tabel affiliates ──────────────────────────────────
        const { data: affiliate, error: insertError } = await supabaseAdmin
            .from('affiliates')
            .insert({
                name,
                phone,
                email: email || null,
                referral_code: referralCode,
                tier,
                commission_rate: commissionRate,
                commission_type: commissionType,
                status,
                verification_token: verificationToken,
                bank_name: bank_name || null,
                bank_account_number: bank_account_number || null,
                bank_account_name: bank_account_name || null,
            })
            .select('id, referral_code, status')
            .single();

        if (insertError) throw insertError;

        // ─── 6. Kirim WA ke Affiliator ───────────────────────────────────────
        let waServiceUrl = process.env.WHATSAPP_SERVICE_URL;
        const waSecret   = process.env.WHATSAPP_SERVICE_SECRET;
        const rootDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || 'cukurship.id';

        if (waServiceUrl && waSecret) {
            if (!waServiceUrl.startsWith('http')) waServiceUrl = `https://${waServiceUrl}`;

            const originUrl = new URL(request.url).origin;
            const verifyLink = `${originUrl}/api/affiliate/verify?token=${verificationToken}`;
            const affiliateMsg = 
                `Halo ${name}! Terima kasih telah mendaftar sebagai Affiliator CukurShip.\n\n` +
                `Satu langkah lagi, silakan verifikasi nomor WhatsApp kamu dengan mengklik tautan berikut ini:\n` +
                `${verifyLink}\n\n` +
                `Setelah terverifikasi, akun kamu akan *langsung otomatis diaktifkan*!`;

            fetch(`${waServiceUrl}/send-message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': waSecret,
                },
                body: JSON.stringify({ phoneNumber: phone, message: affiliateMsg }),
            }).catch(err => console.error('[Affiliate Register] WA to affiliator error:', err));
        }

        // ─── 8. Return ───────────────────────────────────────────────────────
        return NextResponse.json({
            success: true,
            referral_code: null,
            status,
            message: 'Berhasil mendaftar. Silakan cek WhatsApp untuk klik tautan verifikasi sebelum login.',
        }, { status: 201 });

    } catch (error: any) {
        console.error('[Affiliate Register] Error:', error);
        return NextResponse.json({ message: error.message || 'Terjadi kesalahan.' }, { status: 500 });
    }
}
