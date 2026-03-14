import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import jwt from 'jsonwebtoken';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { phoneNumber, otpCode } = body;

        if (!phoneNumber || !otpCode) {
            return NextResponse.json({ message: 'Nomor HP dan kode OTP diperlukan.' }, { status: 400 });
        }

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

        // 3. Cari atau buat user
        const { data: existingUsers } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('phone_number', phoneNumber)
            .limit(1);

        let user;
        if (!existingUsers || existingUsers.length === 0) {
            const { data: newUser, error: createError } = await supabaseAdmin
                .from('users')
                .insert({ phone_number: phoneNumber })
                .select()
                .single();

            if (createError) throw createError;
            user = newUser;
        } else {
            user = existingUsers[0];
        }

        // 4. Terbitkan JWT token
        const token = jwt.sign(
            { id: user.id, phoneNumber: user.phone_number },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '24h' }
        );

        return NextResponse.json({
            message: 'Login berhasil!',
            token,
            user: { 
                id: user.id, 
                phoneNumber: user.phone_number,
                name: user.name 
            },
            requireProfileCompletion: !user.name // Jika name null/kosong, berarti user baru
        });
    } catch (error: any) {
        console.error('Verify OTP error:', error);
        return NextResponse.json({
            message: error.message || 'Terjadi kesalahan internal.',
        }, { status: 500 });
    }
}
