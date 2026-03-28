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

        // Fetch user's bookings, filtered by tenant if available
        let query = supabaseAdmin
            .from('bookings')
            .select(`
                id,
                start_time,
                status,
                service_type,
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

        // Calculate statistics
        const pastBookings = bookings?.filter((b: any) => new Date(b.start_time) < new Date() || b.status === 'completed') || [];
        const totalHaircuts = pastBookings.length;
        
        let totalSpent = 0;
        const barberCounts: Record<string, number> = {};

        pastBookings.forEach((b: any) => {
            if (b.services?.price) {
                totalSpent += Number(b.services.price);
            }
            if (b.barbers?.name) {
                barberCounts[b.barbers.name] = (barberCounts[b.barbers.name] || 0) + 1;
            }
        });

        // Find favorite barber
        let favoriteBarber = "Belum Ada";
        let maxCount = 0;
        for (const [name, count] of Object.entries(barberCounts)) {
            if (count > maxCount) {
                favoriteBarber = name;
                maxCount = count;
            }
        }

        return NextResponse.json({
            stats: {
                totalHaircuts,
                totalSpent,
                favoriteBarber
            },
            history: bookings || []
        });

    } catch (error: any) {
        console.error('Error fetching profile history:', error);
        return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
    }
}
