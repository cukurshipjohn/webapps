import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken, requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";

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
    
    const { searchParams } = new URL(req.url);
    const countOnly = searchParams.get('count_only') === 'true';
    
    if (countOnly) {
      const { count } = await supabaseAdmin
        .from('booking_voids')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'pending');
        
      return NextResponse.json({ count: count ?? 0 });
    }

    // Fetch pending voids
    const { data, error } = await supabaseAdmin
      .from('booking_voids')
      .select(`
        id, created_at, status, reason,
        bookings (
          id, final_price, booking_source, created_at,
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

    // Calculate total void value for notifications
    let totalVoid = 0;
    if (bookingGroupId) {
       const { data: groupBookings } = await supabaseAdmin.from('bookings').select('final_price').eq('booking_group_id', bookingGroupId);
       totalVoid = groupBookings?.reduce((sum, b) => sum + (Number(b.final_price) || 0), 0) || 0;
    } else {
       const { data: singleBooking } = await supabaseAdmin.from('bookings').select('final_price').eq('id', voidReq.booking_id).single();
       totalVoid = Number(singleBooking?.final_price) || 0;
    }

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

      // 3. Update void request status
      await supabaseAdmin
        .from('booking_voids')
        .update({
          status: 'approved',
          reviewed_by: user.userId,
          reviewed_at: new Date().toISOString(),
          review_note: note || null
        })
        .eq('id', void_id);

      // 4. Send Telegram Notification to Barber
      const { data: voidData } = await supabaseAdmin
        .from('booking_voids')
        .select('barbers!booking_voids_requested_by_fkey ( name, telegram_chat_id )')
        .eq('id', void_id)
        .single();
      
      const barberChatId = (voidData?.barbers as any)?.telegram_chat_id;
      if (barberChatId) {
        await sendTelegramMessage(
          barberChatId,
          `✅ *Permintaan Pembatalan Disetujui*\n\n` +
          `Owner telah menyetujui pembatalan transaksi:\n` +
          `💰 Total: Rp ${totalVoid.toLocaleString('id-ID')}\n\n` +
          `Transaksi sudah dibatalkan dari sistem.\n` +
          `Ketuk /kasir untuk transaksi baru.`
        );
      }

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

      // Send Telegram Notification to Barber
      const { data: voidData } = await supabaseAdmin
        .from('booking_voids')
        .select('barbers!booking_voids_requested_by_fkey ( name, telegram_chat_id )')
        .eq('id', void_id)
        .single();
      
      const barberChatId = (voidData?.barbers as any)?.telegram_chat_id;
      if (barberChatId) {
        const noteText = note ? `\n📝 Alasan: _${note}_` : '';
        await sendTelegramMessage(
          barberChatId,
          `❌ *Permintaan Pembatalan Ditolak*\n\n` +
          `Owner tidak menyetujui pembatalan:\n` +
          `💰 Total: Rp ${totalVoid.toLocaleString('id-ID')}` +
          `${noteText}\n\n` +
          `Transaksi tetap tercatat sebagai selesai.\n` +
          `Hubungi owner jika ada pertanyaan.`
        );
      }

      return NextResponse.json({ message: "Void rejected" });
    }

    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  } catch (error: any) {
    console.error("PATCH Void Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
