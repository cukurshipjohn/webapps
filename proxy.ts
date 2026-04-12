import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Subdomain yang dikecualikan dari tenant check
const EXCLUDED_SUBDOMAINS = new Set(['www', 'app', 'api', 'mail', 'smtp', 'pos', 'affiliate', 'admin']);

// Root domain kita — baca dari env agar mudah ganti domain (strip protokol jika ada)
const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_APP_DOMAIN || 'cukurship.id').replace(/^https?:\/\//, "");

/**
 * Ambil slug tenant dari hostname request.
 */
function extractTenantSlug(request: NextRequest): string | null {
    const hostname = request.headers.get('host') || '';

    // localhost / development / LAN IP: baca query param ?tenant=slug sebagai fallback
    const isLocal = hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.startsWith('192.168.') || hostname.startsWith('10.');
    if (isLocal) {
        const tenantParam = request.nextUrl.searchParams.get('tenant');
        return tenantParam || null;
    }

    // Production: extract subdomain dari hostname
    if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
        const slug = hostname.replace(`.${ROOT_DOMAIN}`, '');
        if (EXCLUDED_SUBDOMAINS.has(slug)) return null;
        return slug;
    }

    return null;
}

/**
 * Query Supabase via REST API
 */
async function getTenantBySlug(slug: string) {
    const encodedSlug = encodeURIComponent(slug);
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/tenants?or=(effective_slug.eq.${encodedSlug},slug.eq.${encodedSlug})&select=id,slug,effective_slug,custom_slug,shop_name,is_active,plan_expires_at&limit=1`,
        {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            // Edge Runtime fetch, no-store agar selalu fresh
            cache: 'no-store',
        }
    );

    if (!res.ok) return null;
    const data = await res.json();
    return data?.[0] ?? null;
}

export async function proxy(request: NextRequest) {
    const url = request.nextUrl.clone();
    const hostname = request.headers.get('host') || '';
    const { pathname } = request.nextUrl;
    
    // ─── 1. STATIC SUBDOMAIN REWRITES ──────────────────────────────────────────
    const isLocal = hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.startsWith('192.168.') || hostname.startsWith('10.');
    const isPosOrigin = hostname === `pos.${ROOT_DOMAIN}` || (isLocal && hostname.startsWith('pos.localhost'));
    const isAffiliateOrigin = hostname === `affiliate.${ROOT_DOMAIN}` || (isLocal && hostname.startsWith('affiliate.localhost'));
    const isAdminOrigin = hostname === `admin.${ROOT_DOMAIN}` || (isLocal && hostname.startsWith('admin.localhost'));

    if (isPosOrigin && !pathname.startsWith('/pos')) {
      url.pathname = `/pos${pathname === '/' ? '' : pathname}`;
      return NextResponse.rewrite(url);
    }
    
    if (isAffiliateOrigin && !pathname.startsWith('/affiliate')) {
      url.pathname = `/affiliate${pathname === '/' ? '' : pathname}`;
      return NextResponse.rewrite(url);
    }
    
    if (isAdminOrigin && !pathname.startsWith('/admin')) {
      url.pathname = `/admin${pathname === '/' ? '' : pathname}`;
      return NextResponse.rewrite(url);
    }

    // ─── 2. ADMIN & SUPERADMIN AUTH ─────────────────────────────────────────
    const isAdminRoute = pathname.startsWith('/admin');
    const isSuperAdminRoute = pathname.startsWith('/superadmin');
    const isPublicAdminPage = pathname === '/admin/login' || pathname === '/admin/register' || pathname === '/superadmin/login';

    if ((isAdminRoute || isSuperAdminRoute) && !isPublicAdminPage) {
        let token = request.cookies.get('token')?.value;

        if (!token) {
            const authHeader = request.headers.get('authorization');
            if (authHeader?.startsWith('Bearer ')) {
                token = authHeader.split(' ')[1];
            }
        }

        if (!token) {
            return NextResponse.redirect(new URL('/admin/login', request.url));
        }

        try {
            const payloadBase64 = token.split('.')[1];
            if (!payloadBase64) throw new Error('Format token tidak valid');
            let base64Standard = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
            
            while (base64Standard.length % 4) {
                base64Standard += '=';
            }
            
            const payload = JSON.parse(atob(base64Standard));
            const userRole = payload.role || 'customer';

            if (isSuperAdminRoute && userRole !== 'superadmin') {
                return NextResponse.redirect(new URL('/admin/login', request.url));
            }

            if (isAdminRoute && !['owner', 'superadmin'].includes(userRole)) {
                return NextResponse.redirect(new URL('/admin/login', request.url));
            }

            return NextResponse.next();
        } catch {
            return NextResponse.redirect(new URL('/admin/login', request.url));
        }
    }

    // ─── 3. SUBDOMAIN TENANT ROUTING ────────────────────────────────────────
    const isApiRoute = pathname.startsWith('/api');
    const isStaticFile = pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.startsWith('/public');
    const isErrorPage = pathname === '/shop-not-found' || pathname === '/subscription-expired' || pathname === '/404-shop' || pathname === '/suspended-shop';
    const isPosRoute = pathname.startsWith('/pos');

    if (isAdminRoute || isSuperAdminRoute || isPosRoute || isStaticFile || isErrorPage) {
        return NextResponse.next();
    }

    const isAuthApiRoute = pathname.startsWith('/api/auth');
    if (isAuthApiRoute) {
        return NextResponse.next();
    }

    if (isApiRoute) {
        const slugForApi = extractTenantSlug(request);
        if (slugForApi) {
            const apiHeaders = new Headers(request.headers);
            apiHeaders.set('x-tenant-slug', slugForApi);
            return NextResponse.next({ request: { headers: apiHeaders } });
        }
        return NextResponse.next();
    }

    const tenantSlug = extractTenantSlug(request);

    if (!tenantSlug) {
        return NextResponse.next();
    }

    try {
        const tenant = await getTenantBySlug(tenantSlug);

        if (!tenant) {
            return NextResponse.redirect(new URL('/shop-not-found', request.url));
        }

        const isExpired = tenant.plan_expires_at && new Date(tenant.plan_expires_at) < new Date();
        if (!tenant.is_active || isExpired) {
            return NextResponse.redirect(new URL('/subscription-expired', request.url));
        }

        const requestHeaders = new Headers(request.headers);
        requestHeaders.set('x-tenant-id', tenant.id);
        requestHeaders.set('x-tenant-slug', tenant.slug);
        requestHeaders.set('x-shop-name', tenant.shop_name);

        if (pathname === '/' || pathname === '') {
            return NextResponse.redirect(new URL('/dashboard', request.url));
        }

        return NextResponse.next({
            request: { headers: requestHeaders },
        });
    } catch (err) {
        console.error('[Proxy] Tenant lookup error:', err);
        return NextResponse.next();
    }
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
