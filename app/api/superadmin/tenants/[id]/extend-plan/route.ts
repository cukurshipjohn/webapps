import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getPlan } from '@/lib/billing-plans';

function requireSuperAdmin(request: NextRequest) {
    const user = getUserFromToken(request);
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'superadmin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    return user;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = requireSuperAdmin(request);
        if (user instanceof NextResponse) return user;

        const tenantId = (await params).id;
        const body = await request.json();
        const { days = 30, plan: newPlan } = body;

        if (typeof days !== 'number' || days <= 0) {
            return NextResponse.json({ message: 'days harus angka positif' }, { status: 400 });
        }

        // Ambil data tenant saat ini
        const { data: tenant, error: fetchError } = await supabaseAdmin
            .from('tenants')
            .select('id, shop_name, plan, plan_expires_at, owner_user_id')
            .eq('id', tenantId)
            .single();

        if (fetchError || !tenant) {
            return NextResponse.json({ message: 'Tenant tidak ditemukan' }, { status: 404 });
        }

        // Hitung tanggal baru: extend dari expiry saat ini atau dari now (mana yang lebih besar)
        const currentExpiry = tenant.plan_expires_at ? new Date(tenant.plan_expires_at) : new Date();
        const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
        const newExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

        const finalPlan = newPlan || tenant.plan;
        const planData = getPlan(finalPlan);

        const updatePayload: Record<string, any> = {
            plan: finalPlan,
            plan_expires_at: newExpiry.toISOString(),
            is_active: true,
        };

        if (planData) {
            // 999999 adalah sentinel value untuk "unlimited" di billing-plans.ts
            // Simpan ke DB sebagai nilai besar tapi valid (bukan Infinity)
            updatePayload.max_barbers = planData.max_barbers >= 999999 ? 999999 : planData.max_barbers;
            updatePayload.max_bookings_per_month = planData.max_bookings_per_month >= 999999 ? 999999 : planData.max_bookings_per_month;
        }

        const { error: updateError } = await supabaseAdmin
            .from('tenants')
            .update(updatePayload)
            .eq('id', tenantId);

        if (updateError) throw updateError;

        // Kirim WA notifikasi ke owner
        const { data: owner } = await supabaseAdmin
            .from('users')
            .select('phone_number')
            .eq('id', tenant.owner_user_id)
            .single();

        if (owner?.phone_number) {
            const waUrl = process.env.WHATSAPP_SERVICE_URL;
            const waSecret = process.env.WHATSAPP_SERVICE_SECRET;
            if (waUrl && waSecret) {
                await fetch(`${waUrl}/send-message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-internal-secret': waSecret },
                    body: JSON.stringify({
                        phoneNumber: owner.phone_number,
                        message: `🎁 *Langganan Diperpanjang!*\n\nHalo! Langganan *${tenant.shop_name}* telah diperpanjang ${days} hari${newPlan ? ` dengan upgrade ke paket *${planData?.name || newPlan}*` : ''}.\n\n📅 Aktif hingga: *${newExpiry.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}*\n\nTerima kasih! ✂️`,
                    }),
                }).catch(() => {});
            }
        }

        return NextResponse.json({
            message: `Plan diperpanjang ${days} hari hingga ${newExpiry.toLocaleDateString('id-ID')}`,
            plan: finalPlan,
            plan_expires_at: newExpiry.toISOString(),
        });

    } catch (error: any) {
        console.error('[Superadmin Extend Plan] Error:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
