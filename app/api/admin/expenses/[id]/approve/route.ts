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

    // 2. Update
    const { error: updateError } = await supabaseAdmin
      .from('barber_expenses')
      .update({
        status: 'approved',
        approved_by: auth.userId,
        approved_at: new Date().toISOString()
      })
      .eq('id', expenseId)

    if (updateError) {
      console.error('[PATCH /approve] Update error:', updateError)
      return NextResponse.json({ error: 'Gagal menyetujui pengajuan' }, { status: 500 })
    }

    // 3. Notif ke barber (non-blocking)
    notifyBarberExpenseResult({
      barberId: expense.barber_id,
      status: 'approved',
      description: expense.description,
      amount: expense.amount,
      rejectionReason: null
    }).catch(console.error)

    // 4. Response 200
    return NextResponse.json({ success: true, message: 'Expense approved' }, { status: 200 })

  } catch (error) {
    console.error('[PATCH /approve] Unexpected error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan sistem' }, { status: 500 })
  }
}
