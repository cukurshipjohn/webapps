import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken } from '@/lib/auth';

const INTERNAL_SECRET = process.env.WHATSAPP_SERVICE_SECRET || 'change_this_secret';
const WHATSAPP_SERVICE_URL = process.env.WHATSAPP_SERVICE_URL || 'http://127.0.0.1:3001';

async function getTenantIdFromUser(userId: string, jwtTenantId: string | null): Promise<string | null> {
    if (jwtTenantId) return jwtTenantId;

    const { data } = await supabaseAdmin
        .from('users')
        .select('tenant_id')
        .eq('id', userId)
        .single();

    return data?.tenant_id || null;
}

export async function GET(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user || !['owner', 'superadmin'].includes(user.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const tenant_id = await getTenantIdFromUser(user.userId, user.tenant_id);
        if (!tenant_id) return NextResponse.json({ status: 'disconnected', phone: null });

        // Ambil session_id
        const { data: settings } = await supabaseAdmin
            .from('tenant_settings')
            .select('wa_session_id')
            .eq('tenant_id', tenant_id)
            .single();

        const sessionId = settings?.wa_session_id;
        if (!sessionId) {
            return NextResponse.json({ status: 'disconnected', phone: null });
        }

        // Minta status dari microservice
        const res = await fetch(`${WHATSAPP_SERVICE_URL}/session/status/${sessionId}`, {
            method: 'GET',
            headers: { 'x-internal-secret': INTERNAL_SECRET }
        });

        if (!res.ok) throw new Error('Failed to fetch status from microservice');

        const data = await res.json();

        // Sync ke database
        await supabaseAdmin
            .from('tenant_settings')
            .update({
                wa_session_status: data.status,
                wa_phone_connected: data.phone || null
            })
            .eq('tenant_id', tenant_id);

        return NextResponse.json(data);

    } catch (error: any) {
        console.error('Error in /whatsapp/status:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
