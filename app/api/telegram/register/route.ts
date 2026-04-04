import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const SECRET_TOKEN = process.env.TELEGRAM_WEBHOOK_SECRET;
    const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN;
    
    // Fallback: Use request host if APP_DOMAIN is testing/local
    let baseUrl = `https://${APP_DOMAIN}`;
    const host = request.headers.get('host');
    if (host && (host.includes('localhost') || host.includes('ngrok'))) {
        baseUrl = `https://${host}`; // ngrok required HTTPS
    }

    const WEBHOOK_URL = `${baseUrl}/api/telegram/webhook`;

    if (!BOT_TOKEN) {
        return NextResponse.json({ message: "TELEGRAM_BOT_TOKEN tidak ditemukan di .env" }, { status: 500 });
    }

    try {
        const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;
        
        const payload: any = { url: WEBHOOK_URL };
        if (SECRET_TOKEN) {
            payload.secret_token = SECRET_TOKEN;
        }

        const res = await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        
        if (data.ok) {
            return NextResponse.json({ 
                message: "✅ Webhook Berhasil Didaftarkan!", 
                webhook_url: WEBHOOK_URL,
                telegram_response: data 
            });
        } else {
            return NextResponse.json({ 
                message: "❌ Gagal mendaftarkan Webhook", 
                telegram_response: data 
            }, { status: 400 });
        }
    } catch (err: any) {
        return NextResponse.json({ message: "Kesalahan server", error: err.message }, { status: 500 });
    }
}
