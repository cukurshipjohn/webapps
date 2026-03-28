import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';

const WA_URL    = process.env.WHATSAPP_SERVICE_URL   || 'http://localhost:3001';
const WA_SECRET = process.env.WHATSAPP_SERVICE_SECRET || '';

export async function GET(request: NextRequest) {
    // Auth: hanya superadmin
    const user = getUserFromToken(request);
    if (!user || user.role !== 'superadmin') {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const session_id = searchParams.get('session_id') || 'default';

    try {
        const res = await fetch(`${WA_URL}/session/status/${session_id}`, {
            headers: { 'x-internal-secret': WA_SECRET },
            signal: AbortSignal.timeout(5000),
        });
        const data = await res.json();
        return NextResponse.json(data);
    } catch {
        return NextResponse.json({ status: 'service_unreachable', phone: null }, { status: 503 });
    }
}
