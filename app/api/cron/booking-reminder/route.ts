import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { countPendingBookings } from '@/lib/booking-alerts'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // Auth Guard — hanya Vercel Cron atau internal yang bisa akses
  const secret = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let sent = 0
  let skipped = 0

  try {
    // 1. Ambil semua barber aktif yang punya telegram_chat_id
    //    dan tenant-nya masih aktif serta plannya belum expired
    const { data: barbers, error } = await supabaseAdmin
      .from('barbers')
      .select(`
        id,
        name,
        role,
        tenant_id,
        telegram_chat_id,
        tenants!inner ( shop_name, is_active, plan_expires_at )
      `)
      .not('telegram_chat_id', 'is', null)
      .eq('is_active', true)

    if (error) {
      console.error('[cron/booking-reminder] fetch barbers error:', error)
      return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }

    if (!barbers || barbers.length === 0) {
      return NextResponse.json({ success: true, sent: 0, skipped: 0, note: 'No barbers with Telegram', timestamp: new Date().toISOString() })
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
      return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not configured' }, { status: 500 })
    }

    // 2. Loop setiap barber
    for (const barber of barbers) {
      const tenant = (barber as any).tenants

      // Skip jika tenant tidak aktif / plan expired
      if (!tenant?.is_active) { skipped++; continue }
      if (tenant?.plan_expires_at && new Date(tenant.plan_expires_at) < new Date()) { skipped++; continue }

      const { count } = await countPendingBookings(
        barber.tenant_id,
        barber.role === 'barber' ? barber.id : null,
        barber.role as 'barber' | 'cashier'
      )

      // Lewati barber yang tidak punya pending booking
      if (count === 0) { skipped++; continue }

      const shopName = tenant?.shop_name ?? 'Toko'
      const msg = [
        `☀️ <b>Selamat Pagi, ${barber.name}!</b>`,
        ``,
        `📅 Di <b>${shopName}</b> hari ini:`,
        `🔴 <b>${count} booking online</b> menunggu konfirmasi selesai dari kamu.`,
        ``,
        `Ketik /kasir untuk mulai.`,
      ].join('\n')

      try {
        await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id:    barber.telegram_chat_id,
              text:       msg,
              parse_mode: 'HTML',
            }),
          }
        )
        sent++
      } catch (sendErr) {
        console.error(`[cron] failed to send to ${barber.name}:`, sendErr)
        skipped++
      }

      // Delay 50ms antar barber (max ~20 msg/detik sesuai Telegram rate limit)
      await new Promise(r => setTimeout(r, 50))
    }

    return NextResponse.json({
      success:   true,
      sent,
      skipped,
      timestamp: new Date().toISOString(),
    })

  } catch (err: any) {
    console.error('[cron/booking-reminder] fatal error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
