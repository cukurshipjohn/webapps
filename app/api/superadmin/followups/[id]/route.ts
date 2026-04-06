import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getUserFromToken, requireRole } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
      const { id } = await params
      const user = await getUserFromToken(req)
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      requireRole(['superadmin'], user.role)

      const body = await req.json()
      const { outcome, note } = body

      const validOutcomes = [
        'pending','no_response','interested',
        'renewed','upgraded','churned_confirmed','resolved'
      ]
      if (!validOutcomes.includes(outcome)) {
        return NextResponse.json(
          { error: 'Outcome tidak valid' }, { status: 400 }
        )
      }

      const isDone = outcome !== 'pending'

      const { data, error } = await supabaseAdmin
        .from('superadmin_followups')
        .update({
          outcome,
          note:     note ?? undefined,
          done_at:  isDone ? new Date().toISOString() : null,
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ data })
  } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 403 })
  }
}
