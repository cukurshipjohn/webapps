import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken } from '@/lib/auth';

const INTERNAL_SECRET = process.env.WHATSAPP_SERVICE_SECRET || 'change_this_secret';
const WHATSAPP_SERVICE_URL = process.env.WHATSAPP_SERVICE_URL || 'http://127.0.0.1:3001';

async function getTenantWaSessionId(userId: string, jwtTenantId: string | null): Promise<string | null> {
    if (jwtTenantId) {
        const { data } = await supabaseAdmin
            .from('tenant_settings')
            .select('wa_session_id')
            .eq('tenant_id', jwtTenantId)
            .single();
        return data?.wa_session_id || null;
    }

    // JWT lama → lookup user → lookup tenant_settings
    const { data: userData } = await supabaseAdmin
        .from('users')
        .select('tenant_id')
        .eq('id', userId)
        .single();

    const tenantId = userData?.tenant_id;
    if (!tenantId) return null;

    const { data: settings } = await supabaseAdmin
        .from('tenant_settings')
        .select('wa_session_id')
        .eq('tenant_id', tenantId)
        .single();

    return settings?.wa_session_id || null;
}

export async function GET(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user || !['owner', 'superadmin'].includes(user.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const sessionId = await getTenantWaSessionId(user.userId, user.tenant_id);

        if (!sessionId) {
            return NextResponse.json({ error: 'Session not initialized' }, { status: 404 });
        }

        const res = await fetch(`${WHATSAPP_SERVICE_URL}/session/qr/${sessionId}`, {
            method: 'GET',
            headers: { 'x-internal-secret': INTERNAL_SECRET }
        });

        if (!res.ok) throw new Error('Failed to fetch from microservice');

        const data = await res.json();
        return NextResponse.json(data);

    } catch (error: any) {
        console.error('Error in /whatsapp/qr:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
