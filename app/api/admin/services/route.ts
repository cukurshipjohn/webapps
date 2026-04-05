import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';
import { canUseKasir, getMaxKasirBarbers, getPlanById } from '@/lib/billing-plans';
import { SERVICE_TYPES, BOOKING_SERVICE_TYPES } from '@/lib/service-types';

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════
// GET /api/admin/services?type=barbershop|home_service|pos_kasir
// ═══════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin', 'barber'], user.role);
        if (!user.tenant_id) return NextResponse.json({ error: 'Tenant tidak ditemukan.' }, { status: 403 });

        const typeParam = request.nextUrl.searchParams.get('type');

        // Fetch tenant plan for planInfo
        const { data: tenant } = await supabaseAdmin
            .from('tenants')
            .select('plan')
            .eq('id', user.tenant_id)
            .single();

        const planId = tenant?.plan || 'trial';
        const kasirEnabled = canUseKasir(planId);
        const maxKasirBarbers = getMaxKasirBarbers(planId);

        // Build query
        let query = supabaseAdmin
            .from('services')
            .select('*')
            .eq('tenant_id', user.tenant_id)
            .order('created_at', { ascending: true });

        if (typeParam === SERVICE_TYPES.POS_KASIR) {
            // Explicit POS kasir request — admin only view
            query = query.eq('service_type', SERVICE_TYPES.POS_KASIR);
        } else if (typeParam === SERVICE_TYPES.BARBERSHOP || typeParam === SERVICE_TYPES.HOME_SERVICE) {
            // Specific booking type filter
            query = query.eq('service_type', typeParam);
        } else {
            // Default: return barbershop + home_service, NEVER pos_kasir
            // SECURITY: pos_kasir services hanya muncul jika diminta eksplisit
            query = query.in('service_type', BOOKING_SERVICE_TYPES);
        }

        const { data, error } = await query;
        if (error) throw error;

        return NextResponse.json({
            services: data || [],
            planInfo: { planId, kasirEnabled, maxKasirBarbers }
        });
    } catch (error: any) {
        if (error.message?.includes('403 Forbidden')) {
            return NextResponse.json({ error: error.message }, { status: 403 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// ═══════════════════════════════════════════════════════════════
// POST /api/admin/services
// ═══════════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        if (!user.tenant_id) return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });

        const body = await request.json();
        const {
            name, price, price_type, price_min, price_max,
            service_type, duration_minutes, is_active
        } = body;

        // ── Validasi dasar ──
        if (!name || typeof name !== 'string' || !name.trim()) {
            return NextResponse.json({ error: 'Nama layanan wajib diisi.' }, { status: 400 });
        }
        const validServiceTypes = [SERVICE_TYPES.BARBERSHOP, SERVICE_TYPES.HOME_SERVICE, SERVICE_TYPES.POS_KASIR];
        if (!service_type || !validServiceTypes.includes(service_type)) {
            return NextResponse.json({ error: 'Tipe layanan tidak valid. Gunakan: barbershop, home_service, atau pos_kasir.' }, { status: 400 });
        }

        // ── Fetch tenant plan ──
        const { data: tenant } = await supabaseAdmin
            .from('tenants')
            .select('plan')
            .eq('id', user.tenant_id)
            .single();

        const planId = tenant?.plan || 'trial';

        // ── Validasi kasir plan gate ──
        if (service_type === SERVICE_TYPES.POS_KASIR) {
            if (!canUseKasir(planId)) {
                return NextResponse.json({
                    error: 'Fitur kasir hanya tersedia untuk plan Pro dan Business. Upgrade plan Anda untuk menggunakan fitur ini.'
                }, { status: 403 });
            }
        }

        // ── Validasi limit layanan (barbershop & home_service only) ──
        if (service_type !== SERVICE_TYPES.POS_KASIR) {
            const plan = getPlanById(planId);
            // trial: 0, starter: 5, pro & business: unlimited (999999)
            const maxBookings = plan?.max_bookings_per_month ?? 0;
            // Determine max services: trial=0, starter=5, pro/business=unlimited
            let maxServices: number;
            if (planId === 'trial') {
                maxServices = 3;
            } else if (planId === 'starter' || planId === 'starter_annual') {
                maxServices = 5;
            } else {
                maxServices = 999999; // unlimited for pro & business
            }

            const { count: currentCount } = await supabaseAdmin
                .from('services')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', user.tenant_id)
                .in('service_type', BOOKING_SERVICE_TYPES)
                .eq('is_active', true);

            if (typeof currentCount === 'number' && currentCount >= maxServices) {
                return NextResponse.json({
                    error: `Batas layanan tercapai (${maxServices} layanan untuk plan ${plan?.name || planId}). Upgrade plan untuk menambah lebih banyak layanan.`,
                    upgrade_required: true
                }, { status: 403 });
            }
        }

        // ── Validasi price_type ──
        const effectivePriceType = price_type || 'fixed';
        if (!['fixed', 'range', 'custom'].includes(effectivePriceType)) {
            return NextResponse.json({ error: 'price_type tidak valid. Gunakan: fixed, range, atau custom.' }, { status: 400 });
        }

        if (effectivePriceType === 'fixed' && (price === undefined || price === null)) {
            return NextResponse.json({ error: 'Harga (price) wajib diisi untuk tipe harga fixed.' }, { status: 400 });
        }

        if (effectivePriceType === 'range') {
            if (price_min === undefined || price_min === null || price_max === undefined || price_max === null) {
                return NextResponse.json({ error: 'price_min dan price_max wajib diisi untuk tipe harga range.' }, { status: 400 });
            }
            if (Number(price_min) >= Number(price_max)) {
                return NextResponse.json({ error: 'price_min harus lebih kecil dari price_max.' }, { status: 400 });
            }
        }

        // ── Insert ──
        const insertPayload: Record<string, any> = {
            name: name.trim(),
            price: price !== undefined && price !== null ? Number(price) : 0,
            price_type: effectivePriceType,
            price_min: effectivePriceType === 'range' ? Number(price_min) : null,
            price_max: effectivePriceType === 'range' ? Number(price_max) : null,
            service_type,
            duration_minutes: duration_minutes ? parseInt(duration_minutes, 10) : 30,
            is_active: is_active !== undefined ? is_active : true,
            tenant_id: user.tenant_id
        };

        const { data, error } = await supabaseAdmin
            .from('services')
            .insert(insertPayload)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({
            message: 'Layanan berhasil ditambahkan',
            service: data
        });
    } catch (error: any) {
        if (error.message?.includes('403 Forbidden')) {
            return NextResponse.json({ error: error.message }, { status: 403 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
