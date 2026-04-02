import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const VALID_REASONS = [
    'too_expensive',
    'not_using_features',
    'switched_competitor',
    'temporary_close',
    'technical_issues',
    'no_customers',
    'other',
] as const;

const VALID_WIN_BACK = ['high', 'medium', 'low', 'unknown'] as const;

// ── Auth helper ──────────────────────────────────────────────────────────────
function authSuperAdmin(request: NextRequest) {
    const user = getUserFromToken(request);
    if (!user) return { error: NextResponse.json({ message: 'Unauthorized.' }, { status: 401 }) };
    if (user.role !== 'superadmin') return { error: NextResponse.json({ message: 'Forbidden: Superadmin only.' }, { status: 403 }) };
    return { user };
}

// ── GET /api/superadmin/churn-surveys ────────────────────────────────────────
// Ambil semua churn survey dengan filter opsional.
export async function GET(request: NextRequest) {
    const { user, error: authErr } = authSuperAdmin(request);
    if (authErr) return authErr;

    try {
        const { searchParams } = new URL(request.url);
        const tenantId         = searchParams.get('tenant_id');
        const reason           = searchParams.get('reason');
        const winBackPotential = searchParams.get('win_back_potential');

        let query = supabaseAdmin
            .from('churn_surveys')
            .select(`
                id,
                tenant_id,
                recorded_by_admin_id,
                reason,
                detail_note,
                win_back_potential,
                recorded_at,
                follow_up_scheduled_at,
                tenants ( shop_name, slug )
            `, { count: 'exact' })
            .order('recorded_at', { ascending: false });

        if (tenantId) query = query.eq('tenant_id', tenantId);
        if (reason && VALID_REASONS.includes(reason as any)) query = query.eq('reason', reason);
        if (winBackPotential && VALID_WIN_BACK.includes(winBackPotential as any)) {
            query = query.eq('win_back_potential', winBackPotential);
        }

        const { data, error, count } = await query;
        if (error) throw error;

        return NextResponse.json({ data: data ?? [], total: count ?? 0 });

    } catch (err: any) {
        console.error('[ChurnSurveys GET] Error:', err);
        return NextResponse.json({ message: err.message || 'Internal Server Error' }, { status: 500 });
    }
}

// ── POST /api/superadmin/churn-surveys ───────────────────────────────────────
// Buat churn survey baru. Setelah INSERT, tandai tenant sebagai is_active=false.
export async function POST(request: NextRequest) {
    const { user, error: authErr } = authSuperAdmin(request);
    if (authErr) return authErr;

    try {
        const body = await request.json();
        const { tenant_id, reason, detail_note, win_back_potential, follow_up_scheduled_at } = body;

        // ── Validasi wajib ────────────────────────────────────────────────────
        if (!tenant_id) {
            return NextResponse.json({ message: 'tenant_id wajib diisi.' }, { status: 400 });
        }
        if (!reason) {
            return NextResponse.json({ message: 'reason wajib diisi.' }, { status: 400 });
        }
        if (!VALID_REASONS.includes(reason)) {
            return NextResponse.json({
                message: `reason tidak valid. Nilai yang diizinkan: ${VALID_REASONS.join(', ')}`,
            }, { status: 400 });
        }
        if (win_back_potential && !VALID_WIN_BACK.includes(win_back_potential)) {
            return NextResponse.json({
                message: `win_back_potential tidak valid. Nilai yang diizinkan: ${VALID_WIN_BACK.join(', ')}`,
            }, { status: 400 });
        }

        // ── INSERT churn survey ───────────────────────────────────────────────
        const { data: survey, error: insertErr } = await supabaseAdmin
            .from('churn_surveys')
            .insert({
                tenant_id,
                reason,
                detail_note: detail_note || null,
                win_back_potential: win_back_potential || 'unknown',
                follow_up_scheduled_at: follow_up_scheduled_at || null,
                // recorded_by_admin_id dari JWT superadmin yang sedang login
                recorded_by_admin_id: user!.userId,
            })
            .select(`
                id, tenant_id, recorded_by_admin_id, reason,
                detail_note, win_back_potential, recorded_at, follow_up_scheduled_at
            `)
            .single();

        if (insertErr) throw insertErr;

        // ── Side-effect: tandai tenant churned (is_active = false) ────────────
        // Non-blocking terhadap response — jalankan setelah insert berhasil
        const { error: updateErr } = await supabaseAdmin
            .from('tenants')
            .update({ is_active: false })
            .eq('id', tenant_id)
            .eq('is_active', true); // hanya update jika masih aktif (idempotent)

        if (updateErr) {
            // Log saja, jangan gagalkan response
            console.warn('[ChurnSurveys POST] Gagal update is_active tenant:', updateErr.message);
        }

        return NextResponse.json({ data: survey }, { status: 201 });

    } catch (err: any) {
        console.error('[ChurnSurveys POST] Error:', err);
        return NextResponse.json({ message: err.message || 'Internal Server Error' }, { status: 500 });
    }
}
