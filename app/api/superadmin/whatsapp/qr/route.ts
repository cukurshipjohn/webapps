import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';

const WA_URL    = process.env.WHATSAPP_SERVICE_URL   || 'http://localhost:3001';
const WA_SECRET = process.env.WHATSAPP_SERVICE_SECRET || '';

export async function GET(request: NextRequest) {
    const user = getUserFromToken(request);
    if (!user || user.role !== 'superadmin') {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const session_id = searchParams.get('session_id') || 'default';

    try {
        const res = await fetch(`${WA_URL}/session/qr/${session_id}`, {
            headers: { 'x-internal-secret': WA_SECRET },
            signal: AbortSignal.timeout(8000),
        });
        const data = await res.json();
        return NextResponse.json(data);
    } catch {
        return NextResponse.json({ status: 'service_unreachable', qr: null }, { status: 503 });
    }
}

// POST: Create / init a session
export async function POST(request: NextRequest) {
    const user = getUserFromToken(request);
    if (!user || user.role !== 'superadmin') {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { session_id = 'default' } = await request.json().catch(() => ({}));

    try {
        const res = await fetch(`${WA_URL}/session/create`, {
            method: 'POST',
            headers: {
                'x-internal-secret': WA_SECRET,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ session_id }),
            signal: AbortSignal.timeout(8000),
        });
        const data = await res.json();
        return NextResponse.json(data);
    } catch {
        return NextResponse.json({ success: false, error: 'WA service unreachable' }, { status: 503 });
    }
}

// DELETE: Logout a session
export async function DELETE(request: NextRequest) {
    const user = getUserFromToken(request);
    if (!user || user.role !== 'superadmin') {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const session_id = searchParams.get('session_id') || 'default';

    try {
        const res = await fetch(`${WA_URL}/session/logout/${session_id}`, {
            method: 'DELETE',
            headers: { 'x-internal-secret': WA_SECRET },
            signal: AbortSignal.timeout(8000),
        });
        const data = await res.json();
        return NextResponse.json(data);
    } catch {
        return NextResponse.json({ success: false, error: 'WA service unreachable' }, { status: 503 });
    }
}
