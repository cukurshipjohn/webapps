import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken } from '@/lib/auth';
import { getPlan } from '@/lib/billing-plans';
// @ts-ignore – midtrans-client tidak punya type definitions resmi
import Midtrans from 'midtrans-client';

const snap = new Midtrans.Snap({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY,
});

export async function POST(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        if (!user.tenant_id) return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 403 });

        const body = await request.json();
        const planKey = body.plan as string;
        const plan = getPlan(planKey);

        if (!plan) {
            return NextResponse.json({ message: 'Plan tidak valid. Pilih starter, pro, atau business.' }, { status: 400 });
        }

        // Ambil info tenant & owner
        const { data: tenant, error: tenantError } = await supabaseAdmin
            .from('tenants')
            .select('id, slug, shop_name, owner_user_id')
            .eq('id', user.tenant_id)
            .single();

        if (tenantError || !tenant) {
            return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 404 });
        }

        const { data: owner } = await supabaseAdmin
            .from('users')
            .select('name, phone_number')
            .eq('id', tenant.owner_user_id)
            .single();

        // Generate unique order ID
        const tenantShort = user.tenant_id.replace(/-/g, '').substring(0, 8).toUpperCase();
        const orderId = `BARBER-${tenantShort}-${Date.now()}`;

        // Buat Midtrans Snap transaction
        const midtransParam = {
            transaction_details: {
                order_id: orderId,
                gross_amount: plan.price,
            },
            item_details: [
                {
                    id: planKey,
                    price: plan.price,
                    quantity: 1,
                    name: `Langganan ${plan.name} - CukurShip`,
                },
            ],
            customer_details: {
                first_name: owner?.name || 'Owner',
                phone: owner?.phone_number || '',
            },
            // Midtrans akan mengirimkan notifikasi ke endpoint webhook kita
        };

        const snapResponse = await snap.createTransaction(midtransParam);

        // Simpan transaksi dengan status 'pending'
        const { error: insertError } = await supabaseAdmin
            .from('subscription_transactions')
            .insert({
                tenant_id: user.tenant_id,
                midtrans_order_id: orderId,
                plan: planKey,
                amount: plan.price,
                status: 'pending',
            });

        if (insertError) throw insertError;

        return NextResponse.json({
            snap_token: snapResponse.token,
            order_id: orderId,
            client_key: process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY,
        });

    } catch (error: any) {
        console.error('[Billing Subscribe] Error:', error);
        return NextResponse.json({ message: error.message || 'Gagal membuat transaksi.' }, { status: 500 });
    }
}
