import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';

export async function POST(request: Request) {
    try {
        const user = getUserFromToken(request as any);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);

        const tenantId = user.tenant_id;
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) return NextResponse.json({ message: 'No file uploaded' }, { status: 400 });
        if (!file.type.startsWith('image/')) return NextResponse.json({ message: 'Only image files are allowed' }, { status: 400 });

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const ext = file.name.split('.').pop() || 'jpg';
        const filename = `${tenantId}-post-${Date.now()}.${ext}`;

        const { error: uploadError } = await supabaseAdmin.storage
            .from('posts')
            .upload(filename, buffer, { contentType: file.type, upsert: true });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabaseAdmin.storage
            .from('posts')
            .getPublicUrl(filename);

        return NextResponse.json({ success: true, url: publicUrlData.publicUrl });

    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
