import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';

export async function POST(request: Request) {
    try {
        // Authenticate user
        const user = getUserFromToken(request as any);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        
        const tenantId = user.tenant_id;

        // Get FormData from the incoming request
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const bucket = formData.get('bucket') as string | null;

        if (!file) {
            return NextResponse.json({ message: 'No file uploaded' }, { status: 400 });
        }

        if (!bucket || !['logos', 'heroes'].includes(bucket)) {
            return NextResponse.json({ message: 'Invalid bucket specified' }, { status: 400 });
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
            return NextResponse.json({ message: 'Only image files are allowed' }, { status: 400 });
        }

        // Convert the File object to a Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Generate a unique filename
        const ext = file.name.split('.').pop() || 'png';
        const filename = `${tenantId}-${bucket}-${Date.now()}.${ext}`;

        // Upload to Supabase Storage in the specified bucket
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from(bucket)
            .upload(filename, buffer, {
                contentType: file.type,
                upsert: true
            });

        if (uploadError) {
            console.error('Supabase upload error:', uploadError);
            throw uploadError;
        }

        // Get the public URL of the uploaded file
        const { data: publicUrlData } = supabaseAdmin.storage
            .from(bucket)
            .getPublicUrl(filename);

        return NextResponse.json({
            success: true,
            url: publicUrlData.publicUrl
        });

    } catch (error: any) {
        console.error('Error uploading file:', error);
        return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
    }
}
