import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { generatePosToken } from '@/lib/pos-auth'
import { normalizePhone, phoneVariants } from '@/lib/phone-utils'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { phone, otp } = await req.json()

    if (!phone || !otp) {
      return NextResponse.json({ error: 'Nomor HP dan OTP harus diisi' }, { status: 400 })
    }

    // 1. Normalisasi phone ke format canonical 628...
    const normalizedPhone = normalizePhone(phone)
    const variants = phoneVariants(phone)

    // 2. Query otp_sessions (OTP selalu disimpan dengan key canonical 628...)
    // Kolom di DB: phone_number (bukan phone), tidak ada kolom purpose
    const { data: otpSession, error: otpError } = await supabaseAdmin
      .from('otp_sessions')
      .select('id, otp_code, expires_at')
      .eq('phone_number', normalizedPhone)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (otpError || !otpSession) {
      return NextResponse.json({ error: 'Kode OTP tidak valid atau sudah kadaluarsa' }, { status: 400 })
    }

    // 3. Validasi OTP
    if (otpSession.otp_code !== otp) {
      return NextResponse.json({ error: 'Kode OTP salah' }, { status: 400 })
    }

    // 4. Tandai OTP terpakai
    await supabaseAdmin
      .from('otp_sessions')
      .update({ used: true })
      .eq('id', otpSession.id)

    // 5. Ambil data barber + tenant dengan OR query (toleran format 08... maupun 628...)
    const orFilter = variants.map(v => `phone.eq.${v}`).join(',')

    const { data: barbersData, error: barberError } = await supabaseAdmin
      .from('barbers')
      .select('id, name, role, tenant_id, phone, is_active, tenants!inner(shop_name, is_active, plan_expires_at)')
      .or(orFilter)

    if (barberError || !barbersData || barbersData.length === 0) {
      return NextResponse.json({ error: 'Data barber tidak ditemukan' }, { status: 404 })
    }

    // 6. Filter profil yang valid (barber & tenant aktif, plan belum expired)
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

    // 7. Logika Multi-Role: Utamakan role 'cashier' (Kasta Tertinggi)
    let selectedProfile = validProfiles.find(b => b.role === 'cashier')
    if (!selectedProfile) {
      selectedProfile = validProfiles[0] // fallback ke profil pertama jika semua role barber
    }

    const tenant = selectedProfile.tenants as any

    // 8. Generate POS JWT
    const token = generatePosToken({
      barberId: selectedProfile.id,
      tenantId: selectedProfile.tenant_id,
      barberName: selectedProfile.name,
      barberRole: selectedProfile.role as 'barber' | 'cashier',
      phone: selectedProfile.phone,
      shopName: tenant.shop_name,
    })

    // BUG #6 FIX: Set HttpOnly cookie untuk pos_token agar terlindungi dari serangan XSS.
    // Token juga tetap dikembalikan di body JSON untuk backward compatibility
    // dengan POS frontend yang masih membaca dari localStorage.
    const sessionHours = parseInt(process.env.POS_SESSION_HOURS || '12', 10);

    const response = NextResponse.json({
      success: true,
      token,
      barberName: selectedProfile.name,
      barberRole: selectedProfile.role,
      shopName: tenant.shop_name,
      tenantId: selectedProfile.tenant_id,
    })

    response.cookies.set({
      name: 'pos_token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/pos',
      maxAge: sessionHours * 3600,
    })

    return response

  } catch (error: any) {
    console.error('Error in POST /api/pos/auth/verify-otp:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan sistem' }, { status: 500 })
  }
}
