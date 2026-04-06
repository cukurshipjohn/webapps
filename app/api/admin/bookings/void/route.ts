import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken, requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromToken(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    // Only owner/superadmin can approve
    try {
      requireRole(["owner", "superadmin"], user.role);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }

    const tenantId = user.tenant_id;

    // Fetch pending voids
    const { data, error } = await supabaseAdmin
      .from('booking_voids')
      .select(`
        id, created_at, status, reason,
        bookings (
          id, final_price, booking_source, created_at, service_name_snapshot,
          services ( name, price )
        ),
        barbers (
          id, name
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error: any) {
    console.error("GET Voids Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserFromToken(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
      requireRole(["owner", "superadmin"], user.role);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }

    const body = await req.json();
    const { void_id, action, note } = body;

    if (!void_id || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const tenantId = user.tenant_id;

    // Get the void request
    const { data: voidReq, error: fetchError } = await supabaseAdmin
      .from('booking_voids')
      .select('id, booking_id, status, bookings(booking_group_id)')
      .eq('id', void_id)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchError || !voidReq) {
      return NextResponse.json({ error: "Void request not found" }, { status: 404 });
    }

    if (voidReq.status !== 'pending') {
      return NextResponse.json({ error: `Void is already ${voidReq.status}` }, { status: 400 });
    }

    const bookings = voidReq.bookings as any;
    const bookingGroupId = bookings?.booking_group_id;

    if (action === 'approve') {
      // 1. Cancel all bookings in the group
      if (bookingGroupId) {
        await supabaseAdmin
          .from('bookings')
          .update({ status: 'cancelled' })
          .eq('booking_group_id', bookingGroupId)
          .eq('tenant_id', tenantId);
      } else {
        await supabaseAdmin
          .from('bookings')
          .update({ status: 'cancelled' })
          .eq('id', voidReq.booking_id)
          .eq('tenant_id', tenantId);
      }

      // 2. Update void request status
      await supabaseAdmin
        .from('booking_voids')
        .update({
          status: 'approved',
          reviewed_by: user.userId,
          reviewed_at: new Date().toISOString(),
          review_note: note || null
        })
        .eq('id', void_id);

      // (WA notification to barber omitted/handled by triggers if needed)
      return NextResponse.json({ message: "Void approved and bookings cancelled" });
    } 
    
    if (action === 'reject') {
      // Update void request status
      await supabaseAdmin
        .from('booking_voids')
        .update({
          status: 'rejected',
          reviewed_by: user.userId,
          reviewed_at: new Date().toISOString(),
          review_note: note || null
        })
        .eq('id', void_id);

      return NextResponse.json({ message: "Void rejected" });
    }

    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  } catch (error: any) {
    console.error("PATCH Void Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
