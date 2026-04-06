import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getUserFromToken, requireRole } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
      const { id } = await params
      const user = await getUserFromToken(req)
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      requireRole(['superadmin'], user.role)

      const body = await req.json()
      const { message, template, followup_id } = body

      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select(`
          id, name,
          users!owner_user_id ( phone, name )
        `)
        .eq('id', id)
        .single()

      const ownerPhone = (tenant?.users as any)?.phone
      if (!ownerPhone) {
        return NextResponse.json(
          { error: 'Nomor HP owner tidak ditemukan' },
          { status: 404 }
        )
      }

      const waServiceUrl = process.env.WHATSAPP_SERVICE_URL
      if (!waServiceUrl) {
        return NextResponse.json(
          { error: 'WA service tidak dikonfigurasi' },
          { status: 500 }
        )
      }

      const finalMessage = message ?? getWATemplate(template, tenant?.name ?? '')

      const waResponse = await fetch(`${waServiceUrl}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone:   ownerPhone,
          message: finalMessage,
        }),
      })

      if (!waResponse.ok) {
        return NextResponse.json({ error: 'Gagal kirim WA' }, { status: 502 })
      }

      if (followup_id) {
        await supabaseAdmin
          .from('superadmin_followups')
          .update({
            channel:  'whatsapp',
            outcome:  'pending',
            note:     `WA terkirim: ${finalMessage.substring(0, 100)}...`,
            done_at:  null,
          })
          .eq('id', followup_id)
      }

      return NextResponse.json({ success: true })
  } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 403 })
  }
}

function getWATemplate(template: string, tenantName: string): string {
  const templates: Record<string, string> = {
    renewal_7:
      `Halo Kak, kami dari CukurShip 👋\n\n` +
      `Langganan *${tenantName}* akan berakhir dalam ` +
      `*7 hari lagi*. Perpanjang sekarang agar barbershop ` +
      `terus berjalan tanpa gangguan 🔄\n\n` +
      `Klik di sini untuk perpanjang: [link]`,

    renewal_3:
      `⚠️ Halo Kak, *MENDESAK!*\n\n` +
      `Langganan *${tenantName}* tinggal *3 hari lagi*. ` +
      `Segera perpanjang sebelum akses dinonaktifkan 🚨\n\n` +
      `Perpanjang sekarang: [link]`,

    usage_check:
      `Halo Kak 👋 Kami perhatikan *${tenantName}* ` +
      `belum aktif mencatat transaksi beberapa hari ini.\n\n` +
      `Ada yang bisa kami bantu? Kami siap membantu ` +
      `jika ada kendala penggunaan CukurShip 🙏`,

    reactivation:
      `Halo Kak, kami kangen *${tenantName}* 😊\n\n` +
      `Kami punya penawaran spesial untuk reaktivasi. ` +
      `Tertarik? Balas pesan ini atau klik: [link]`,
  }

  return templates[template] ?? `Halo dari CukurShip! Ada yang bisa kami bantu?`
}
