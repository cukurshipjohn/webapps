import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const VALID_CASE_TYPES = [
    'renewal_reminder',
    'usage_coaching',
    'churn_prevention',
    'reactivation_offer',
    'upgrade_offer',
    'general',
] as const;

const VALID_CHANNELS = ['whatsapp', 'phone_call', 'internal_note'] as const;

const VALID_OUTCOMES = [
    'pending',
    'no_response',
    'interested',
    'renewed',
    'upgraded',
    'churned_confirmed',
    'not_applicable',
] as const;

// ── Auth helper ──────────────────────────────────────────────────────────────
function authSuperAdmin(request: NextRequest) {
    const user = getUserFromToken(request);
    if (!user) return { error: NextResponse.json({ message: 'Unauthorized.' }, { status: 401 }) };
    if (user.role !== 'superadmin') return { error: NextResponse.json({ message: 'Forbidden: Superadmin only.' }, { status: 403 }) };
    return { user };
}

// ── GET /api/superadmin/followups ──────────────────────────────────────────
export async function GET(request: NextRequest) {
    const { user, error: authErr } = authSuperAdmin(request);
    if (authErr) return authErr;

    try {
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenant_id');
        const caseType = searchParams.get('case_type');
        const outcome  = searchParams.get('outcome');
        
        const page  = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const limit = Math.max(1, parseInt(searchParams.get('limit') || '20', 10));
        const start = (page - 1) * limit;
        const end   = start + limit - 1;

        let query = supabaseAdmin
            .from('superadmin_followups')
            .select(`
                id,
                tenant_id,
                admin_id,
                case_type,
                channel,
                message_sent,
                outcome,
                scheduled_at,
                done_at,
                created_at,
                tenants ( 
                    shop_name, 
                    slug,
                    users ( phone_number ) 
                )
            `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(start, end);

        if (tenantId) query = query.eq('tenant_id', tenantId);
        if (caseType && VALID_CASE_TYPES.includes(caseType as any)) query = query.eq('case_type', caseType);
        if (outcome && VALID_OUTCOMES.includes(outcome as any)) query = query.eq('outcome', outcome);

        const { data, error, count } = await query;
        if (error) throw error;

        // Extract phone number from nested 'users' object to make it easier for frontend
        const formattedData = (data || []).map(item => ({
            ...item,
            owner_phone: (item.tenants as any)?.users?.phone_number || null,
        }));

        return NextResponse.json({ 
            data: formattedData, 
            total: count ?? 0, 
            page, 
            limit 
        });

    } catch (err: any) {
        console.error('[Followups GET] Error:', err);
        return NextResponse.json({ message: err.message || 'Internal Server Error' }, { status: 500 });
    }
}

// ── POST /api/superadmin/followups ─────────────────────────────────────────
export async function POST(request: NextRequest) {
    const { user, error: authErr } = authSuperAdmin(request);
    if (authErr) return authErr;

    try {
        const body = await request.json();
        const { tenant_id, case_type, channel, message_sent, outcome, scheduled_at } = body;

        // ── Validasi wajib ────────────────────────────────────────────────────
        if (!tenant_id) return NextResponse.json({ message: 'tenant_id wajib diisi.' }, { status: 400 });
        if (!case_type || !VALID_CASE_TYPES.includes(case_type)) {
            return NextResponse.json({ message: `case_type tidak valid.` }, { status: 400 });
        }
        if (channel && !VALID_CHANNELS.includes(channel)) {
            return NextResponse.json({ message: `channel tidak valid.` }, { status: 400 });
        }
        if (outcome && !VALID_OUTCOMES.includes(outcome)) {
            return NextResponse.json({ message: `outcome tidak valid.` }, { status: 400 });
        }

        // Auto done_at jika outcome bukan pending
        const done_at = outcome && outcome !== 'pending' ? new Date().toISOString() : null;

        // ── INSERT follow-up ──────────────────────────────────────────────────
        const { data: followup, error: insertErr } = await supabaseAdmin
            .from('superadmin_followups')
            .insert({
                tenant_id,
                case_type,
                channel: channel || 'whatsapp', // default whatsapp
                message_sent: message_sent || null,
                outcome: outcome || 'pending',
                scheduled_at: scheduled_at || null,
                done_at,
                admin_id: user!.userId,
            })
            .select('*')
            .single();

        if (insertErr) throw insertErr;

        let wa_sent = false;

        // ── Logika Pengiriman WA (Jika channel=whatsapp & message_sent ada) ──
        if ((channel === 'whatsapp' || !channel) && message_sent) {
            try {
                // Cari phone_number owner
                const { data: tenantData } = await supabaseAdmin
                    .from('tenants')
                    .select('owner_user_id')
                    .eq('id', tenant_id)
                    .single();

                if (tenantData?.owner_user_id) {
                    const { data: ownerData } = await supabaseAdmin
                        .from('users')
                        .select('phone_number')
                        .eq('id', tenantData.owner_user_id)
                        .single();

                    const ownerPhone = ownerData?.phone_number;
                    const waUrl = process.env.WHATSAPP_SERVICE_URL;
                    const waSecret = process.env.WHATSAPP_SERVICE_SECRET;

                    if (ownerPhone && waUrl && waSecret) {
                        const baseUrl = waUrl.startsWith('http') ? waUrl : `https://${waUrl}`;
                        const waResponse = await fetch(`${baseUrl}/send-message`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-internal-secret': waSecret,      // fallback
                                'Authorization': `Bearer ${waSecret}` // fallback format
                            },
                            body: JSON.stringify({ phoneNumber: ownerPhone, message: message_sent })
                        });
                        
                        if (waResponse.ok) {
                            wa_sent = true;
                        } else {
                            console.error('[Followups POST] WA Service merespons dengan status:', waResponse.status);
                        }
                    } else {
                        console.warn('[Followups POST] Nomor owner atau env variabel WA tidak lengkap.');
                    }
                }
            } catch (waError) {
                console.error('[Followups POST] Eksepsi saat mengirim WA:', waError);
                // Tidak throw agar operasi insert tetap sukses dikembalikan
            }
        }

        return NextResponse.json({ data: followup, wa_sent }, { status: 201 });

    } catch (err: any) {
        console.error('[Followups POST] Error:', err);
        return NextResponse.json({ message: err.message || 'Internal Server Error' }, { status: 500 });
    }
}
