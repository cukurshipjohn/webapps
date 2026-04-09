import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/tenant-context';
import jwt from 'jsonwebtoken';

export async function GET(request: NextRequest) {
    try {
        const tokenFromCookie = request.cookies.get('token')?.value;
        const authHeader = request.headers.get('authorization');
        const token = tokenFromCookie || (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);

        if (!token) {
            return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
        }

        let decoded: any;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        } catch {
            return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
        }

        const userId = decoded.id;

        // Ambil tenant dari header (di-inject oleh middleware)
        const { tenantId } = getTenantFromRequest(request);

        // ─── TASK 3: Ambil statistik dari VIEW rekonsiliasi ─────────────
        // VIEW member_visit_stats menggabungkan KEDUA jalur transaksi:
        //   - Online Booking  (bookings.user_id)
        //   - POS Walk-in     (bookings.customer_id ↔ customers.phone = users.phone)
        // HANYA booking dengan status = 'completed' yang dihitung.
        const { data: memberStats } = await supabaseAdmin
            .from('member_visit_stats')
            .select('total_visits, total_spent, last_visit_at')
            .eq('user_id', userId)
            .single();

        const totalVisits = memberStats?.total_visits  ?? 0;
        const totalSpent  = memberStats?.total_spent   ?? 0;
        const lastVisitAt = memberStats?.last_visit_at ?? null;

        // ─── Fetch riwayat booking (hanya jalur online, untuk tampilan history) ─
        let query = supabaseAdmin
            .from('bookings')
            .select(`
                id,
                start_time,
                status,
                service_type,
                final_price,
                barbers ( name ),
                services ( name, price )
            `)
            .eq('user_id', userId)
            .order('start_time', { ascending: false });

        if (tenantId) {
            query = query.eq('tenant_id', tenantId);
        }

        const { data: bookings, error } = await query;
        if (error) throw error;

        // ─── Hitung barber favorit dari riwayat ─────────────────────────
        const completedBookings = bookings?.filter((b: any) => b.status === 'completed') || [];
        const barberCounts: Record<string, number> = {};
        completedBookings.forEach((b: any) => {
            if (b.barbers?.name) {
                barberCounts[b.barbers.name] = (barberCounts[b.barbers.name] || 0) + 1;
            }
        });

        let favoriteBarber = 'Belum Ada';
        let maxCount = 0;
        for (const [name, count] of Object.entries(barberCounts)) {
            if (count > maxCount) {
                favoriteBarber = name;
                maxCount = count;
            }
        }

        return NextResponse.json({
            stats: {
                // ✅ BARU: data dari VIEW (kedua jalur, status = 'completed' only)
                totalVisits,
                totalSpent,
                lastVisitAt,
                // Legacy field untuk kompatibilitas komponen lama
                totalHaircuts: totalVisits,
                favoriteBarber
            },
            history: bookings || []
        });

    } catch (error: any) {
        console.error('Error fetching profile history:', error);
        return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
    }
}

