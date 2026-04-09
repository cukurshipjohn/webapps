import { NextResponse } from 'next/server'
import { getPosTokenFromRequest } from '@/lib/pos-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { notifyOwnerNewExpense } from '@/lib/expense-notify'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const payload = getPosTokenFromRequest(req as any)
  if (!payload || !payload.tenantId || !payload.barberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const contentType = req.headers.get('content-type') || ''
    let category = ''
    let description = ''
    let amount = 0
    let receipt: File | null = null

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      category = formData.get('category') as string
      description = formData.get('description') as string
      amount = parseInt(formData.get('amount') as string, 10)
      const receiptFile = formData.get('receipt')
      if (receiptFile && receiptFile instanceof File) {
        receipt = receiptFile
      }
    } else {
      const body = await req.json()
      category = body.category
      description = body.description
      amount = parseInt(body.amount, 10)
    }

    // 1. Parse & Validasi
    if (!['supplies', 'utility', 'other'].includes(category)) {
      return NextResponse.json({ error: 'Kategori tidak valid' }, { status: 422 })
    }
    if (!description || description.trim() === '') {
      return NextResponse.json({ error: 'Keterangan wajib diisi' }, { status: 422 })
    }
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Nominal tidak valid' }, { status: 422 })
    }

    // 2. Upload foto jika ada
    let receiptUrl: string | null = null
    if (receipt) {
      const fileExt = receipt.name.split('.').pop()
      const fileName = `${payload.tenantId}/${payload.barberId}/${Date.now()}.${fileExt}`

      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('expense-receipts')
        .upload(fileName, receipt, {
          contentType: receipt.type,
          upsert: false,
        })

      if (!uploadError && uploadData) {
        receiptUrl = uploadData.path
      } else {
        console.error('[POST /pos/expenses] Upload error:', uploadError)
        // Lanjut tanpa foto (jangan gagalkan request)
      }
    }

    // 3. Insert ke barber_expenses
    const { data: expense, error } = await supabaseAdmin
      .from('barber_expenses')
      .insert({
        tenant_id: payload.tenantId,
        barber_id: payload.barberId,
        category,
        description,
        amount,
        receipt_url: receiptUrl,
        status: 'pending'
      })
      .select()
      .single()

    if (error || !expense) {
      console.error('[POST /pos/expenses] Insert error:', error)
      return NextResponse.json({ error: 'Gagal menyimpan' }, { status: 500 })
    }

    // 4. Kirim notifikasi ke owner (non-blocking)
    notifyOwnerNewExpense({
      tenantId: payload.tenantId,
      barberName: payload.barberName || 'Barber',
      category,
      description,
      amount,
      expenseId: expense.id
    }).catch(console.error)

    // 5. Response 201
    return NextResponse.json({
      success: true,
      expense_id: expense.id,
      message: 'Pengajuan berhasil dikirim ke owner'
    }, { status: 201 })

  } catch (error) {
    console.error('[POST /pos/expenses] Unexpected error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan sistem' }, { status: 500 })
  }
}
