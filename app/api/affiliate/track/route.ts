import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/affiliate/track
 * 
 * Dipanggil saat seseorang klik link referral affiliate.
 * TIDAK memerlukan autentikasi (publik).
 * 
 * Body: {
 *   referral_code: string
 *   landing_page?: string
 *   utm_source?: string
 *   utm_medium?: string
 *   utm_campaign?: string
 * }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { referral_code, landing_page, utm_source, utm_medium, utm_campaign } = body;

        if (!referral_code) {
            return NextResponse.json({ valid: false, message: 'referral_code wajib diisi.' }, { status: 400 });
        }

        // ─── 1. Cari affiliate aktif berdasarkan kode ───────────────────────
        const { data: affiliate, error } = await supabaseAdmin
            .from('affiliates')
            .select('id, name, status')
            .eq('referral_code', referral_code)
            .eq('status', 'active')
            .maybeSingle();

        if (error) {
            console.error('[Affiliate Track] DB error:', error);
            return NextResponse.json({ valid: false }, { status: 500 });
        }

        // Kode tidak ditemukan / tidak aktif → kembalikan valid: false (silent fail)
        if (!affiliate) {
            return NextResponse.json({ valid: false });
        }

        // ─── 2. Ambil IP & User-Agent dari request ──────────────────────────
        const ip_address =
            request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            request.headers.get('x-real-ip') ||
            null;
        const user_agent = request.headers.get('user-agent') || null;

        // ─── 3. Insert ke tabel affiliate_clicks ────────────────────────────
        const { data: clickData, error: clickError } = await supabaseAdmin
            .from('affiliate_clicks')
            .insert({
                affiliate_id: affiliate.id,
                referral_code,
                ip_address,
                user_agent,
                landing_page: landing_page || null,
                utm_source: utm_source || null,
                utm_medium: utm_medium || null,
                utm_campaign: utm_campaign || null,
                converted: false,
            })
            .select('id')
            .single();

        if (clickError) {
            console.error('[Affiliate Track] Insert click error:', clickError);
            // Jangan gagalkan request meski insert click gagal
        }

        // ─── 4. Increment total_clicks di tabel affiliates ──────────────────
        // Lakukan increment manual karena kita belum mendefinisikan RPC function di SQL
        const { data: current } = await supabaseAdmin
            .from('affiliates')
            .select('total_clicks')
            .eq('id', affiliate.id)
            .single();
            
        if (current) {
            await supabaseAdmin
                .from('affiliates')
                .update({ total_clicks: (current.total_clicks || 0) + 1 })
                .eq('id', affiliate.id);
        }

        // ─── 5. Return result ────────────────────────────────────────────────
        return NextResponse.json({
            valid: true,
            click_id: clickData?.id || null,
            affiliate_name: affiliate.name,
        });

    } catch (error: any) {
        console.error('[Affiliate Track] Unexpected error:', error);
        return NextResponse.json({ valid: false }, { status: 500 });
    }
}
