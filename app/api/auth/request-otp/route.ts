import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

function generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { phoneNumber, isAdminLogin, isAffiliateLogin } = body;

        if (!phoneNumber) {
            return NextResponse.json({ message: 'Nomor HP diperlukan.' }, { status: 400 });
        }
        
        // --- MIDTRANS REVIEW BYPASS (MAGIC OTP) ---
        // TODO: Ubah NEXT_PUBLIC_REVIEW_BYPASS_ENABLED menjadi 'false' di Vercel Auth setelah disetujui
        const isBypassEnabled = process.env.NEXT_PUBLIC_REVIEW_BYPASS_ENABLED === 'true';
        if (isBypassEnabled && phoneNumber === '08111111111') {
            return NextResponse.json({
                success: true,
                wa_sent: true,
                message: 'Kode OTP telah dikirim (Bypass Mode Aktif)',
            });
        }
        // --- END MIDTRANS REVIEW BYPASS ---
        
        // Strict Admin Portal Check: Prevent sending OTP if not an admin
        if (isAdminLogin) {
            // Bypass khusus superadmin: jika nomor ada di env SUPERADMIN_PHONE,
            // langsung izinkan tanpa cek DB role. Ini tidak mempengaruhi cek owner biasa.
            const superadminPhone = process.env.SUPERADMIN_PHONE;
            if (superadminPhone && phoneNumber === superadminPhone) {
                // Superadmin dikenali dari env, bukan dari DB — lanjut ke generate OTP
            } else {
                const { data: userData, error: userError } = await supabaseAdmin
                    .from('users')
                    .select('role')
                    .eq('phone_number', phoneNumber)
                    .single();

                if (userError || !userData || !['owner', 'superadmin'].includes(userData.role)) {
                    return NextResponse.json({ message: 'Akses Ditolak: Nomor ini tidak terdaftar sebagai Admin/Tenant.' }, { status: 403 });
                }
            }
        }

        // Affiliate Portal Check
        if (isAffiliateLogin) {
            const { data: affData } = await supabaseAdmin
                .from('affiliates')
                .select('id, status')
                .eq('phone', phoneNumber)
                .maybeSingle();

            if (!affData) {
                return NextResponse.json({ message: 'Nomor tidak terdaftar sebagai affiliator.' }, { status: 403 });
            }
            if (affData.status === 'pending') {
                return NextResponse.json({ message: 'Akun Anda sedang menunggu persetujuan admin.' }, { status: 403 });
            }
            if (affData.status === 'suspended') {
                return NextResponse.json({ message: 'Akun Anda telah dinonaktifkan. Hubungi admin.' }, { status: 403 });
            }
        }

        // 1. Generate OTP 6 digit
        const otpCode = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 menit

        // 2. Hapus SEMUA OTP sebelumnya untuk nomor ini (used=true maupun false)
        // FIX: Filter .eq('used', false) dihapus karena UNIQUE constraint pada phone_number
        // menyebabkan INSERT gagal jika row used=true masih ada di tabel.
        await supabaseAdmin
            .from('otp_sessions')
            .delete()
            .eq('phone_number', phoneNumber);

        // 3. Simpan OTP baru ke Supabase
        const { error: insertError } = await supabaseAdmin
            .from('otp_sessions')
            .insert({
                phone_number: phoneNumber,
                otp_code: otpCode,
                expires_at: expiresAt.toISOString(),
                used: false
            });

        if (insertError) throw insertError;

        // ── FALLBACK: Selalu cetak OTP ke log server ──────────────────────
        // ALASAN: Jika WA service mati/belum konek (terutama saat pertama deploy
        // atau session WA rusak), superadmin TETAP bisa login dengan melihat log:
        //   • Development : terlihat langsung di terminal `npm run dev`
        //   • Production  : cek via `pm2 logs`, `docker logs`, atau Vercel Logs
        // OTP tetap time-limited (10 menit) → tidak menurunkan keamanan secara signifikan
        // karena tetap butuh akses ke server/VPS untuk melihatnya.
        console.log(`\n┌─────────────────────────────────────────┐`);
        console.log(`│  🔐 OTP LOGIN — FALLBACK LOG             │`);
        console.log(`│  Nomor  : ${phoneNumber.padEnd(30)}│`);
        console.log(`│  Kode   : ${otpCode.padEnd(30)}│`);
        console.log(`│  Berlaku: 10 menit dari sekarang         │`);
        console.log(`└─────────────────────────────────────────┘\n`);
        // ─────────────────────────────────────────────────────────────────

        // 4. Kirim OTP via WhatsApp microservice
        //    Dibungkus try/catch TERPISAH agar kegagalan WA TIDAK membatalkan
        //    keseluruhan request. OTP sudah tersimpan di DB → user tetap bisa
        //    memasukkan kode yang tercetak di log jika WA gagal.
        let serviceUrl = process.env.WHATSAPP_SERVICE_URL;
        const serviceSecret = process.env.WHATSAPP_SERVICE_SECRET;

        let waSent = false;
        let waError = '';

        if (serviceUrl && serviceSecret) {
            if (!serviceUrl.startsWith('http')) {
                serviceUrl = `https://${serviceUrl}`;
            }

            try {
                // Timeout 6 detik: WA yang lambat/mati tidak blokir seluruh request
                const waResponse = await fetch(`${serviceUrl}/send-otp`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': serviceSecret,
                    },
                    body: JSON.stringify({ phoneNumber, otpCode }),
                    signal: AbortSignal.timeout(6000),
                });

                if (waResponse.ok) {
                    waSent = true;
                } else {
                    const errBody = await waResponse.json().catch(() => ({}));
                    waError = errBody.message || `WA service error HTTP ${waResponse.status}`;
                    console.warn(`⚠️  OTP WA gagal (${phoneNumber}): ${waError}`);
                }
            } catch (fetchErr: any) {
                waError = fetchErr.message || 'WA service tidak dapat dijangkau';
                console.warn(`⚠️  WA service timeout/unreachable: ${waError}`);
            }
        } else {
            waError = 'WHATSAPP_SERVICE_URL / SECRET belum dikonfigurasi di .env';
            console.warn(`⚠️  ${waError}`);
        }

        // 5. Response — selalu berhasil (OTP tersimpan di DB).
        //    Jika WA gagal, beri pesan yang mengarahkan superadmin ke log server.
        return NextResponse.json({
            success: true,
            wa_sent: waSent,
            message: waSent
                ? 'Kode OTP telah dikirim ke WhatsApp Anda.'
                : `OTP berhasil dibuat. WhatsApp gagal terkirim — cek log server untuk mendapatkan kode OTP. (${waError})`,
        });

    } catch (error: any) {
        console.error('Request OTP error:', error);
        return NextResponse.json({
            message: error.message || 'Terjadi kesalahan internal.',
        }, { status: 500 });
    }
}
