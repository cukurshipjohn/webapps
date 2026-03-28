import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import jwt from 'jsonwebtoken';

// GET: Ambil data profil user terbaru dari database
export async function GET(request: NextRequest) {
    try {
        const tokenFromCookie = request.cookies.get('token')?.value;
        const authHeader = request.headers.get('authorization');
        const token = tokenFromCookie || (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);

        if (!token) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret') as { id: string, phoneNumber: string };

        // Ambil data user terbaru langsung dari database
        const { data: user, error } = await supabaseAdmin
            .from('users')
            .select('id, phone_number, name, address, photo_url, hobbies, created_at')
            .eq('id', decoded.id)
            .single();

        if (error || !user) {
            return NextResponse.json({ message: 'User tidak ditemukan.' }, { status: 404 });
        }

        return NextResponse.json({
            id: user.id,
            phoneNumber: user.phone_number,
            name: user.name,
            address: user.address,
            photoUrl: user.photo_url, // ubah dari snake_case ke camelCase
            hobbies: user.hobbies,
            createdAt: user.created_at
        });
    } catch (error: any) {
        return NextResponse.json({
            message: error.name === 'JsonWebTokenError' ? 'Token tidak valid' : (error.message || 'Terjadi kesalahan.'),
        }, { status: 500 });
    }
}

// PUT: Update data profil user (dipanggil dari dashboard edit profile)
export async function PUT(request: NextRequest) {
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
