import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET handler (dipanggil Vercel Cron tiap hari 17:00 UTC = 00:00 WIB)
 */
export async function GET(request: NextRequest) {
    try {
        // 1. Cek header: Authorization: Bearer [CRON_SECRET]
        const authHeader = request.headers.get('Authorization');
        const expectedSecret = `Bearer ${process.env.CRON_SECRET}`;

        if (!process.env.CRON_SECRET || authHeader !== expectedSecret) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        // 2. UPDATE affiliate_commissions SET status='available'
        // WHERE status='pending' AND available_at <= NOW()
        const now = new Date().toISOString();

        const { data, error, count } = await supabaseAdmin
            .from('affiliate_commissions')
            .update({ status: 'available' })
            .eq('status', 'pending')
            .lte('available_at', now)
            .select('id');

        if (error) {
            console.error('[Cron Affiliate] Error updating commissions:', error);
            return NextResponse.json({ message: 'Failed to update commissions' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            updated_count: data?.length || 0,
            message: `Successfully released ${data?.length || 0} commissions.`
        });

    } catch (error: any) {
        console.error('[Cron Affiliate] Unexpected error:', error);
        return NextResponse.json({ message: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
