import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

// Tipe untuk payload JWT kita
export interface AuthPayload {
    userId: string;
    phone: string;
    role: string;
    tenant_id: string | null;
}

/**
 * Membaca JWT dari header Authorization.
 * Note: karena API route (app/api) berjalan di server, NextRequest tidak punya akses ke localStorage.
 * LocalStorage hanya bisa dibaca oleh Client Components di browser.
 * Karena itu, token harus dikirimkan dari frontend via header 'Authorization: Bearer <token>'.
 */
export function getUserFromToken(request: NextRequest): AuthPayload | null {
    try {
        const authHeader = request.headers.get('authorization');
        let token = '';

        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }

        if (!token) {
            token = request.cookies.get('token')?.value || '';
        }

        if (!token) return null;

        const secret = process.env.JWT_SECRET || 'fallback_secret';
        
        // Memverifikasi token menggunakan jsonwebtoken
        const decoded = jwt.verify(token, secret) as any;

        return {
            userId: decoded.id,
            phone: decoded.phoneNumber,
            role: decoded.role || 'customer',
            tenant_id: decoded.tenant_id || null
        };
    } catch (error) {
        // Token invalid atau expired
        return null;
    }
}

/**
 * Throw error 403 jika role tidak sesuai dengan yang diizinkan.
 * Dapat menerima single string atau array string.
 */
export function requireRole(allowedRoles: string | string[], userRole: string) {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    
    if (!roles.includes(userRole)) {
        throw new Error('403 Forbidden: Anda tidak memiliki akses ke resource ini.');
    }
}
