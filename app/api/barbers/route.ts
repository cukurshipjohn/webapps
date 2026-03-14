import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';

export async function GET() {
    try {
        const { data: barbers, error } = await supabaseAdmin
            .from('barbers')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;
        return NextResponse.json(barbers);
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

export async function POST() {
    // Seed barbers for initial setup
    try {
        const { error } = await supabaseAdmin
            .from('barbers')
            .insert([
                { name: 'John Doe', phone: '+1234567890', specialty: 'Classic Cuts' },
                { name: 'Jane Smith', phone: '+10987654321', specialty: 'Modern Styles' }
            ]);

        if (error) throw error;
        return new NextResponse('Barbers seeded successfully', { status: 201 });
    } catch (error: any) {
        return new NextResponse(error.message, { status: 500 });
    }
}
