import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Verifikasi request dari Vercel Cron
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: 'Unauthorized' }, { status: 401 }
    )
  }

  const { data, error } = await supabaseAdmin
    .from('telegram_bot_sessions')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id')

  if (error) {
    return NextResponse.json(
      { error: error.message }, { status: 500 }
    )
  }

  return NextResponse.json({
    deleted: data?.length ?? 0,
    timestamp: new Date().toISOString(),
  })
}
