import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import jwt from 'jsonwebtoken';

export async function POST(request: NextRequest) {
    try {
        // Authenticate user
        const tokenFromCookie = request.cookies.get('token')?.value;
        const authHeader = request.headers.get('authorization');
        const token = tokenFromCookie || (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);

        if (!token) {
            return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
        }

        let decoded: any;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        } catch {
            return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
        }

        const userId = decoded.id;

        // Get FormData from the incoming request
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ message: 'No file uploaded' }, { status: 400 });
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
            return NextResponse.json({ message: 'Only image files are allowed' }, { status: 400 });
        }

        // Convert the File object to a Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Generate a unique filename using timestamp and original extension
        const ext = file.name.split('.').pop();
        const filename = `${userId}-${Date.now()}.${ext}`;

        // Upload to Supabase Storage in the 'profiles' bucket
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from('profiles')
            .upload(filename, buffer, {
                contentType: file.type,
                upsert: true // Overwrite if it exists
            });

        if (uploadError) {
            console.error('Supabase upload error:', uploadError);
            throw uploadError;
        }

        // Get the public URL of the uploaded file
        const { data: publicUrlData } = supabaseAdmin.storage
            .from('profiles')
            .getPublicUrl(filename);

        return NextResponse.json({
            success: true,
            photoUrl: publicUrlData.publicUrl
        });

    } catch (error: any) {
        console.error('Error uploading photo:', error);
        return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
    }
}
