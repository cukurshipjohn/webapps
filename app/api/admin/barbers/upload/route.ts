import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';

export async function POST(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        
        if (!user.tenant_id) {
            return NextResponse.json({ message: 'Akses ditolak.' }, { status: 403 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ message: 'Tidak ada file yang diunggah' }, { status: 400 });
        }

        if (!file.type.startsWith('image/')) {
            return NextResponse.json({ message: 'Hanya file gambar yang diizinkan' }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const ext = file.name.split('.').pop();
        const filename = `${user.tenant_id}-${Date.now()}.${ext}`;

        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from('barbers')
            .upload(filename, buffer, {
                contentType: file.type,
                upsert: true
            });

        if (uploadError) {
            console.error('Supabase upload error:', uploadError);
            throw uploadError;
        }

        const { data: publicUrlData } = supabaseAdmin.storage
            .from('barbers')
            .getPublicUrl(filename);

        return NextResponse.json({
            success: true,
            photoUrl: publicUrlData.publicUrl
        });

    } catch (error: any) {
        console.error('Error uploading barber photo:', error);
        return NextResponse.json({ message: 'Gagal mengunggah foto' }, { status: 500 });
    }
}
