import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/affiliate/verify?token=...
 * Endpoint untuk memverifikasi nomor WhatsApp pendaftar affiliate.
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const token = searchParams.get('token');

        if (!token) {
            return NextResponse.json({ message: 'Token verifikasi tidak ditemukan.' }, { status: 400 });
        }

        // 1. Cari affiliator dengan token ini
        const { data: affiliate, error: fetchError } = await supabaseAdmin
            .from('affiliates')
            .select('id, name, phone, email, tier, status, verification_token, referral_code')
            .eq('verification_token', token)
            .single();

        if (fetchError || !affiliate) {
            // Bisa di redirect ke halaman error jika mau, tapi json dlu
            return new NextResponse(`
                <html><body>
                    <div style="font-family:sans-serif; text-align:center; padding: 50px;">
                        <h2>Verifikasi Gagal ❌</h2>
                        <p>Token tidak ditemukan atau sudah kadaluwarsa.</p>
                        <a href="/affiliate/login">Kembali ke Login</a>
                    </div>
                </body></html>
            `, { status: 400, headers: { 'Content-Type': 'text/html' } });
        }

        // 2. Berdasarkan instruksi klien, semua tier (Referral & Reseller) langsung aktif
        const newStatus = 'active';

        // 3. Update database
        const { error: updateError } = await supabaseAdmin
            .from('affiliates')
            .update({ 
                status: newStatus, 
                verification_token: null, // hanguskan token
                verified_at: new Date().toISOString()
            })
            .eq('id', affiliate.id);

        if (updateError) throw updateError;

        // 4. Kirim notifikasi WA follow-up
        let waServiceUrl = process.env.WHATSAPP_SERVICE_URL;
        const waSecret   = process.env.WHATSAPP_SERVICE_SECRET;
        const rootDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || 'cukurship.id';

        if (waServiceUrl && waSecret) {
            if (!waServiceUrl.startsWith('http')) waServiceUrl = `https://${waServiceUrl}`;

            // A. Pesan langsung untuk pendaftar
            let affiliateMsg: string;
            if (affiliate.tier === 'referral') {
                affiliateMsg =
                    `🎉 *Verifikasi Berhasil! Selamat bergabung sebagai Affiliator CukurShip!*\n\n` +
                    `Kode Referral kamu: *${affiliate.referral_code}*\n` +
                    `Link pendaftaran: https://${rootDomain}/register?ref=${affiliate.referral_code}\n\n` +
                    `Bagikan link ini ke teman-temanmu yang punya barbershop!\n` +
                    `Komisi: *10%* dari pembayaran pertama setiap toko yang daftar via kode kamu. 💰`;
            } else {
                affiliateMsg =
                    `🎉 *Verifikasi Berhasil! Selamat bergabung sebagai Mitra Reseller CukurShip!*\n\n` +
                    `Nama: ${affiliate.name}\n` +
                    `Kode Reseller kamu: *${affiliate.referral_code}*\n` +
                    `Link pendaftaran klien: https://${rootDomain}/register?ref=${affiliate.referral_code}\n\n` +
                    `Akun kamu telah *LANGSUNG AKTIF*. Bagikan link ini ke klien Barbershop kamu!\n` +
                    `Nikmati komisi berulang (recurring) *20%* di setiap pembayaran tagihan dari klienmu. 🚀`;
            }

            fetch(`${waServiceUrl}/send-message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': waSecret },
                body: JSON.stringify({ phoneNumber: affiliate.phone, message: affiliateMsg }),
            }).catch(err => console.error('[Affiliate Verify] WA to affiliator error:', err));

            // B. Jika Reseller, kirim notif Alert ke Superadmin agar Tahu
            if (affiliate.tier === 'reseller' && process.env.SUPERADMIN_PHONE) {
                const adminMsg =
                    `⚠️ *Info: Reseller Baru Telah Bergabung & Aktif Otomatis*\n\n` +
                    `Nama   : ${affiliate.name}\n` +
                    `WA     : ${affiliate.phone}\n` +
                    `Email  : ${affiliate.email || '-'}\n\n` +
                    `Pendaftar telah sukses memverifikasi WhatsApp dan akun Resellernya sudah beroperasi.\n` +
                    `Silakan konfirmasi di panel Superadmin jika ingin memantau.`;

                fetch(`${waServiceUrl}/send-message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': waSecret },
                    body: JSON.stringify({ phoneNumber: process.env.SUPERADMIN_PHONE, message: adminMsg }),
                }).catch(err => console.error('[Affiliate Verify] WA to superadmin error:', err));
            }
        }

        // 5. Redirect user to Dashboard/Login with verified query
        const redirectUrl = new URL('/affiliate/login?verified=true', request.url);
        return NextResponse.redirect(redirectUrl, 302);

    } catch (error: any) {
        console.error('[Affiliate Verify] Error:', error);
        return new NextResponse(`
            <html><body>
                <div style="font-family:sans-serif; text-align:center; padding: 50px;">
                    <h2>Terjadi Kesalahan ❌</h2>
                    <p>Sistem kami sedang mengalami kendala. Silakan coba lagi.</p>
                </div>
            </body></html>
        `, { status: 500, headers: { 'Content-Type': 'text/html' } });
    }
}
