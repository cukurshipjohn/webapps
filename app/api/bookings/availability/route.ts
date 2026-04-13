import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { getTenantFromRequest } from '../../../../lib/tenant-context';

const DURATION_HOME_SERVICE = 45; // minutes
const DURATION_BARBERSHOP = 30; // minutes

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const barberId = searchParams.get('barberId');
    const serviceType = searchParams.get('serviceType');

    if (!date || !barberId || !serviceType) {
        return NextResponse.json({ message: "Date, barberId, and serviceType are required." }, { status: 400 });
    }

    try {
        const startOfDayWIB = new Date(`${date}T00:00:00+07:00`);
        const endOfDayWIB = new Date(`${date}T23:59:59+07:00`);

        // Ambil tenant dari header dulu (dari middleware), fallback ke lookup barber
        const { tenantId: headerTenantId } = getTenantFromRequest(request);
        let tenantId = headerTenantId;

        if (!tenantId) {
            const { data: barberData, error: barberError } = await supabaseAdmin
                .from('barbers')
                .select('tenant_id')
                .eq('id', barberId)
                .single();

            if (barberError || !barberData?.tenant_id) {
                return NextResponse.json({ message: "Barber tidak valid." }, { status: 400 });
            }
            tenantId = barberData.tenant_id;
        }

        // 2. BACA JAM OPERASIONAL TOKO DARI tenant_settings
        // Jika tidak ada record, gunakan default 10:00 – 20:00
        const { data: tenantSettings } = await supabaseAdmin
            .from('tenant_settings')
            .select('operating_open, operating_close')
            .eq('tenant_id', tenantId)
            .single();

        // Ambil string jam (HH:MM) — DB menyimpan TIME sebagai "HH:MM:SS", slice 0-5 sudah cukup
        const openStr  = (tenantSettings?.operating_open  as string | null)?.slice(0, 5) ?? '10:00';
        const closeStr = (tenantSettings?.operating_close as string | null)?.slice(0, 5) ?? '20:00';

        // 3. CEK HARI LIBUR / CUTI (time_off)
        // Cari apakah ada rentang libur yang mencakup tanggal ini
        const { data: timeOffData, error: timeOffError } = await supabaseAdmin
            .from('time_off')
            .select('*')
            .eq('tenant_id', tenantId)
            .lte('start_date', date)
            .gte('end_date', date);

        if (timeOffError && timeOffError.code !== 'PGRST116') {
             console.error("Error fetching time off:", timeOffError);
        }

        // Filter: Apakah liburnya berlaku untuk seluruh toko (barber_id IS NULL) atau spesifik barber yang direquest
        const isHoliday = (timeOffData || []).some(off => 
            off.barber_id === null || off.barber_id === barberId
        );

        if (isHoliday) {
            // Jika hari tersebut libur, langsung kembalikan array kosong (tidak ada slot tersedia)
            return NextResponse.json([]);
        }

        // 4. Fetch semua booking barber ini pada tanggal yang dipilih
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

        // Buat slot berdasarkan jam operasional toko (dibaca dari tenant_settings)
        // Format ISO dengan offset +07:00 agar tidak terpengaruh timezone server
        const openTimeWIB  = new Date(`${date}T${openStr}:00+07:00`);   // Jam buka dari pengaturan toko
        const closeTimeWIB = new Date(`${date}T${closeStr}:00+07:00`);  // Jam tutup dari pengaturan toko

        let currentTimeSlot = new Date(openTimeWIB);

        // Slot hanya dibuat jika waktu SELESAI-nya tidak melampaui jam tutup
        while (currentTimeSlot.getTime() + gap * 60000 <= closeTimeWIB.getTime()) {
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
