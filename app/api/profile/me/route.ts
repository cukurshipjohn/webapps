import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import jwt from 'jsonwebtoken';

// GET: Ambil data profil user terbaru dari database
export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
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
