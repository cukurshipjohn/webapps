import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';

export async function GET() {
    try {
        const { data: services, error } = await supabaseAdmin
            .from('services')
            .select('*')
            .order('price', { ascending: true });

        if (error) throw error;
        return NextResponse.json(services);
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

export async function POST() {
    // Seed services for initial setup (tanpa Haircut + Creambath)
    try {
        const { error } = await supabaseAdmin
            .from('services')
            .insert([
                { name: "Men's Haircut", price: 15, duration_minutes: 30 },
                { name: "Haircut + Wash", price: 20, duration_minutes: 45 }
            ]);

        if (error) throw error;
        return new NextResponse('Services seeded successfully', { status: 201 });
    } catch (error: any) {
        return new NextResponse(error.message, { status: 500 });
    }
}

export async function DELETE() {
    // Endpoint untuk menghapus service "Haircut + Creambath" dari database
    try {
        const { error } = await supabaseAdmin
            .from('services')
            .delete()
            .eq('name', 'Haircut + Creambath');

        if (error) throw error;
        return NextResponse.json({ message: 'Service "Haircut + Creambath" berhasil dihapus.' });
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
