import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken } from '@/lib/auth';
import { PLANS, getPlanById, isAnnualPlan } from '@/lib/billing-plans';
// @ts-ignore – midtrans-client tidak punya type definitions resmi
import Midtrans from 'midtrans-client';

const snap = new Midtrans.Snap({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY,
});

export async function POST(request: NextRequest) {
    try {
        // ─── 1. Auth ────────────────────────────────────────────────────────────
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        if (!user.tenant_id) return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 403 });

        const tenantId = user.tenant_id;

        // ─── 2. Validasi Plan ────────────────────────────────────────────────────
        const body = await request.json();
        const plan_id = body.plan as string;

        const validPlans = Object.keys(PLANS);
        if (!validPlans.includes(plan_id)) {
            return NextResponse.json({
                message: `Plan tidak valid. Pilih salah satu: ${validPlans.join(', ')}.`
            }, { status: 400 });
        }

        const plan = getPlanById(plan_id)!;
        const annual = isAnnualPlan(plan_id);

        // ─── 3. Ambil info tenant & owner ───────────────────────────────────────
        const { data: tenant, error: tenantError } = await supabaseAdmin
            .from('tenants')
            .select('id, slug, shop_name, owner_user_id')
            .eq('id', tenantId)
            .single();

        if (tenantError || !tenant) {
            return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 404 });
        }

        const { data: owner } = await supabaseAdmin
            .from('users')
            .select('name, phone_number')
            .eq('id', tenant.owner_user_id)
            .single();

        // ─── 4. Generate Midtrans order ─────────────────────────────────────────
        const tenantShort = tenantId.replace(/-/g, '').substring(0, 8).toUpperCase();
        const orderId = `BARBER-${tenantShort}-${Date.now()}`;

        // Item details berbeda untuk bulanan vs tahunan
        let item_details: Array<{ id: string; name: string; price: number; quantity: number }>;

        if (!annual) {
            // Paket bulanan — satu line item sederhana
            item_details = [{
                id: plan_id,
                name: `Langganan ${plan.name} - 1 Bulan`,
                price: plan.price,
                quantity: 1,
            }];
        } else {
            // Paket tahunan — QRIS/GoPay menolak 'price' negatif (minus) di item_details.
            // Solusi: Kita jadikan 1 baris saja langsung dengan nominal akhir harga setelah diskon.
            item_details = [
                {
                    id: plan_id,
                    name: `${plan.name} (Diskon ${plan.discount_percent}%)`,
                    price: plan.price, // Harga harus selalu positif
                    quantity: 1,
                }
            ];
        }

        const midtransParam = {
            transaction_details: {
                order_id: orderId,
                gross_amount: plan.price,  // total setelah diskon
            },
            item_details,
            customer_details: {
                first_name: owner?.name || 'Owner',
                phone: owner?.phone_number || '',
            },
        };

        const snapResponse = await snap.createTransaction(midtransParam);

        // ─── 5. Simpan transaksi pending ────────────────────────────────────────
        const { error: insertError } = await supabaseAdmin
            .from('subscription_transactions')
            .insert({
                tenant_id: tenantId,
                midtrans_order_id: orderId,
                plan: plan_id,
                amount: plan.price,
                billing_cycle: plan.billing_cycle,
                discount_percent: plan.discount_percent,
                original_amount: plan.original_annual_price ?? plan.price,
                status: 'pending',
            });

        if (insertError) throw insertError;

        return NextResponse.json({
            snap_token: snapResponse.token,
            order_id: orderId,
            client_key: process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY,
            // Info tambahan untuk frontend (tampilkan ringkasan sebelum bayar)
            plan_name: plan.name,
            amount: plan.price,
            billing_cycle: plan.billing_cycle,
            discount_percent: plan.discount_percent,
            savings: annual ? (plan.original_annual_price! - plan.price) : 0,
        });

    } catch (error: any) {
        console.error('[Billing Subscribe] Error:', error);
        return NextResponse.json({ message: error.message || 'Gagal membuat transaksi.' }, { status: 500 });
    }
}
