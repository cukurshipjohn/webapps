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
        const selectedDate = new Date(date);
        selectedDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(selectedDate);
        nextDay.setDate(selectedDate.getDate() + 1);

        // Fetch all bookings for this barber on the selected date
        const { data: existingBookings, error } = await supabaseAdmin
            .from('bookings')
            .select('start_time, end_time')
            .eq('barber_id', barberId)
            .gte('start_time', selectedDate.toISOString())
            .lt('start_time', nextDay.toISOString());

        if (error) throw error;

        const bookedSlots = (existingBookings || []).map(b => ({
            start: new Date(b.start_time),
            end: new Date(b.end_time)
        }));

        const gap = serviceType === 'home' ? DURATION_HOME_SERVICE : DURATION_BARBERSHOP;
        const availableSlots: Date[] = [];

        let currentTimeSlot = new Date(selectedDate);
        currentTimeSlot.setHours(10, 0, 0, 0); // Open at 10 AM

        const endTimeLimit = new Date(selectedDate);
        endTimeLimit.setHours(20, 30, 0, 0); // Close at 8:30 PM

        while (currentTimeSlot <= endTimeLimit) {
            const slotEnd = new Date(currentTimeSlot.getTime() + gap * 60000);

            let isConflict = false;
            for (const booking of bookedSlots) {
                // A conflict exists if slot overlaps any existing booking
                if (currentTimeSlot < booking.end && slotEnd > booking.start) {
                    isConflict = true;
                    break;
                }
            }

            if (!isConflict) {
                availableSlots.push(new Date(currentTimeSlot));
            }

            // Advance 30 minutes per slot
            currentTimeSlot.setMinutes(currentTimeSlot.getMinutes() + 30);
        }

        return NextResponse.json(availableSlots);
    } catch (error: any) {
        console.error("Error fetching availability:", error);
        return NextResponse.json({ message: "Internal server error.", details: error.message }, { status: 500 });
    }
}
