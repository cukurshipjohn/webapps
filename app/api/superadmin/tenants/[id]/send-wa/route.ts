import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Sesuaikan dengan CHECK constraint di DB (case_type di superadmin_followups)
const VALID_CASE_TYPES = [
    'renewal_reminder',
    'usage_coaching',
    'churn_prevention',
    'reactivation_offer',
    'upgrade_offer',
    'general'
] as const;

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const user = getUserFromToken(request);
    if (!user || user.role !== 'superadmin') {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    try {
        const { id } = await context.params;
        if (!id) return NextResponse.json({ message: 'ID required' }, { status: 400 });

        const body = await request.json();
        const { case_type, custom_note } = body;

        if (!case_type || !VALID_CASE_TYPES.includes(case_type)) {
            return NextResponse.json({ message: `case_type tidak valid. Gunakan: ${VALID_CASE_TYPES.join(', ')}` }, { status: 400 });
        }
        if (case_type === 'general' && !custom_note) {
            return NextResponse.json({ message: 'custom_note wajib ada untuk tipe general' }, { status: 400 });
        }

        // LANGKAH 1 — Ambil data tenant + owner phone
        const { data: tenant, error: tenantErr } = await supabaseAdmin
            .from('tenants')
            .select('*, users!owner_user_id(phone_number, id)')
            .eq('id', id)
            .single();

        if (tenantErr || !tenant) {
            return NextResponse.json({ message: 'Tenant tidak ditemukan' }, { status: 404 });
        }

        const ownerPhone = (tenant.users as any)?.phone_number;
        if (!ownerPhone) {
            return NextResponse.json({ message: 'Owner tidak memiliki nomor telepon' }, { status: 400 });
        }

        // LANGKAH 2 — Buat pesan berdasarkan case_type
        let pesanTemplate = '';
        const shopName = tenant.shop_name || 'Kakak';

        if (case_type === 'renewal_reminder') {
            let daysUntilExpiry = 0;
            if (tenant.plan_expires_at) {
                daysUntilExpiry = Math.ceil((new Date(tenant.plan_expires_at).getTime() - Date.now()) / 86400000);
            }
            pesanTemplate = `Halo kak ${shopName} 👋\nLangganan CukurShip Anda akan berakhir dalam ${daysUntilExpiry} hari.\nPerpanjang sekarang agar toko tetap aktif:\nhttps://cukurship.id/admin/billing\nButuh bantuan? Balas pesan ini 😊`;
        } else if (case_type === 'usage_coaching') {
            pesanTemplate = `Halo kak ${shopName} 👋\nKami perhatikan aktivitas toko Anda belum maksimal.\nAda yang bisa kami bantu? Kami siap mendampingi setup CukurShip.\nBalas pesan ini atau hubungi support kami 🙏`;
        } else if (case_type === 'churn_prevention') {
            pesanTemplate = `Halo kak ${shopName} 👋\nKami lihat langganan Anda akan segera berakhir. Yuk, kami bantu 😊\nAda yang bisa kami perbaiki? Balas pesan ini untuk info lebih lanjut.`;
        } else if (case_type === 'reactivation_offer') {
            pesanTemplate = `Halo kak ${shopName} 👋\nKami rindu! Langganan Anda sudah berakhir.\nAda penawaran khusus reaktivasi untuk Anda hari ini.\nBalas pesan ini untuk info lebih lanjut.`;
        } else if (case_type === 'upgrade_offer') {
            pesanTemplate = `Halo kak ${shopName} 👋\nAnda bisa upgrade ke paket lebih tinggi dan dapatkan fitur tambahan.\nCek pilihan paket di: https://cukurship.id/admin/billing\nAda pertanyaan? Balas pesan ini 😊`;
        } else if (case_type === 'general') {
            pesanTemplate = custom_note;
        }

        let messageSent = false;
        let waErrorMsg = null;

        // LANGKAH 3 — Kirim ke WA gateway
        const waUrl = process.env.WHATSAPP_SERVICE_URL;
        const waSecret = process.env.WHATSAPP_SERVICE_SECRET;

        if (waUrl && waSecret) {
            try {
                const baseUrl = waUrl.startsWith('http') ? waUrl : `https://${waUrl}`;
                const waResponse = await fetch(`${baseUrl}/send-message`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${waSecret}`
                    },
                    body: JSON.stringify({ phone: ownerPhone, message: pesanTemplate })
                });

                if (waResponse.ok) {
                    messageSent = true;
                } else {
                    waErrorMsg = `WA Gateway API returned ${waResponse.status}`;
                }
            } catch (err: any) {
                console.error('[Send-WA] Exception:', err);
                waErrorMsg = err.message || 'Fatal error contacting WA Gateway';
            }
        } else {
            waErrorMsg = 'WA env vars missing';
        }

        // LANGKAH 4 — Catat otomatis ke superadmin_followups
        // Kolom aktual: message_sent (bukan note), channel hanya whatsapp/phone_call/internal_note
        const { data: followup, error: insertErr } = await supabaseAdmin
            .from('superadmin_followups')
            .insert({
                tenant_id: id,
                admin_id: user.userId,
                case_type,
                channel: 'whatsapp',
                message_sent: pesanTemplate,   // gunakan kolom yang benar
                outcome: 'pending'
            })
            .select('id')
            .single();

        if (insertErr) {
            console.error('[Send-WA] Error:', insertErr);
            throw insertErr;
        }

        // LANGKAH 5 — Return response
        if (!messageSent) {
            return NextResponse.json({
                success: true,
                message_sent: false,
                followup_id: followup.id,
                wa_error: waErrorMsg
            }, { status: 200 });
        }

        return NextResponse.json({
            success: true,
            message_sent: true,
            followup_id: followup.id
        }, { status: 200 });

    } catch (err: any) {
        console.error('[Send-WA] Error:', err);
        return NextResponse.json({ message: err.message || 'Internal Server Error' }, { status: 500 });
    }
}
