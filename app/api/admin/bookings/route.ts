import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';
import { dateRangeToUTC } from '@/lib/timezone';

export async function GET(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        
        const searchParams = request.nextUrl.searchParams;
        const dateFilter = searchParams.get('date');
        const statusFilter = searchParams.get('status');

        const startDateParam = searchParams.get('start_date');
        const endDateParam = searchParams.get('end_date');

        const tenantId = user.tenant_id;
        if (!tenantId) return NextResponse.json({ message: 'Tenant tidak ditemukan.' }, { status: 403 });

        let query = supabaseAdmin
            .from('bookings')
            .select(`
                id, 
                start_time, 
                end_time, 
                status, 
                service_type, 
                customer_address,
                tenant_id,
                final_price,
                users ( name, phone_number ),
                barbers ( name ),
                services ( name, price )
            `)
            .eq('tenant_id', tenantId)
            .order('start_time', { ascending: false });

        if (statusFilter && statusFilter !== 'all') {
            query = query.eq('status', statusFilter);
        }

        if (startDateParam && endDateParam) {
            // STEP 1: Ambil timezone tenant
            const { data: tenantData } = await supabaseAdmin
                .from('tenants')
                .select('timezone')
                .eq('id', tenantId)
                .single()
            const tz = tenantData?.timezone ?? 'Asia/Jakarta'

            // STEP 2: Konversi tanggal lokal ke UTC berdasarkan timezone tenant
            const { start: fromUTC } = dateRangeToUTC(startDateParam, tz)
            const { end: toUTC }     = dateRangeToUTC(endDateParam, tz)

            query = query
                .gte('start_time', fromUTC)
                .lte('start_time', toUTC)
        } else if (dateFilter) {
            // Fallback backward compatibility
            const { data: tenantData } = await supabaseAdmin
                .from('tenants')
                .select('timezone')
                .eq('id', tenantId)
                .single()
            const tz = tenantData?.timezone ?? 'Asia/Jakarta'

            const { start: fromUTC, end: toUTC } = dateRangeToUTC(dateFilter, tz)
            query = query
                .gte('start_time', fromUTC)
                .lte('start_time', toUTC)
        }

        const { data, error } = await query;
            
        if (error) throw error;
        
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: error.message.includes('403') ? 403 : 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const user = getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        requireRole(['owner', 'superadmin'], user.role);
        
        const body = await request.json();
        const { id, status } = body;
        
        if (!id || !status) {
            return NextResponse.json({ message: 'Booking ID dan status baru diperlukan.' }, { status: 400 });
        }

        if (!['completed', 'cancelled', 'confirmed'].includes(status)) {
            return NextResponse.json({ message: 'Status tidak valid.' }, { status: 400 });
        }
        
        

        // Cek data booking lama
        const { data: bookingData, error: findError } = await supabaseAdmin
            .from('bookings')
            .select(`id, start_time, tenant_id, users(name, phone_number)`)
            .eq('id', id)
            .eq('tenant_id', user.tenant_id!)
            .single();
            
        if (findError || !bookingData) {
            return NextResponse.json({ message: 'Data booking tidak ditemukan atau bukan milik Anda' }, { status: 404 });
        }
        
        // Update database
        const { error: updateError } = await supabaseAdmin
            .from('bookings')
            .update({ status })
            .eq('id', id)
            .eq('tenant_id', user.tenant_id!);
            
        if (updateError) throw updateError;

        // SIDE EFFECT: WA Notification for Cancelled
        if (status === 'cancelled') {
            const customerPhone = (bookingData.users as any)?.phone_number;
            const customerName = (bookingData.users as any)?.name || 'Pelanggan';
            const bookingDate = new Date(bookingData.start_time).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
            
            if (customerPhone) {
                const message = `Halo ${customerName},\n\nMohon maaf, jadwal booking Anda pada *${bookingDate}* telah dibatalkan oleh pihak Barbershop. Silakan hubungi kami untuk informasi lebih lanjut atau jadwalkan ulang.\n\nTerima kasih.`;
                
                let waServiceUrl = process.env.WHATSAPP_SERVICE_URL;
                const waSecret = process.env.WHATSAPP_SERVICE_SECRET;
                
                if (waServiceUrl) {
                    if (!waServiceUrl.startsWith('http')) waServiceUrl = `https://${waServiceUrl}`;
                    
                    // Ambil wa_session_id
                    const { data: tenantSettings } = await supabaseAdmin
                        .from('tenant_settings')
                        .select('wa_session_id')
                        .eq('tenant_id', bookingData.tenant_id)
                        .single();

                    // Execute without awaiting to avoid blocking the API response
                    fetch(`${waServiceUrl}/send-message`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-internal-secret': waSecret || '' },
                        body: JSON.stringify({ 
                            session_id: tenantSettings?.wa_session_id || null, 
                            phoneNumber: customerPhone, 
                            message 
                        })
                    }).catch(err => console.error("Gagal mengirim WA ke kustomer pembatalan:", err));
                }
            }
        }
        
        return NextResponse.json({ message: `Status berhasil diubah menjadi ${status}` });
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
