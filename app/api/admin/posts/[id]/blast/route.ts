import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';

const INTERNAL_SECRET = process.env.WHATSAPP_SERVICE_SECRET || 'change_this_secret';
const WHATSAPP_SERVICE_URL = process.env.WHATSAPP_SERVICE_URL || 'http://127.0.0.1:3001';
const BLAST_ALLOWED_PLANS = ['pro', 'business'];
const BATCH_DELAY_MS = 100;  // 10 msg/detik
const BACKGROUND_THRESHOLD = 100;

// ── Helpers ──────────────────────────────────────────────
function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function buildMessage(post: any, shopName: string, shopUrl: string): string {
    const expiresStr = post.expires_at
        ? new Date(post.expires_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
        : null;

    if (post.type === 'promo') {
        return (
            `📢 *Promo Spesial dari ${shopName}!*\n\n` +
            `*${post.title}*\n${post.body}` +
            (post.promo_code ? `\n\n🏷️ Kode Promo: *${post.promo_code}*` : '') +
            (post.promo_discount_percent ? `\nDiskon ${post.promo_discount_percent}%` : '') +
            (expiresStr ? `\n\nBerlaku hingga: ${expiresStr}` : '') +
            `\n\nBooking sekarang: ${shopUrl}/book`
        );
    }

    return (
        `📣 *${shopName}* punya pengumuman baru:\n\n` +
        `*${post.title}*\n${post.body}` +
        `\n\nSelengkapnya: ${shopUrl}/posts/${post.id}`
    );
}

async function sendWAMessage(phone: string, message: string, sessionId: string): Promise<boolean> {
    try {
        const res = await fetch(`${WHATSAPP_SERVICE_URL}/send-message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-internal-secret': INTERNAL_SECRET,
            },
            body: JSON.stringify({
                phone,
                message,
                session_id: sessionId,
            }),
        });
        return res.ok;
    } catch {
        return false;
    }
}

// ── Background blast processor ────────────────────────────
async function processBlast(params: {
    targets: { id: string; phone_number: string }[];
    post: any;
    shopName: string;
    shopUrl: string;
    sessionId: string;
    tenantId: string;
}) {
    const { targets, post, shopName, shopUrl, sessionId, tenantId } = params;
    const message = buildMessage(post, shopName, shopUrl);

    for (const user of targets) {
        const phone = user.phone_number.replace(/\D/g, '');
        const success = await sendWAMessage(phone, message, sessionId);

        // Insert log — UNIQUE constraint skips duplicates automatically
        await supabaseAdmin.from('notification_logs').insert({
            tenant_id: tenantId,
            post_id: post.id,
            user_id: user.id,
            status: success ? 'sent' : 'failed',
        }).select();  // ignore error (duplicate = skip)

        await sleep(BATCH_DELAY_MS);
    }
}

// ── Route handler ─────────────────────────────────────────
export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);

        // Lookup tenant_id from DB if missing from JWT
        let tenantId = user.tenant_id;
        if (!tenantId) {
            const { data: ud } = await supabaseAdmin.from('users').select('tenant_id').eq('id', user.userId).single();
            tenantId = ud?.tenant_id;
        }
        if (!tenantId) return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 403 });

        // ── Check subscription plan ────────────────────────
        const { data: tenant, error: tenantErr } = await supabaseAdmin
            .from('tenants')
            .select('id, name, subdomain, plan')
            .eq('id', tenantId)
            .single();

        if (tenantErr || !tenant) {
            console.error('Tenant fetch error in blast WA:', tenantErr);
            return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 404 });
        }

        if (!BLAST_ALLOWED_PLANS.includes(tenant.plan || 'starter')) {
            return NextResponse.json({
                message: `Fitur Blast WA hanya tersedia untuk paket Pro dan Business. Upgrade paket Anda.`,
                upgrade_required: true,
                current_plan: tenant.plan || 'starter',
            }, { status: 403 });
        }

        // ── Get & validate post ───────────────────────────
        const { data: post, error: postErr } = await supabaseAdmin
            .from('posts')
            .select('id, type, title, body, promo_code, promo_discount_percent, expires_at, is_published')
            .eq('id', params.id)
            .eq('tenant_id', tenantId)
            .single();

        if (postErr || !post) return NextResponse.json({ message: 'Post tidak ditemukan.' }, { status: 404 });
        if (!post.is_published) {
            return NextResponse.json({ message: 'Tidak bisa blast post yang masih draft. Publish terlebih dahulu.' }, { status: 400 });
        }

        // ── Get WA session ────────────────────────────────
        const { data: settings } = await supabaseAdmin
            .from('tenant_settings')
            .select('wa_session_id')
            .eq('tenant_id', tenantId)
            .single();

        const sessionId = settings?.wa_session_id || 'default';

        // ── Get target users ──────────────────────────────
        // All users tied to this tenant (by tenant_id or via bookings)
        const { data: allUsers } = await supabaseAdmin
            .from('users')
            .select('id, phone_number')
            .eq('tenant_id', tenantId)
            .not('phone_number', 'is', null);

        // Also include users who booked at this tenant (may not have tenant_id set)
        const { data: bookedUsers } = await supabaseAdmin
            .from('bookings')
            .select('users!inner(id, phone_number)')
            .eq('tenant_id', tenantId)
            .not('users.phone_number', 'is', null);

        // Merge & deduplicate
        const userMap = new Map<string, { id: string; phone_number: string }>();
        for (const u of (allUsers || [])) {
            if (u.phone_number) userMap.set(u.id, u);
        }
        for (const row of (bookedUsers || [])) {
            const u = (row as any).users;
            if (u?.id && u?.phone_number) userMap.set(u.id, u);
        }

        // Exclude already-notified users for this exact post
        const { data: alreadySent } = await supabaseAdmin
            .from('notification_logs')
            .select('user_id')
            .eq('post_id', params.id)
            .eq('status', 'sent');

        const sentIds = new Set((alreadySent || []).map(r => r.user_id));
        const targets = Array.from(userMap.values()).filter(u => !sentIds.has(u.id));

        const total_target = targets.length;

        // ── Preview mode ──────────────────────────────────
        const preview = new URL(request.url).searchParams.get('preview') === 'true';
        if (preview) {
            return NextResponse.json({
                total_target,
                already_sent: sentIds.size,
                plan: tenant.plan || 'starter',
                session_id: sessionId,
            });
        }

        if (total_target === 0) {
            return NextResponse.json({
                total_target: 0,
                total_sent: 0,
                message: 'Tidak ada pelanggan baru yang perlu diberitahu.',
            });
        }

        // ── Shop URL ──────────────────────────────────────
        const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || 'johncukurship.online';
        const shopUrl = `https://${tenant.subdomain}.${appDomain}`;
        const shopName = tenant.name;

        // ── Decide sync vs background ─────────────────────
        if (total_target > BACKGROUND_THRESHOLD) {
            // Fire and forget — process in background
            setImmediate(() => {
                processBlast({ targets, post, shopName, shopUrl, sessionId, tenantId }).catch(console.error);
            });

            return NextResponse.json({
                message: `Blast sedang diproses di background. Akan terkirim ke ${total_target} pelanggan.`,
                total_target,
                background: true,
            });
        }

        // ── Synchronous processing (<= 100) ──────────────
        const message = buildMessage(post, shopName, shopUrl);
        let total_sent = 0;
        let total_failed = 0;

        for (const target of targets) {
            const phone = target.phone_number.replace(/\D/g, '');
            const success = await sendWAMessage(phone, message, sessionId);

            // Upsert log (UNIQUE constraint prevents duplicate)
            await supabaseAdmin.from('notification_logs').upsert({
                tenant_id: tenantId,
                post_id: params.id,
                user_id: target.id,
                status: success ? 'sent' : 'failed',
                sent_at: new Date().toISOString(),
            }, { onConflict: 'post_id,user_id', ignoreDuplicates: false });

            if (success) total_sent++; else total_failed++;
            await sleep(BATCH_DELAY_MS);
        }

        return NextResponse.json({
            total_target,
            total_sent,
            total_failed,
            message: `Berhasil dikirim ke ${total_sent} pelanggan.`,
        });

    } catch (error: any) {
        console.error('Blast error:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
