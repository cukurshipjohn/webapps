import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import jwt from 'jsonwebtoken';

export async function POST(request: NextRequest) {
    try {
        const tokenFromCookie = request.cookies.get('token')?.value;
        const authHeader = request.headers.get('authorization');
        const token = tokenFromCookie || (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);

        if (!token) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret') as { id: string, phoneNumber: string };

        const body = await request.json();
        const { name, address, photoUrl, hobbies } = body;

        if (!name) {
            return NextResponse.json({ message: 'Nama harus diisi.' }, { status: 400 });
        }

        // Update name, address, photo_url, and hobbies di tabel users
        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({ 
                name: name, 
                address: address || null,
                photo_url: photoUrl || null,
                hobbies: hobbies || null
            })
            .eq('id', decoded.id);

        if (updateError) throw updateError;

        return NextResponse.json({
            success: true,
            message: 'Profil berhasil diperbarui.',
            user: { 
                id: decoded.id, 
                phoneNumber: decoded.phoneNumber, 
                name, 
                address,
                photoUrl,
                hobbies
            }
        });
    } catch (error: any) {
        console.error('Update profile error:', error);
        return NextResponse.json({
            message: error.name === 'JsonWebTokenError' ? 'Token tidak valid' : (error.message || 'Terjadi kesalahan internal.'),
        }, { status: 500 });
    }
}
