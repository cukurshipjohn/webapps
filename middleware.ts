import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const ADMIN_ROLES = ['owner', 'superadmin', 'barber'];
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret');

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Hanya jalankan guard pada route /admin/* kecuali /admin/login
    if (!pathname.startsWith('/admin') || pathname === '/admin/login') {
        return NextResponse.next();
    }

    const token = request.cookies.get('token')?.value;

    // Belum punya token → redirect ke login admin
    if (!token) {
        const loginUrl = new URL('/admin/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
    }

    try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        const role = payload.role as string;

        // Role bukan owner/superadmin/barber → redirect ke login admin
        if (!ADMIN_ROLES.includes(role)) {
            const loginUrl = new URL('/admin/login', request.url);
            loginUrl.searchParams.set('error', 'access_denied');
            return NextResponse.redirect(loginUrl);
        }

        return NextResponse.next();
    } catch {
        // Token tidak valid / expired → redirect ke login admin
        const loginUrl = new URL('/admin/login', request.url);
        loginUrl.searchParams.set('error', 'session_expired');
        return NextResponse.redirect(loginUrl);
    }
}

export const config = {
    matcher: ['/admin/:path*'],
};
