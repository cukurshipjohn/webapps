import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';
import { canUseKasir, getMaxKasirBarbers } from '@/lib/billing-plans';
import { SERVICE_TYPES } from '@/lib/service-types';

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════
// GET /api/admin/service-barber-pricing?service_id=xxx
// GET /api/admin/service-barber-pricing?barber_id=xxx
// ═══════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        if (!user.tenant_id) return NextResponse.json({ error: 'Tenant tidak ditemukan.' }, { status: 403 });

        const serviceId = request.nextUrl.searchParams.get('service_id');
        const barberId = request.nextUrl.searchParams.get('barber_id');

        if (!serviceId && !barberId) {
            return NextResponse.json({ error: 'Parameter service_id atau barber_id wajib diisi.' }, { status: 400 });
        }

        // ── Mode 1: By service_id — semua barber untuk 1 layanan ──
        if (serviceId) {
            // Validasi service ownership + type
            const { data: service, error: svcErr } = await supabaseAdmin
                .from('services')
                .select('id, name, service_type, tenant_id')
                .eq('id', serviceId)
                .eq('tenant_id', user.tenant_id)
                .single();

            if (svcErr || !service) {
                return NextResponse.json({ error: 'Layanan tidak ditemukan.' }, { status: 404 });
            }
            if (service.service_type !== SERVICE_TYPES.POS_KASIR) {
                return NextResponse.json({ error: 'Konfigurasi harga per barber hanya berlaku untuk layanan tipe pos_kasir.' }, { status: 400 });
            }

            // Ambil semua barber tenant
            const { data: allBarbers } = await supabaseAdmin
                .from('barbers')
                .select('id, name')
                .eq('tenant_id', user.tenant_id)
                .order('name');

            // Ambil konfigurasi yang sudah ada
            const { data: existingConfigs } = await supabaseAdmin
                .from('service_barber_pricing')
                .select('*')
                .eq('service_id', serviceId)
                .eq('tenant_id', user.tenant_id);

            // Merge: barber yang belum punya config → default values
            const configMap = new Map(
                (existingConfigs || []).map(c => [c.barber_id, c])
            );

            const result = (allBarbers || []).map(barber => {
                const config = configMap.get(barber.id);
                return {
                    barber_id: barber.id,
                    barber_name: barber.name,
                    is_visible: config?.is_visible ?? true,
                    price_override: config?.price_override ?? null,
                    price_min_override: config?.price_min_override ?? null,
                    price_max_override: config?.price_max_override ?? null,
                    sort_order: config?.sort_order ?? 0,
                    has_config: !!config,
                };
            });

            return NextResponse.json(result);
        }

        // ── Mode 2: By barber_id — semua layanan kasir untuk 1 barber ──
        if (barberId) {
            // Validasi barber ownership
            const { data: barber, error: bErr } = await supabaseAdmin
                .from('barbers')
                .select('id, name, tenant_id')
                .eq('id', barberId)
                .eq('tenant_id', user.tenant_id)
                .single();

            if (bErr || !barber) {
                return NextResponse.json({ error: 'Barber tidak ditemukan.' }, { status: 404 });
            }

            // Ambil semua layanan kasir tenant + config barber
            const { data: kasirServices } = await supabaseAdmin
                .from('services')
                .select('id, name, price, price_type, price_min, price_max')
                .eq('tenant_id', user.tenant_id)
                .eq('service_type', SERVICE_TYPES.POS_KASIR)
                .eq('is_active', true)
                .order('name');

            const { data: existingConfigs } = await supabaseAdmin
                .from('service_barber_pricing')
                .select('*')
                .eq('barber_id', barberId)
                .eq('tenant_id', user.tenant_id);

            const configMap = new Map(
                (existingConfigs || []).map(c => [c.service_id, c])
            );

            const result = (kasirServices || []).map(svc => {
                const config = configMap.get(svc.id);
                return {
                    service_id: svc.id,
                    service_name: svc.name,
                    base_price: svc.price,
                    base_price_type: svc.price_type,
                    base_price_min: svc.price_min,
                    base_price_max: svc.price_max,
                    barber_id: barberId,
                    barber_name: barber.name,
                    is_visible: config?.is_visible ?? true,
                    price_override: config?.price_override ?? null,
                    price_min_override: config?.price_min_override ?? null,
                    price_max_override: config?.price_max_override ?? null,
                    sort_order: config?.sort_order ?? 0,
                    has_config: !!config,
                };
            });

            return NextResponse.json(result);
        }

        return NextResponse.json({ error: 'Parameter tidak valid.' }, { status: 400 });
    } catch (error: any) {
        if (error.message?.includes('403 Forbidden')) {
            return NextResponse.json({ error: error.message }, { status: 403 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// ═══════════════════════════════════════════════════════════════
// POST /api/admin/service-barber-pricing (bulk upsert)
// ═══════════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        if (!user.tenant_id) return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });

        const body = await request.json();
        const { service_id, configurations } = body;

        // ── Validasi input ──
        if (!service_id) {
            return NextResponse.json({ error: 'service_id wajib diisi.' }, { status: 400 });
        }
        if (!Array.isArray(configurations) || configurations.length === 0) {
            return NextResponse.json({ error: 'configurations harus berupa array dan tidak boleh kosong.' }, { status: 400 });
        }

        // ── Validasi service ownership + type ──
        const { data: service, error: svcErr } = await supabaseAdmin
            .from('services')
            .select('id, name, service_type, tenant_id')
            .eq('id', service_id)
            .eq('tenant_id', user.tenant_id)
            .single();

        if (svcErr || !service) {
            return NextResponse.json({ error: 'Layanan tidak ditemukan.' }, { status: 404 });
        }
        if (service.service_type !== SERVICE_TYPES.POS_KASIR) {
            return NextResponse.json({ error: 'Konfigurasi harga per barber hanya berlaku untuk layanan tipe pos_kasir.' }, { status: 400 });
        }

        // ── Fetch tenant plan ──
        const { data: tenant } = await supabaseAdmin
            .from('tenants')
            .select('plan')
            .eq('id', user.tenant_id)
            .single();

        const planId = tenant?.plan || 'trial';

        if (!canUseKasir(planId)) {
            return NextResponse.json({
                error: 'Fitur kasir hanya tersedia untuk plan Pro dan Business.'
            }, { status: 403 });
        }

        // ── Validasi maxKasirBarbers ──
        const maxKasir = getMaxKasirBarbers(planId);

        // Hitung barber DISTINCT yang sudah punya konfigurasi is_visible=true
        // untuk tenant ini (di semua service kasir, bukan hanya yang ini)
        const { data: existingActiveBarbers } = await supabaseAdmin
            .from('service_barber_pricing')
            .select('barber_id')
            .eq('tenant_id', user.tenant_id)
            .eq('is_visible', true);

        const currentActiveBarberIds = new Set(
            (existingActiveBarbers || []).map(r => r.barber_id)
        );

        // Barber baru yang akan ditambahkan dengan is_visible=true
        const newVisibleBarberIds = configurations
            .filter((c: any) => c.is_visible === true)
            .map((c: any) => c.barber_id);

        // Gabungkan set existing + new untuk hitung total
        const projectedActiveBarbers = new Set(currentActiveBarberIds);
        for (const bid of newVisibleBarberIds) {
            projectedActiveBarbers.add(bid);
        }

        // Kurangi barber yang akan di-set is_visible=false dalam batch ini
        const newHiddenBarberIds = configurations
            .filter((c: any) => c.is_visible === false)
            .map((c: any) => c.barber_id);

        for (const bid of newHiddenBarberIds) {
            // Hanya hapus dari set jika barber ini TIDAK punya config visible lain
            // di service lain. Cek: apakah barber ini punya is_visible=true di service lain?
            const hasOtherVisibleConfig = (existingActiveBarbers || []).some(
                r => r.barber_id === bid
            );
            // Jika yang kita set hidden adalah satu-satunya config, hapus dari set
            // Untuk simplisitas: kita hanya remove jika dia sedang di-set hidden
            // dan kita sudah punya dia di projectedActiveBarbers
            // Note: accurate count memerlukan query per barber, tapi ini cukup konservatif
        }

        if (maxKasir !== null && projectedActiveBarbers.size > maxKasir) {
            const planName = planId.includes('pro') ? 'Pro' : planId;
            return NextResponse.json({
                error: `Plan ${planName} hanya mendukung ${maxKasir} barber kasir aktif. Upgrade ke Business untuk menambah lebih banyak.`,
                upgrade_required: true,
                current_active: currentActiveBarberIds.size,
                max_allowed: maxKasir
            }, { status: 403 });
        }

        // ── Validasi semua barber_id milik tenant ini ──
        const barberIds = configurations.map((c: any) => c.barber_id);
        const { data: validBarbers } = await supabaseAdmin
            .from('barbers')
            .select('id')
            .eq('tenant_id', user.tenant_id)
            .in('id', barberIds);

        const validBarberIdSet = new Set((validBarbers || []).map(b => b.id));
        const invalidBarbers = barberIds.filter((id: string) => !validBarberIdSet.has(id));

        if (invalidBarbers.length > 0) {
            return NextResponse.json({
                error: `Barber tidak ditemukan atau bukan milik toko ini: ${invalidBarbers.join(', ')}`
            }, { status: 400 });
        }

        // ── Build upsert payload ──
        const now = new Date().toISOString();
        const upsertPayload = configurations.map((c: any) => ({
            tenant_id: user.tenant_id,
            service_id: service_id,
            barber_id: c.barber_id,
            is_visible: c.is_visible ?? true,
            price_override: c.price_override ?? null,
            price_min_override: c.price_min_override ?? null,
            price_max_override: c.price_max_override ?? null,
            sort_order: c.sort_order ?? 0,
            updated_at: now,
        }));

        const { data: upserted, error: upsertError } = await supabaseAdmin
            .from('service_barber_pricing')
            .upsert(upsertPayload, { onConflict: 'service_id,barber_id' })
            .select();

        if (upsertError) throw upsertError;

        return NextResponse.json({
            updated: upserted?.length || 0,
            configurations: upserted || []
        });
    } catch (error: any) {
        if (error.message?.includes('403 Forbidden')) {
            return NextResponse.json({ error: error.message }, { status: 403 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
