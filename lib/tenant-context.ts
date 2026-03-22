import type { NextRequest } from 'next/server';
import { supabaseAdmin } from './supabase';

/**
 * Baca tenant_id dari header x-tenant-id yang disuntikkan oleh middleware.
 * Fungsi ini dipanggil di dalam setiap API route untuk mendapat konteks tenant.
 */
export function getTenantFromRequest(request: NextRequest | Request): {
    tenantId: string | null;
    tenantSlug: string | null;
    shopName: string | null;
} {
    const headers = request.headers;
    return {
        tenantId: headers.get('x-tenant-id'),
        tenantSlug: headers.get('x-tenant-slug'),
        shopName: headers.get('x-shop-name'),
    };
}

/**
 * Fetch pengaturan toko (tenant_settings) berdasarkan tenantId.
 */
export async function getTenantSettings(tenantId: string) {
    const { data, error } = await supabaseAdmin
        .from('tenant_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .single();

    if (error) return null;
    return data;
}

/**
 * Cek apakah plan langganan tenant masih aktif.
 */
export async function isTenantPlanActive(tenantId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
        .from('tenants')
        .select('is_active, plan_expires_at')
        .eq('id', tenantId)
        .single();

    if (error || !data) return false;
    if (!data.is_active) return false;
    if (data.plan_expires_at && new Date(data.plan_expires_at) < new Date()) return false;

    return true;
}
