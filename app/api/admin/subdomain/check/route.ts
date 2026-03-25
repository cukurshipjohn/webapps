import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { validateSlugFormat, checkSlugAvailability } from '@/lib/slug-validator';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/subdomain/check?slug=<slug>
 *
 * Endpoint publik — bisa dipakai halaman register & panel admin.
 * Jika ada token, tenant_id sendiri dikecualikan dari benturan.
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const slug = (searchParams.get('slug') || '').trim().toLowerCase();

        if (!slug) {
            return NextResponse.json(
                { available: false, error: 'Parameter slug diperlukan.' },
                { status: 400 }
            );
        }

        // Validasi format dulu (cepat, tidak perlu DB)
        const formatCheck = validateSlugFormat(slug);
        if (!formatCheck.valid) {
            return NextResponse.json({
                available: false,
                slug,
                error: formatCheck.error,
            });
        }

        // Jika ada token, exclude tenant sendiri dari pengecekan
        const user = getUserFromToken(request);
        const excludeTenantId = user?.tenant_id ?? undefined;

        // Cek ketersediaan di DB
        const availability = await checkSlugAvailability(slug, excludeTenantId);

        return NextResponse.json({
            available: availability.available,
            slug,
            ...(availability.reason ? { error: availability.reason } : {}),
        });

    } catch (error: any) {
        console.error('[Subdomain Check] Error:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
