import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getUserFromToken } from '@/lib/auth'
import { notifyBarberExpenseResult } from '@/lib/expense-notify'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: any) {
  try {
    const auth = getUserFromToken(req)
    if (!auth) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

    const expenseId = params.id

    // 1. Ambil expense
    const { data: expense, error: fetchError } = await supabaseAdmin
      .from('barber_expenses')
      .select('*')
      .eq('id', expenseId)
      .single()

    if (fetchError || !expense) {
      return NextResponse.json({ error: 'Pengajuan tidak ditemukan' }, { status: 404 })
    }
    if (expense.tenant_id !== auth.tenant_id) {
      return NextResponse.json({ error: 'Data tidak ditemukan di toko ini' }, { status: 404 })
    }
    if (expense.status !== 'pending') {
      return NextResponse.json({ error: 'Pengajuan sudah diproses' }, { status: 409 })
    }

    // 2. Baca state (contoh asumsikan kita dapat `req.json({ reason: '...' })`)
    let reason = null
    try {
      const body = await req.json()
      if (body.reason) reason = body.reason
    } catch (e) {
      // Body opsional
    }

    // 3. Update status
    const { error: updateError } = await supabaseAdmin
      .from('barber_expenses')
      .update({
        status: 'rejected',
        approved_by: auth.userId,
        approved_at: new Date().toISOString(),
        rejection_reason: reason
      })
      .eq('id', expenseId)

    if (updateError) {
      console.error('[PATCH /reject] Update error:', updateError)
      return NextResponse.json({ error: 'Gagal menolak pengajuan' }, { status: 500 })
    }

    // 4. Notif
    notifyBarberExpenseResult({
      barberId: expense.barber_id,
      status: 'rejected',
      description: expense.description,
      amount: expense.amount,
      rejectionReason: reason
    }).catch(console.error)

    return NextResponse.json({ success: true, message: 'Expense rejected' }, { status: 200 })

  } catch (error) {
    console.error('[PATCH /reject] Unexpected error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan sistem' }, { status: 500 })
  }
}
