import { NextRequest, NextResponse } from 'next/server';
import { createTenantClient, supabaseAdmin } from '@/lib/supabase';
import { getUserFromToken, requireRole } from '@/lib/auth';

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

        const tenantClient = createTenantClient(user.tenant_id!);

        let query = tenantClient
            .from('bookings')
            .select(`
                id, 
                start_time, 
                end_time, 
                status, 
                service_type, 
                customer_address,
                tenant_id,
                users ( name, phone_number ),
                barbers ( name ),
                services ( name, price )
            `)
            .order('start_time', { ascending: false });

        if (statusFilter && statusFilter !== 'all') {
            query = query.eq('status', statusFilter);
        }

        if (startDateParam && endDateParam) {
            // Gunakan rentang tanggal dari request
            // startDateParam biasanya "YYYY-MM-DD", kita set jam 00:00:00
            const startDate = new Date(startDateParam);
            startDate.setHours(0, 0, 0, 0);
            
            // endDateParam mungkin sama dengan startDate ("hari ini")
            const endDate = new Date(endDateParam);
            endDate.setHours(23, 59, 59, 999);

            query = query.gte('start_time', startDate.toISOString())
                         .lte('start_time', endDate.toISOString());
        } else if (dateFilter) {
            // Fallback backward compatibility buat jaga-jaga kalau masih ada kode lama yg nembak `?date=`
            const startDate = new Date(dateFilter);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(dateFilter);
            endDate.setHours(23, 59, 59, 999);
            query = query.gte('start_time', startDate.toISOString())
                         .lte('start_time', endDate.toISOString());
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
        
        const tenantClient = createTenantClient(user.tenant_id!);

        // Cek dan dapatkan data booking lama
        const { data: bookingData, error: findError } = await tenantClient
            .from('bookings')
            .select(`
                id, start_time, tenant_id,
                users ( name, phone_number )
            `)
            .eq('id', id)
            .single();
            
        if (findError || !bookingData) {
            return NextResponse.json({ message: 'Data booking tidak ditemukan atau bukan milik Anda' }, { status: 404 });
        }
        
        // Update database
        const { error: updateError } = await tenantClient
            .from('bookings')
            .update({ status })
            .eq('id', id);
            
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
