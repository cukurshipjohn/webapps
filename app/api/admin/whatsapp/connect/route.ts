import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken } from '@/lib/auth';

const INTERNAL_SECRET = process.env.WHATSAPP_SERVICE_SECRET || 'change_this_secret';
const WHATSAPP_SERVICE_URL = process.env.WHATSAPP_SERVICE_URL || 'http://127.0.0.1:3001';

// Helper: ambil tenant_id dari JWT atau fallback ke database
async function getTenantId(userId: string, jwtTenantId: string | null): Promise<string | null> {
    if (jwtTenantId) return jwtTenantId;

    // JWT lama mungkin tidak punya tenant_id → lookup dari DB
    const { data } = await supabaseAdmin
        .from('users')
        .select('tenant_id')
        .eq('id', userId)
        .single();

    return data?.tenant_id || null;
}

export async function POST(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user || !['owner', 'superadmin'].includes(user.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fallback ke DB jika JWT tidak punya tenant_id
        const tenant_id = await getTenantId(user.userId, user.tenant_id);
        if (!tenant_id) {
            return NextResponse.json({ error: 'Tenant tidak ditemukan' }, { status: 403 });
        }

        const sessionId = `tenant_${tenant_id.replace(/-/g, '').slice(0, 10)}`;

        // 1. Panggil microservice untuk start session
        const res = await fetch(`${WHATSAPP_SERVICE_URL}/session/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-internal-secret': INTERNAL_SECRET
            },
            body: JSON.stringify({ session_id: sessionId })
        });

        if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Microservice error: ${errBody}`);
        }

        // 2. Update status di database
        const { error: dbError } = await supabaseAdmin
            .from('tenant_settings')
            .upsert({
                tenant_id,
                wa_session_id: sessionId,
                wa_session_status: 'qr_pending'
            }, { onConflict: 'tenant_id' });

        if (dbError) throw dbError;

        return NextResponse.json({ success: true, session_id: sessionId });

    } catch (error: any) {
        console.error('Error in /whatsapp/connect:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
