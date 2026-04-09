import { supabaseAdmin } from '@/lib/supabase'

export async function notifyOwnerNewExpense(params: {
  tenantId:       string
  barberName:     string
  category:       string
  description:    string
  amount:         number
  expenseId:      string
}): Promise<void> {
  try {
    // 1. Ambil data owner + shop_name
    const { data: tenantData, error } = await supabaseAdmin
      .from('tenants')
      .select(`
        shop_name,
        owner_user_id,
        slug,
        users!tenants_owner_user_id_fkey(phone, name)
      `)
      .eq('id', params.tenantId)
      .limit(1)
      .single()

    if (error || !tenantData || !tenantData.users) {
      console.error('[notifyOwnerNewExpense] Failed to fetch owner data:', error)
      return
    }

    const owner = tenantData.users as any
    if (!owner.phone) {
      console.warn('[notifyOwnerNewExpense] Owner does not have a phone number.')
      return
    }

    // 2. Format kategori
    const catLabel: Record<string, string> = {
      supplies: '🧴 Produk/Alat',
      utility:  '💡 Utilitas',
      other:    '🔧 Lainnya',
    }
    const label = catLabel[params.category] ?? params.category

    // 3. Format nominal
    const rupiah = 'Rp ' + params.amount.toLocaleString('id-ID')

    // 4. Kirim WA ke owner
    const wpUrl = process.env.WHATSAPP_SERVICE_URL
    const wpSecret = process.env.WHATSAPP_SERVICE_SECRET

    if (!wpUrl || !wpSecret) {
      console.warn('[notifyOwnerNewExpense] WHATSAPP_SERVICE_URL/SECRET missing.')
      return
    }

    const message = `💸 *Pengajuan Pengeluaran Baru*\n` +
      `Toko: ${tenantData.shop_name}\n` +
      `Diajukan oleh: *${params.barberName}*\n\n` +
      `📋 Detail:\n` +
      `• Kategori   : ${label}\n` +
      `• Keterangan : ${params.description}\n` +
      `• Nominal    : *${rupiah}*\n\n` +
      `🔗 Tinjau di Admin Panel:\n` +
      `https://${tenantData.slug}.cukurship.id/admin/expenses`

    await fetch(`${wpUrl}/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${wpSecret}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phone: owner.phone,
        message: message
      })
    })

  } catch (err) {
    // 5. Jangan gagalkan request, log error saja
    console.error('[notifyOwnerNewExpense] Unexpected error:', err)
  }
}

export async function notifyBarberExpenseResult(params: {
  barberId:        string
  status:          'approved' | 'rejected'
  description:     string
  amount:          number
  rejectionReason: string | null
}): Promise<void> {
  try {
    // 1. Ambil data barber
    const { data: barber, error } = await supabaseAdmin
      .from('barbers')
      .select('name, phone, telegram_chat_id')
      .eq('id', params.barberId)
      .single()

    if (error || !barber) {
      console.error('[notifyBarberExpenseResult] Barber not found:', error)
      return
    }

    // 2. Buat pesan
    const rupiah = 'Rp ' + params.amount.toLocaleString('id-ID')
    const msg = params.status === 'approved'
      ? `✅ *Pengeluaran Disetujui*\n\n` +
        `Pengajuan "${params.description}" ` +
        `senilai *${rupiah}* telah ` +
        `*DISETUJUI* oleh owner.`
      : `❌ *Pengeluaran Ditolak*\n\n` +
        `Pengajuan "${params.description}" ` +
        `senilai *${rupiah}* *DITOLAK*.\n` +
        `Alasan: ${params.rejectionReason}`

    // 3. Prioritas notif: Telegram -> WA
    if (barber.telegram_chat_id) {
      const tgToken = process.env.TELEGRAM_BOT_TOKEN
      if (tgToken) {
        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: barber.telegram_chat_id,
            text: msg,
            parse_mode: 'Markdown'
          })
        })
      }
    } else if (barber.phone) {
      const wpUrl = process.env.WHATSAPP_SERVICE_URL
      const wpSecret = process.env.WHATSAPP_SERVICE_SECRET
      if (wpUrl && wpSecret) {
        await fetch(`${wpUrl}/send`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${wpSecret}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            phone: barber.phone,
            message: msg
          })
        })
      }
    }

  } catch (err) {
    // 4. Log error, jangan throw
    console.error('[notifyBarberExpenseResult] Unexpected error:', err)
  }
}
