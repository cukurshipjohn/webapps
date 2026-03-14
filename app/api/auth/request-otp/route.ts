import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

function generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { phoneNumber } = body;

        if (!phoneNumber) {
            return NextResponse.json({ message: 'Nomor HP diperlukan.' }, { status: 400 });
        }

        // 1. Generate OTP 6 digit
        const otpCode = generateOTP();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 menit dari sekarang

        // 2. Hapus OTP lama yang kadaluarsa untuk nomor ini
        await supabaseAdmin
            .from('otp_sessions')
            .delete()
            .eq('phone_number', phoneNumber)
            .eq('used', false)
            .lt('expires_at', new Date().toISOString());

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

        // 4. Kirim OTP via WhatsApp microservice
        let serviceUrl = process.env.WHATSAPP_SERVICE_URL;
        const serviceSecret = process.env.WHATSAPP_SERVICE_SECRET;

        if (!serviceUrl || !serviceSecret) {
            throw new Error('Konfigurasi WhatsApp service belum diatur di .env.local');
        }

        // Pastikan URL memiliki protokol (http:// atau https://)
        if (!serviceUrl.startsWith('http')) {
            serviceUrl = `https://${serviceUrl}`;
        }

        const waResponse = await fetch(`${serviceUrl}/send-otp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-internal-secret': serviceSecret,
            },
            body: JSON.stringify({ phoneNumber, otpCode }),
        });

        if (!waResponse.ok) {
            const waError = await waResponse.json();
            throw new Error(waError.message || 'Gagal mengirim pesan WhatsApp');
        }

        return NextResponse.json({
            success: true,
            message: 'Kode OTP telah dikirim ke WhatsApp Anda.'
        });
    } catch (error: any) {
        console.error('Request OTP error:', error);
        return NextResponse.json({
            message: error.message || 'Terjadi kesalahan internal.',
        }, { status: 500 });
    }
}
