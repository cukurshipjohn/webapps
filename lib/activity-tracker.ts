import { supabaseAdmin } from '@/lib/supabase';

// Tipe event yang valid — harus sesuai dengan CHECK constraint di migration SQL
export type ActivityEventType =
  | 'owner_login'
  | 'booking_created'
  | 'barber_added'
  | 'service_updated'
  | 'profile_updated'
  | 'wa_blast_sent'
  | 'custom_domain_set';

export interface TrackActivityOptions {
  tenantId: string;
  eventType: ActivityEventType;
  metadata?: Record<string, unknown>;
}

/**
 * Mencatat event aktivitas tenant ke tabel `tenant_activity_events`.
 *
 * PENTING: Function ini dirancang sebagai fire-and-forget.
 * - Caller TIDAK perlu await hasilnya untuk flow utama
 * - Jika insert gagal, hanya log console.error — TIDAK throw ke caller
 * - Gunakan pola: trackTenantActivity({...}).catch(() => {})
 *
 * @example
 * // Di dalam API route, setelah login berhasil:
 * trackTenantActivity({
 *   tenantId: user.tenant_id,
 *   eventType: 'owner_login',
 *   metadata: { login_at: new Date().toISOString() }
 * }).catch(() => {}) // silent fail — login tetap sukses
 */
export async function trackTenantActivity(options: TrackActivityOptions): Promise<void> {
  const { tenantId, eventType, metadata = {} } = options;

  try {
    if (!tenantId) {
      console.warn('[ActivityTracker] trackTenantActivity dipanggil tanpa tenantId — dilewati.');
      return;
    }

    const { error } = await supabaseAdmin
      .from('tenant_activity_events')
      .insert({
        tenant_id: tenantId,
        event_type: eventType,
        event_metadata: metadata,
      });

    if (error) {
      // Log error tapi TIDAK throw — agar caller tidak terganggu
      console.error(`[ActivityTracker] Gagal insert event '${eventType}' untuk tenant ${tenantId}:`, error.message);
    }
  } catch (err: any) {
    // Tangkap semua error tak terduga — TIDAK pernah throw ke luar
    console.error('[ActivityTracker] Unexpected error saat tracking activity:', err?.message || err);
  }
}
