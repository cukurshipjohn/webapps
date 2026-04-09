import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPosTokenFromRequest } from '@/lib/pos-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const payload = getPosTokenFromRequest(req as any)
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { items, customer_name, payment_method, booking_group_id, barber_id } = body

    if (!items || items.length < 1) {
      return NextResponse.json({ error: 'Keranjang kosong' }, { status: 422 })
    }
    if (!payment_method) {
      return NextResponse.json({ error: 'Pilih metode pembayaran' }, { status: 422 })
    }

    let targetBarberId = barber_id
    if (payload.barberRole === 'barber') {
      if (barber_id && barber_id !== payload.barberId) {
        return NextResponse.json({ error: 'Tidak diizinkan submit atas nama barber lain' }, { status: 403 })
      }
      targetBarberId = payload.barberId
    } else {
      if (!targetBarberId) {
        return NextResponse.json({ error: 'Barber harus dipilih' }, { status: 422 })
      }
      // Verifikasi barber milik tenant ini
      const { data: bData, error: bErr } = await supabaseAdmin
        .from('barbers')
        .select('id')
        .eq('id', targetBarberId)
        .eq('tenant_id', payload.tenantId)
        .single()

      if (bErr || !bData) {
        return NextResponse.json({ error: 'Barber tidak valid' }, { status: 403 })
      }
    }

    const { data: existingGroup } = await supabaseAdmin
      .from('bookings')
      .select('id')
      .eq('booking_group_id', booking_group_id)
      .limit(1)

    if (existingGroup && existingGroup.length > 0) {
      return NextResponse.json({ error: 'Transaksi sudah diproses sebelumnya' }, { status: 409 })
    }

    const serviceIds = items.map((itm: any) => itm.service_id)
    const { data: dbServices, error: srvError } = await supabaseAdmin
      .from('services')
      .select('id, name, price, price_min, price_max, price_type')
      .in('id', serviceIds)
      .eq('tenant_id', payload.tenantId)

    if (srvError || !dbServices || dbServices.length !== new Set(serviceIds).size) {
      return NextResponse.json({ error: 'Satu atau lebih layanan tidak valid' }, { status: 422 })
    }

    const servicesMap = new Map(dbServices.map((s: any) => [s.id, s]))

    // Tambahan: kita butuh ngambil barber name untuk snapshot dsb, atau simpan null di backend kalau schema support null di sebagian fields untuk POS.
    // Tapi schema asli: customer_name, customer_phone, service_name, service_price, barber_name.
    // Karena ini Web POS Walk-in, customer_phone bisa "-", barber_name kita ambil dari db.
    const { data: barberData } = await supabaseAdmin
      .from('barbers')
      .select('name')
      .eq('id', targetBarberId)
      .single()

    const barberNameStr = barberData?.name || 'Kasir / Barber'

    let totalAmount = 0
    const nowStr = new Date().toISOString()

    // ==== RESOLVE CUSTOMER ID ====
    // total_visits TIDAK lagi diupdate di sini.
    // Sumber kebenaran statistik kunjungan sekarang adalah VIEW member_visit_stats.
    let resolvedCustomerId: string | null = null;
    const isGenericCustomer = !customer_name || customer_name === 'Pelanggan Umum';
    if (!isGenericCustomer) {
        // Cari customer yang sudah ada berdasarkan nama
        const { data: existingCustomer } = await supabaseAdmin
            .from('customers')
            .select('id')
            .eq('tenant_id', payload.tenantId)
            .ilike('name', customer_name.trim())
            .maybeSingle();
            
        if (existingCustomer) {
            resolvedCustomerId = existingCustomer.id;
            // Update last_visit_at saja (total_visits deprecated — pakai VIEW member_visit_stats)
            await supabaseAdmin.from('customers')
                .update({ last_visit_at: nowStr })
                .eq('id', existingCustomer.id);
        } else {
            // Buat customer baru (total_visits tidak di-set, pakai VIEW)
            const { data: newCustomer } = await supabaseAdmin
                .from('customers')
                .insert({ tenant_id: payload.tenantId, name: customer_name.trim(), last_visit_at: nowStr })
                .select('id')
                .single();
            resolvedCustomerId = newCustomer?.id ?? null;
        }
    }

    const insertPayloads = items.map((item: any) => {
      const dbSrv = servicesMap.get(item.service_id)
      
      let validPrice = false
      if (dbSrv.price_type === 'range') {
        validPrice = item.final_price >= dbSrv.price_min && item.final_price <= dbSrv.price_max
      } else {
        validPrice = item.final_price === dbSrv.price
      }

      if (!validPrice) {
        throw new Error(`Harga untuk layanan ${dbSrv.name} tidak valid.`)
      }

      totalAmount += item.final_price

      return {
        tenant_id: payload.tenantId,
        barber_id: targetBarberId,
        service_id: item.service_id,
        service_type: 'pos_kasir',
        customer_id: resolvedCustomerId,
        status: 'completed', // 'done' violates schema
        final_price: item.final_price,
        payment_method: payment_method,
        payment_status: 'paid',
        booking_source: 'web_pos', // TASK 2: Web POS walk-in, bukan online booking
        booking_group_id: booking_group_id,
        start_time: nowStr, // required by schema instead of booking_date/time
        end_time: nowStr,
        created_at: nowStr
      }
    })

    const { error: insertError } = await supabaseAdmin
      .from('bookings')
      .insert(insertPayloads)

    if (insertError) {
      console.error('Insert Error:', insertError)
      return NextResponse.json({ error: 'Gagal memproses transaksi' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      booking_group_id: booking_group_id,
      total: totalAmount,
      item_count: items.length,
      timestamp: nowStr,
    })

  } catch (error: any) {
    console.error('Error POST /api/pos/checkout:', error)
    if (error.message.includes('Harga')) {
      return NextResponse.json({ error: error.message }, { status: 422 })
    }
    return NextResponse.json({ error: 'Terjadi kesalahan sistem' }, { status: 500 })
  }
}
