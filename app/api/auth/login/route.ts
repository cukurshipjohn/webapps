import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '@/lib/supabase';


export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { phoneNumber } = body;

        if (!phoneNumber) {
            return NextResponse.json({ message: "Phone number is required." }, { status: 400 });
        }

        // Check if user already exists
        const { data: existingUsers, error: fetchError } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('phone_number', phoneNumber)
            .limit(1);

        if (fetchError) throw fetchError;

        let user;

        if (!existingUsers || existingUsers.length === 0) {
            // Create new user
            const { data: newUser, error: insertError } = await supabaseAdmin
                .from('users')
                .insert({ phone_number: phoneNumber })
                .select()
                .single();

            if (insertError) throw insertError;
            user = newUser;
        } else {
            user = existingUsers[0];
        }

        const token = jwt.sign(
            { id: user.id, phoneNumber: user.phone_number },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '24h' }
        );

        return NextResponse.json({
            message: "Login successful!",
            token,
            user: { id: user.id, phoneNumber: user.phone_number }
        });
    } catch (error: any) {
        console.error("Login error:", error);
        return NextResponse.json({ message: "Internal server error.", details: error.message }, { status: 500 });
    }
}
