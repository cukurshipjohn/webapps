import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';
import { getPlanPrice, getPlanById, isInPromo, promoMonthsRemaining } from '@/lib/billing-plans';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        // 1. Auth & Verification
        const user = getUserFromToken(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        try {
            requireRole(['owner'], user.role);
        } catch {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Baca tenantId dari header x-tenant-id (atau fallback dari user JWT)
        const tenantId = request.headers.get('x-tenant-id') || user.tenant_id;
        if (!tenantId) {
            return NextResponse.json({ error: 'Tenant ID required' }, { status: 400 });
        }

        // 2. Ambil tenant dari DB untuk mendapat plan saat ini
        const { data: tenant, error: tenantError } = await supabaseAdmin
            .from('tenants')
            .select('plan')
            .eq('id', tenantId)
            .single();

        if (tenantError || !tenant) {
            return NextResponse.json({ error: 'Tenant tidak ditemukan' }, { status: 404 });
        }

        const planId = tenant.plan;
        
        // Cek original value di billing-plans
        const planDef = getPlanById(planId);
        if (!planDef) {
            return NextResponse.json({ error: 'Plan tenant invalid' }, { status: 400 });
        }

        // 3. Hitung paidCycles
        const { count: rawCount } = await supabaseAdmin
          .from('subscription_transactions')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .in('status', ['settled', 'paid']);

        const paidCycles = rawCount ?? 0;

        // 4. Hitung detail promo
        const currentPrice = getPlanPrice(planId, paidCycles);
        const normalPrice = planDef.normal_price;
        const inPromo = isInPromo(planId, paidCycles);
        const remaining = promoMonthsRemaining(planId, paidCycles);

        // 5. Response 200
        return NextResponse.json({
            is_in_promo: inPromo,
            promo_months_remaining: remaining,
            current_price: currentPrice,
            normal_price: normalPrice,
            plan_id: planId,
            paid_cycles: paidCycles
        });

    } catch (error: any) {
        console.error('[Billing Promo-Status] Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
