-- ============================================================
-- Migration: tenant_health_tracking
-- CukurShip SaaS Multi-Tenant Barbershop
-- Date: 2026-04-01
-- Author: CukurShip Engineering Team
--
-- Deskripsi:
--   Menambahkan 3 tabel baru untuk sistem pemantauan kesehatan tenant,
--   pencatatan alasan churn, serta log follow-up superadmin (mini-CRM).
--
-- Dependensi (tabel yang sudah harus ada):
--   - public.tenants  (id UUID PK)
--   - public.users    (id UUID PK, role: 'customer'|'owner'|'superadmin')
--
-- Tabel BARU yang dibuat di migration ini:
--   1. tenant_activity_events   → Log event aktivitas tenant
--   2. churn_surveys            → Alasan tenant berhenti berlangganan
--   3. superadmin_followups     → Log CRM follow-up superadmin ke tenant
-- ============================================================


-- ============================================================
-- TABEL 1: tenant_activity_events
-- Tujuan: Mencatat setiap event aktivitas penting dari tenant.
--         Digunakan sebagai sumber data untuk kalkulasi "Health Score" tenant.
--         Event dicatat oleh backend saat action tertentu terjadi
--         (owner login, booking masuk, barber ditambah, dll).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tenant_activity_events (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    -- Tipe event yang valid. Tambahkan nilai baru seiring kebutuhan fitur.
    -- 'owner_login'       : Pemilik toko berhasil login ke admin panel
    -- 'booking_created'   : Booking baru masuk dari pelanggan
    -- 'barber_added'      : Barber baru ditambahkan ke toko
    -- 'service_updated'   : Daftar layanan diubah/ditambah
    -- 'profile_updated'   : Profil / pengaturan toko diperbarui
    -- 'wa_blast_sent'     : Blast WhatsApp dikirim ke pelanggan
    -- 'custom_domain_set' : Custom domain/subdomain dikonfigurasi
    event_type      TEXT        NOT NULL CHECK (
                                    event_type IN (
                                        'owner_login',
                                        'booking_created',
                                        'barber_added',
                                        'service_updated',
                                        'profile_updated',
                                        'wa_blast_sent',
                                        'custom_domain_set'
                                    )
                                ),

    -- Data kontekstual tambahan (booking_id, barber_id, dsb.)
    -- Contoh: '{"booking_id": "uuid-xxx", "service": "Cukur Klasik"}'
    event_metadata  JSONB       NOT NULL DEFAULT '{}',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index untuk query dashboard per tenant
CREATE INDEX IF NOT EXISTS idx_tenant_activity_tenant_id
    ON public.tenant_activity_events(tenant_id);

-- Index untuk query time-series (grafik aktivitas mingguan/bulanan)
CREATE INDEX IF NOT EXISTS idx_tenant_activity_created_at
    ON public.tenant_activity_events(created_at DESC);

-- Index komposit untuk filter per tenant + tipe event (health score breakdown)
CREATE INDEX IF NOT EXISTS idx_tenant_activity_event_type
    ON public.tenant_activity_events(tenant_id, event_type);


-- ============================================================
-- TABEL 2: churn_surveys
-- Tujuan: Mencatat alasan kenapa tenant berhenti berlangganan.
--         Bisa dicatat oleh superadmin setelah tanya langsung (outbound),
--         atau nanti bisa self-reported oleh tenant via portal.
--         Data ini penting untuk analisis produk dan strategi retensi.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.churn_surveys (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    -- Superadmin yang mencatat survey ini (nullable jika self-reported)
    -- FK ke public.users (role: 'superadmin'), BUKAN ke owner/barber
    recorded_by_admin_id    UUID        REFERENCES public.users(id) ON DELETE SET NULL,

    -- Alasan utama churn (pilih satu yang paling dominan)
    -- 'too_expensive'       : Harga terlalu mahal
    -- 'not_using_features'  : Fitur tidak dipakai / tidak relevan
    -- 'switched_competitor' : Pindah ke kompetitor
    -- 'temporary_close'     : Tutup sementara (bukan churn permanen)
    -- 'technical_issues'    : Masalah teknis yang tidak terselesaikan
    -- 'no_customers'        : Sepi pelanggan, tidak ada ROI
    -- 'other'               : Alasan lain (lihat detail_note)
    reason                  TEXT        NOT NULL CHECK (
                                            reason IN (
                                                'too_expensive',
                                                'not_using_features',
                                                'switched_competitor',
                                                'temporary_close',
                                                'technical_issues',
                                                'no_customers',
                                                'other'
                                            )
                                        ),

    -- Catatan bebas dari superadmin untuk konteks tambahan
    detail_note             TEXT,

    -- Potensi win-back: seberapa besar kemungkinan tenant bisa direaktivasi
    -- 'high'    : Sangat mungkin kembali (misal: temporary_close)
    -- 'medium'  : Ada peluang dengan penawaran/perbaikan tertentu
    -- 'low'     : Kemungkinan kecil (pindah kompetitor, tutup permanen)
    -- 'unknown' : Belum dianalisis
    win_back_potential      TEXT        NOT NULL DEFAULT 'unknown' CHECK (
                                            win_back_potential IN ('high', 'medium', 'low', 'unknown')
                                        ),

    recorded_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Jadwal follow-up reaktivasi berikutnya (nullable, diisi jika win_back_potential != 'low')
    follow_up_scheduled_at  TIMESTAMPTZ
);

-- Index untuk query semua churn records per tenant
CREATE INDEX IF NOT EXISTS idx_churn_surveys_tenant_id
    ON public.churn_surveys(tenant_id);

-- Index untuk analisis trend churn berdasarkan waktu
CREATE INDEX IF NOT EXISTS idx_churn_surveys_recorded_at
    ON public.churn_surveys(recorded_at DESC);

-- Index untuk analisis breakdown alasan churn (product analytics)
CREATE INDEX IF NOT EXISTS idx_churn_surveys_reason
    ON public.churn_surveys(reason);


-- ============================================================
-- TABEL 3: superadmin_followups
-- Tujuan: Log semua aktivitas follow-up yang dilakukan superadmin ke tenant.
--         Berfungsi sebagai mini-CRM untuk memantau:
--         - Tenant yang akan jatuh tempo (renewal_reminder)
--         - Tenant tidak aktif yang perlu di-coaching (usage_coaching)
--         - Upaya mencegah churn (churn_prevention)
--         - Follow-up reaktivasi setelah churn (reactivation_offer)
--         - Penawaran upgrade plan (upgrade_offer)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.superadmin_followups (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    -- Superadmin yang melakukan follow-up (nullable jika dicatat sistem otomatis)
    admin_id        UUID        REFERENCES public.users(id) ON DELETE SET NULL,

    -- Tipe kasus follow-up
    -- 'renewal_reminder'    : Mengingatkan perpanjangan langganan
    -- 'usage_coaching'      : Membantu tenant menggunakan fitur yang belum dipakai
    -- 'churn_prevention'    : Intervensi aktif untuk mencegah churn
    -- 'reactivation_offer'  : Penawaran untuk reaktivasi tenant yang sudah churn
    -- 'upgrade_offer'       : Tawaran upgrade ke plan yang lebih tinggi
    -- 'general'             : Komunikasi umum (tidak masuk kategori di atas)
    case_type       TEXT        NOT NULL CHECK (
                                    case_type IN (
                                        'renewal_reminder',
                                        'usage_coaching',
                                        'churn_prevention',
                                        'reactivation_offer',
                                        'upgrade_offer',
                                        'general'
                                    )
                                ),

    -- Channel komunikasi yang digunakan
    -- 'whatsapp'      : Pesan via WA (paling umum)
    -- 'phone_call'    : Telepon langsung
    -- 'internal_note' : Catatan internal tanpa komunikasi ke tenant
    channel         TEXT        NOT NULL DEFAULT 'whatsapp' CHECK (
                                    channel IN ('whatsapp', 'phone_call', 'internal_note')
                                ),

    -- Isi pesan/script yang dikirimkan (jika via WA atau phone_call)
    -- Kosongkan jika channel = 'internal_note' dan hanya ingin mencatat outcome
    message_sent    TEXT,

    -- Hasil dari follow-up ini
    -- 'pending'             : Baru dijadwalkan / dikirim, belum ada respons
    -- 'no_response'         : Tidak ada balasan setelah follow-up
    -- 'interested'          : Tenant tertarik, dalam proses diskusi
    -- 'renewed'             : Berhasil memperpanjang langganan
    -- 'upgraded'            : Berhasil upgrade ke plan yang lebih tinggi
    -- 'churned_confirmed'   : Tenant konfirmasi tidak akan lanjut
    -- 'not_applicable'      : Follow-up di-cancel / tidak relevan lagi
    outcome         TEXT        NOT NULL DEFAULT 'pending' CHECK (
                                    outcome IN (
                                        'pending',
                                        'no_response',
                                        'interested',
                                        'renewed',
                                        'upgraded',
                                        'churned_confirmed',
                                        'not_applicable'
                                    )
                                ),

    -- Waktu follow-up dijadwalkan (untuk antrian follow-up masa depan, nullable)
    scheduled_at    TIMESTAMPTZ,

    -- Waktu follow-up selesai dieksekusi (nullable, diisi saat outcome != 'pending')
    done_at         TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index untuk query semua follow-up history per tenant
CREATE INDEX IF NOT EXISTS idx_followups_tenant_id
    ON public.superadmin_followups(tenant_id);

-- Index untuk sorting follow-up terbaru (dashboard superadmin)
CREATE INDEX IF NOT EXISTS idx_followups_created_at
    ON public.superadmin_followups(created_at DESC);

-- Index komposit untuk filter berdasarkan tipe kasus + status outcome
CREATE INDEX IF NOT EXISTS idx_followups_case_type
    ON public.superadmin_followups(case_type, outcome);

-- Index parsial: hanya follow-up yang memiliki jadwal (untuk scheduler / reminder queue)
CREATE INDEX IF NOT EXISTS idx_followups_scheduled_at
    ON public.superadmin_followups(scheduled_at)
    WHERE scheduled_at IS NOT NULL;


-- Migration: tenant_health_tracking v1.0 | CukurShip 2026
