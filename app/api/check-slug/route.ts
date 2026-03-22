import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const SLUG_REGEX = /^[a-z0-9-]+$/;

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug') || '';

    if (!slug || !SLUG_REGEX.test(slug) || slug.length < 3) {
        return NextResponse.json({ available: false, message: 'Format slug tidak valid.' });
    }

    const { data } = await supabaseAdmin
        .from('tenants')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();

    return NextResponse.json({
        available: !data,
        message: data ? 'Nama URL sudah digunakan.' : 'Nama URL tersedia!',
    });
}
