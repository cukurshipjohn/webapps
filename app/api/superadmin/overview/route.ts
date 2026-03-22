import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

function requireSuperAdmin(request: NextRequest) {
    const user = getUserFromToken(request);
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'superadmin') return NextResponse.json({ message: 'Forbidden: Superadmin only' }, { status: 403 });
    return user;
}

export async function GET(request: NextRequest) {
    try {
        const user = requireSuperAdmin(request);
        if (user instanceof NextResponse) return user;

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

        // Total tenants by plan
        const { data: allTenants } = await supabaseAdmin
            .from('tenants')
            .select('id, plan, is_active, plan_expires_at, shop_name, slug, created_at, owner_user_id');

        if (!allTenants) return NextResponse.json({ message: 'Failed to fetch tenants' }, { status: 500 });

        const totalTenants = allTenants.length;
        const trialTenants = allTenants.filter(t => t.plan === 'trial').length;
        const paidTenants = allTenants.filter(t => t.plan !== 'trial' && t.is_active).length;
        const inactiveTenants = allTenants.filter(t => !t.is_active).length;

        // MRR dari transaksi bulan ini (paid)
        const { data: monthlyPaid } = await supabaseAdmin
            .from('subscription_transactions')
            .select('amount')
            .eq('status', 'paid')
            .gte('paid_at', startOfMonth);

        const mrr = (monthlyPaid || []).reduce((sum, tx) => sum + (tx.amount || 0), 0);

        // 5 tenant terbaru
        const newestTenants = allTenants
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 5);

        // Tenant yang expired dalam 7 hari ke depan
        const expiringTenants = allTenants.filter(t => {
            if (!t.plan_expires_at) return false;
            const exp = new Date(t.plan_expires_at);
            return exp > now && exp <= new Date(sevenDaysLater) && t.plan !== 'trial';
        });

        // Ambil nomor owner untuk tenant yang expiring
        if (expiringTenants.length > 0) {
            const ownerIds = expiringTenants.map(t => t.owner_user_id).filter(Boolean);
            const { data: owners } = await supabaseAdmin
                .from('users')
                .select('id, phone_number, name')
                .in('id', ownerIds);

            const ownerMap = Object.fromEntries((owners || []).map(o => [o.id, o]));
            expiringTenants.forEach((t: any) => {
                t.owner = ownerMap[t.owner_user_id] || null;
            });
        }

        // Toko baru per minggu (4 minggu terakhir)
        const weeklyStats = [];
        for (let i = 3; i >= 0; i--) {
            const weekStart = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
            const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
            const count = allTenants.filter(t => {
                const created = new Date(t.created_at);
                return created >= weekStart && created < weekEnd;
            }).length;
            weeklyStats.push({
                week: `${weekStart.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}`,
                count,
            });
        }

        return NextResponse.json({
            stats: { totalTenants, trialTenants, paidTenants, inactiveTenants, mrr },
            newestTenants,
            expiringTenants,
            weeklyStats,
        });

    } catch (error: any) {
        console.error('[Superadmin Overview] Error:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
