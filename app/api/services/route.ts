import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'barbershop' atau 'home'

    try {
        let query = supabaseAdmin
            .from('services')
            .select('*')
            .order('price', { ascending: true });

        // Filter berdasarkan prefix nama layanan
        if (type === 'home') {
            query = query.ilike('name', 'HOME |%');
        } else if (type === 'barbershop') {
            query = query.ilike('name', 'BARBER |%');
        }

        const { data: services, error } = await query;
        if (error) throw error;
        return NextResponse.json(services);
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

export async function POST() {
    // Seed services untuk setup awal
    try {
        const { error } = await supabaseAdmin
            .from('services')
            .insert([
                // Barbershop
                { name: "BARBER | Haircut", price: 15000, duration_minutes: 30 },
                { name: "BARBER | Haircut + Keramas", price: 20000, duration_minutes: 45 },
                // Home Service
                { name: "HOME | 1 Orang", price: 35000, duration_minutes: 45 },
                { name: "HOME | 2 Orang", price: 50000, duration_minutes: 60 },
                { name: "HOME | 3 Orang", price: 60000, duration_minutes: 75 },
                { name: "HOME | 5+ Orang", price: 75000, duration_minutes: 90 },
            ]);
        if (error) throw error;
        return new NextResponse('Services seeded successfully', { status: 201 });
    } catch (error: any) {
        return new NextResponse(error.message, { status: 500 });
    }
}
