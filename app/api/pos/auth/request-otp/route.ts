import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { normalizePhone, phoneVariants } from '@/lib/phone-utils'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { phone } = await req.json()

    if (!phone) {
      return NextResponse.json({ error: 'Nomor HP harus diisi' }, { status: 400 })
    }

    // 1. Normalisasi: canonical 628... & semua variasi untuk OR query
    const normalizedPhone = normalizePhone(phone)
    const variants = phoneVariants(phone)

    // 2. Query Supabase dengan OR (toleran format 08... maupun 628... di DB)
    // Supabase .or() menerima format: "phone.eq.08xxx,phone.eq.628xxx"
    const orFilter = variants.map(v => `phone.eq.${v}`).join(',')

    const { data: barbersData, error: barberError } = await supabaseAdmin
      .from('barbers')
      .select('id, name, role, tenant_id, is_active, phone, tenants!inner(shop_name, is_active, plan_expires_at)')
      .or(orFilter)

    if (barberError || !barbersData || barbersData.length === 0) {
      return NextResponse.json({ error: 'Nomor tidak terdaftar sebagai barber/kasir' }, { status: 404 })
    }

    // 3. Validasi: Temukan setidaknya 1 profil yang aktif dan tenant-nya aktif
    const validProfiles = barbersData.filter(b => {
      const t = b.tenants as any
      if (!b.is_active || !t.is_active || new Date(t.plan_expires_at) < new Date()) {
        return false
      }
      return true
    })

    if (validProfiles.length === 0) {
      return NextResponse.json({ error: 'Tidak ada profil barber/toko yang aktif untuk nomor ini' }, { status: 403 })
    }

    // 4. Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 menit

    // 5. Simpan ke tabel otp_sessions (gunakan phone canonical 628... sebagai key)
    // Kolom di DB: phone_number (bukan phone), tidak ada kolom purpose
    const { error: otpError } = await supabaseAdmin
      .from('otp_sessions')
      .upsert({
        phone_number: normalizedPhone,
        otp_code: otp,
        expires_at: expiresAt,
        used: false
      }, { onConflict: 'phone_number' })

    if (otpError) {
      console.error('Error saving OTP session:', otpError)
      return NextResponse.json({ error: 'Gagal membuat sesi OTP' }, { status: 500 })
    }

    // 6. Kirim OTP via WhatsApp (pakai nomor canonical 628...)
    let responsePayload: any = {
      success: true,
      maskedPhone: normalizedPhone.slice(0, 3) + '***' + normalizedPhone.slice(-4)
    }

    try {
      let serviceUrl = process.env.WHATSAPP_SERVICE_URL || '';
      if (serviceUrl && !serviceUrl.startsWith('http')) {
        serviceUrl = `https://${serviceUrl}`;
      }

      const waResponse = await fetch(`${serviceUrl}/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': process.env.WHATSAPP_SERVICE_SECRET || ''
        },
        body: JSON.stringify({
          phoneNumber: normalizedPhone,
          otpCode: otp,
          portalType: 'pos',
        }),
        signal: AbortSignal.timeout(6000)
      })

      if (!waResponse.ok) {
        console.warn('Gagal mengirim WhatsApp OTP, tetap lanjutkan. Status:', waResponse.status)
        if (process.env.NODE_ENV === 'development') {
          responsePayload.debug_otp = otp
        }
      }
    } catch (waErr) {
      console.error('Error memanggil layanan WhatsApp:', waErr)
      if (process.env.NODE_ENV === 'development') {
        responsePayload.debug_otp = otp
      }
    }

    // 7. Response 200
    return NextResponse.json(responsePayload)
  } catch (error: any) {
    console.error('Error in POST /api/pos/auth/request-otp:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan sistem' }, { status: 500 })
  }
}
