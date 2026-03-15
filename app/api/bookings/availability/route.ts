import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';

const DURATION_HOME_SERVICE = 45; // minutes
const DURATION_BARBERSHOP = 30; // minutes

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const barberId = searchParams.get('barberId');
    const serviceType = searchParams.get('serviceType');

    if (!date || !barberId || !serviceType) {
        return NextResponse.json({ message: "Date, barberId, and serviceType are required." }, { status: 400 });
    }

    try {
        // === TIMEZONE FIX: Gunakan WIB (Asia/Jakarta, UTC+7) ===
        // Buat waktu awal dan akhir hari dalam WIB agar query ke DB benar
        const startOfDayWIB = new Date(`${date}T00:00:00+07:00`);
        const endOfDayWIB = new Date(`${date}T23:59:59+07:00`);

        // Fetch semua booking barber ini pada tanggal yang dipilih
        const { data: existingBookings, error } = await supabaseAdmin
            .from('bookings')
            .select('start_time, end_time')
            .eq('barber_id', barberId)
            .gte('start_time', startOfDayWIB.toISOString())
            .lt('start_time', endOfDayWIB.toISOString());

        if (error) throw error;

        const bookedSlots = (existingBookings || []).map(b => ({
            start: new Date(b.start_time),
            end: new Date(b.end_time)
        }));

        const gap = serviceType === 'home' ? DURATION_HOME_SERVICE : DURATION_BARBERSHOP;
        const availableSlots: Date[] = [];

        // Buat slot mulai jam 10:00 WIB sampai 20:30 WIB
        // Menggunakan format ISO dengan offset +07:00 agar tidak terpengaruh timezone server
        const openTimeWIB = new Date(`${date}T10:00:00+07:00`);  // Jam buka 10:00 WIB
        const closeTimeWIB = new Date(`${date}T20:30:00+07:00`); // Jam tutup 20:30 WIB

        let currentTimeSlot = new Date(openTimeWIB);

        while (currentTimeSlot <= closeTimeWIB) {
            const slotEnd = new Date(currentTimeSlot.getTime() + gap * 60000);

            let isConflict = false;
            for (const booking of bookedSlots) {
                // Konflik jika slot ini overlap dengan booking yang ada
                if (currentTimeSlot < booking.end && slotEnd > booking.start) {
                    isConflict = true;
                    break;
                }
            }

            if (!isConflict) {
                availableSlots.push(new Date(currentTimeSlot));
            }

            // Maju 30 menit per slot
            currentTimeSlot.setMinutes(currentTimeSlot.getMinutes() + 30);
        }

        return NextResponse.json(availableSlots);
    } catch (error: any) {
        console.error("Error fetching availability:", error);
        return NextResponse.json({ message: "Internal server error.", details: error.message }, { status: 500 });
    }
}
