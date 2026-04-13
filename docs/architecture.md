# 🛰️ Arsitektur CukurShip — Panduan Komprehensif

> **Versi terakhir diperbarui:** 2026-04-02  
> **Stack:** Next.js 16 (App Router) · Supabase (PostgreSQL + Auth) · TypeScript · Tailwind CSS  
> **Repository:** `github.com/cukurshipjohn/webapps` (branch: `main`)

---

## 1. Gambaran Umum

CukurShip adalah platform SaaS **multi-tenant** untuk barbershop. Setiap barbershop mendapatkan:
- **Subdomain unik** (contoh: `johncukurship.cukurship.id`)
- **Admin Panel** untuk mengelola barber, layanan, booking, dan tampilan toko
- **Portal Pelanggan** (Progressive Web App-like) yang bisa dikustomisasi oleh owner
- **Super Admin** untuk mengelola semua tenant dan billing
- **Portal Affiliator** terpisah untuk mengelola komisi afiliasi independen

```
                      ┌──────────────────────────────────────────────┐
                      │             cukurship.id (root)               │
                      │         Landing / SuperAdmin                 │
                      └──────────────────────────────────────────────┘
                                           │
                    ┌──────────────────────┼───────────────────────┐
                    │                      │                       │
          ┌─────────▼────────┐   ┌─────────▼────────┐  ┌──────────▼────────┐
          │  john.cukurship  │   │  budi.cukurship  │  │ [Portal Affiliator]│
          │      .id         │...│       .id        │  │ cukurship.id/      │
          │  (Tenant John)   │   │  (Tenant Budi)   │  │ affiliate          │
          └─────────┬────────┘   └─────────┬────────┘  │ (Portal terpisah)  │
                    │                      │           └────────────────────┘
        ┌───────────┼───────────┐          │
   /dashboard  /admin   /book   /login    ...
 (Pelanggan) (Owner)  (Booking)
```

---

## 2. Teknologi & File Kunci

| Komponen | File | Keterangan |
|---|---|---|
| **Middleware/Proxy** | `proxy.ts` | Subdomain routing, auth guard, header injection |
| **Supabase Clients** | `lib/supabase.ts` | `supabaseAdmin` (service role) + `supabase` (anon) |
| **Auth Helper** | `lib/auth.ts` | JWT decode, role check (untuk user/admin/superadmin) |
| **Affiliate Helper** | `lib/affiliate.ts` | `generateReferralCode`, `calculateCommission`, `getAffiliateFromToken` |
| **Tenant Context** | `lib/tenant-context.ts` | Baca `x-tenant-id` dari header |
| **Billing Plans** | `lib/billing-plans.ts` | Definisi paket berlangganan Bulanan/Tahunan dengan sistem Harga Promo + Normal. Helper: Trial/Starter/Pro/Business + fungsi getPlanPrice(), isInPromo(), promoMonthsRemaining() (Diperbarui 2026-04-02) |
| **Root Layout** | `app/layout.tsx` | `generateMetadata` dinamis + CSS vars injection |
| **Cron Config** | `vercel.json` | Scheduled jobs (update status affiliate commission mingguan) |
| Activity Tracker | `lib/activity-tracker.ts` | Utility fire-and-forget untuk catat event aktivitas tenant ke tabel tenant_activity_events |
| Tenant Health | `lib/tenant-health.ts` | Kalkulasi health score (0–100) dan pipeline stage per tenant |

---

## 3. Middleware — `proxy.ts`

Dijalankan pada **setiap request** sebelum halaman/API dirender. Ada 2 alur utama:

### Branch 1: Admin & Superadmin Auth Guard

```
Request ke /admin/** atau /superadmin/**
    │
    ├─ Halaman public? (/admin/login, /superadmin/login)
    │      → NextResponse.next() (lolos tanpa cek)
    │
    └─ Bukan public
           │
           ├─ Baca token dari: cookies['token'] → Authorization header
           │
           ├─ Tidak ada token?
           │      → redirect ke /admin/login
           │
           ├─ Decode JWT payload (base64, tanpa verifikasi signature)
           │
           ├─ Role = customer → redirect /admin/login?error=access_denied
           ├─ Route /superadmin + role != superadmin → redirect /admin/login
           └─ Lolos → NextResponse.next()
```

### Branch 2: Subdomain Tenant Routing

```
Request dari hostname
    │
    ├─ localhost/127.0.0.1?
    │      → Cek query param ?tenant=<slug> (untuk development tanpa subdomain)
    │
    ├─ Production (*.cukurship.id)?
    │      → Extract slug dari subdomain
    │
    └─ Ada slug?
           │
           ├─ Query Supabase via REST API → cari tenant berdasarkan slug atau custom_slug
           │
           ├─ Tenant tidak ditemukan → redirect /shop-not-found
           │
           ├─ is_active=false atau plan_expires_at sudah lewat?
           │      → redirect /subscription-expired
           │
           ├─ Tenant valid → inject headers ke request:
           │      x-tenant-id   = tenant.id (UUID)
           │      x-tenant-slug = tenant.slug
           │      x-tenant-effective-slug = tenant.effective_slug
           │      x-shop-name   = tenant.shop_name
           │
           └─ pathname='/' → redirect ke /dashboard (portal pelanggan)
```

> **Catatan Penting:** 
> Route `/affiliate/**` **TIDAK** di-guard oleh proxy (hanya `/admin` atau `/superadmin` yang diguard).
> Autentikasi portal affiliate ditangani penuh secara murni di level **API routes** (Backend) dan **Client-side layout** (Frontend).

---

## 4. Sistem Autentikasi

### 4.1 Alur Login Affiliate (Terpisah)

Selain alur login *Customer* & *Tenant Owner*, modul Afiliasi memiliki skema token khusus:

```
Affiliate Login:
POST /api/auth/request-otp { isAffiliateLogin: true }
→ Cek phone di tabel `affiliates` (BUKAN tabel `users`)
→ Cek status afiliator:
   - 'pending'   → 403 "Akun menunggu persetujuan admin"
   - 'suspended' → 403 "Akun dinonaktifkan"
   - 'active'    → Generate OTP, simpan ke `otp_sessions`, kirim WhatsApp.

POST /api/auth/verify-otp { isAffiliateLogin: true }
→ Cek `otp_sessions` sesuai alur utama
→ Tandai OTP used=true
→ Lookup di tabel `affiliates` WHERE phone = phone
→ Generate JWT token KHUSUS (Berlaku 24 jam)
→ Set cookie HttpOnly `'affiliate_token'` (BUKAN `'token'`)
→ Return { token, affiliate: { id, name, phone, tier, referral_code } }
→ Client menyimpannya di: localStorage.setItem('affiliate_token', data.token)
```

### 4.2 Struktur JWT Payload Khusus Affiliate

JWT untuk affiliator secara arsitektural diinkapsulasi menggunakan struktur klaim profil yang spesifik:

```json
// JWT Affiliate (BERBEDA dari JWT user biasa)
{
  "affiliate_id": "uuid-affiliate",  // field khusus, BUKAN 'id'
  "phone": "+6281234567890",
  "name": "Budi Santoso",
  "tier": "referral",                // 'referral' | 'reseller'
  "role": "affiliate",               // WAJIB ADA untuk identifikasi gatekeeping
  "iat": 1234567890,
  "exp": 1234654290
}
```

### 4.3 Pengecekan Token di API (`lib/affiliate.ts`)

```typescript
// /lib/affiliate.ts
export function getAffiliateFromToken(request: NextRequest) {
  // → Baca dari header `Authorization: Bearer <token>` (prioritas 1)
  // → Fallback ke `cookies['affiliate_token']` (prioritas 2)
  // → jwt.verify() dengan JWT_SECRET (BUKAN HANYA decode manual!)
  // → Cek payload.role === 'affiliate' (jika bukan, langsung return null)
  // → Return payload bersih { affiliateId, phone, name, tier } atau null
}
```

### 4.4 Resolusi Role System CukurShip

| Role | Storage Token | Akses |
|---|---|---|
| `customer` | `localStorage.token` | Portal pelanggan tenant |
| `owner` | `localStorage.token` | Admin Panel (`/admin/**`) |
| `superadmin` | `localStorage.superadmin_token` | Semua + (`/superadmin/**`) |
| `affiliate` | `localStorage.affiliate_token` | Portal Affiliate (`/affiliate/**`) |

> ⚠️ **CATATAN KRITIS:** Role `'barber'` **TIDAK ADA** di sistem Autentikasi manapun. Barber merupakan entitas terpisah di tabel database `barbers`, *bukan user yang bisa login*.

### 4.5 Token Storage Summary Map

| Token | Cookie Name | `localStorage` Key | Dipakai Oleh (Client-side) |
|---|---|---|---|
| **User/Admin** | `token` (httpOnly) | `token` | `customer`, `owner` di layout utamanya. |
| **Superadmin** | *(tidak ada cookie)* | `superadmin_token` | **Superadmin** layout |
| **Affiliate** | `affiliate_token` (httpOnly) | `affiliate_token` | Dashboard layout affiliator |

---

## 5. Database — Tabel Utama

> Semua Database dihosting di Supabase (*PostgreSQL*). Row Level Security (RLS) diabaikan penuh untuk seluruh skrip Backend. Kita menggunakan `supabaseAdmin` di Server beserta filter ID eksplisit (`tenant_id` atau `affiliate_id`).

### Ekstensi Tabel Eksisting

```sql
tenants
  ...kolom lama...
  referred_by_code → TEXT (Kaitan dengan kode referral affiliator, nullable)

subscription_transactions
  ...kolom lama...
  amount           INT NOT NULL        -- harga AKTUAL yang dibayar (bisa promo)
  original_amount  INT                 -- harga normal sebelum diskon, nullable
  discount_percent INT DEFAULT 0       -- persentase diskon promo (0 jika tidak ada promo)

  ATURAN BILLING BARU (2026-04-02):
  - 'amount' = harga yang benar-benar ditagihkan ke tenant (bisa promo)
  - 'original_amount' = harga normal plan (referensi untuk komisi historis)
  - 'discount_percent' = dihitung otomatis saat checkout: Math.round((1 - amount/original_amount) * 100)
  - Komisi afiliasi selalu dihitung dari 'amount' (harga yang benar-benar dibayar)

users
  ...kolom lama...
  role → 'customer' | 'owner' | 'superadmin'  (HAPUS 'barber' dari ENUM)
```

### Tabel Tambahan Afiliasi & Komisi

```sql
affiliates (Identitas Agen Afiliator)
  id (UUID PK)
  user_id             → FK ke users.id ON DELETE SET NULL (nullable)
  name                → TEXT NOT NULL
  phone               → TEXT NOT NULL UNIQUE
  email               → TEXT (nullable)
  referral_code       → TEXT NOT NULL UNIQUE (format strict: "REF-XXXXXX-XXXX")
  tier                → 'referral' | 'reseller'
  commission_rate     → NUMERIC(5,2) DEFAULT 10.00 (referral=10%, reseller=20%)
  commission_type     → 'one-time' | 'recurring'
                        one-time: komisi SATU KALI HANYA DARI SEWA PERTAMA TENANT.
                        recurring: komisi SETIAP KALI TENANT MEMBAYAR (Selamanya).
  status              → 'pending' | 'active' | 'suspended'
                        referral → langsung 'active' tanpa disaring.
                        reseller → mulai 'pending', butuh disetujui Superadmin.
  bank_name           → TEXT (nullable)
  bank_account_number → TEXT (nullable)
  bank_account_name   → TEXT (nullable)
  total_clicks        → INT DEFAULT 0
  total_referrals     → INT DEFAULT 0
  total_paid_referrals→ INT DEFAULT 0
  created_at          → TIMESTAMPTZ DEFAULT NOW()
  approved_at         → TIMESTAMPTZ (nullable)
  updated_at          → TIMESTAMPTZ DEFAULT NOW()

affiliate_clicks (Tabel Log Interaksi Link Afiliator)
  id (UUID PK)
  affiliate_id        → FK ke affiliates.id ON DELETE CASCADE
  referral_code       → TEXT NOT NULL
  ip_address          → TEXT (nullable, didapat dari x-forwarded-for header)
  user_agent          → TEXT (nullable)
  landing_page        → TEXT (nullable)
  utm_source          → TEXT (nullable)
  utm_medium          → TEXT (nullable)
  utm_campaign        → TEXT (nullable)
  converted           → BOOLEAN DEFAULT false
  converted_tenant_id → FK ke tenants.id ON DELETE SET NULL (nullable)
  clicked_at          → TIMESTAMPTZ DEFAULT NOW()

affiliate_referrals (Database Relasi Affiliator vs Tenant)
  id (UUID PK)
  affiliate_id        → FK ke affiliates.id ON DELETE RESTRICT
  tenant_id           → FK ke tenants.id ON DELETE CASCADE
  referral_code       → TEXT NOT NULL
  status              → 'registered' | 'converted' | 'churned'
                        registered: tenant mendaftar tapi belum bayar
                        converted: tenant sukses bayar pertama kali
                        churned: langganan expired > limit toleransi (hilang)
  registered_at       → TIMESTAMPTZ DEFAULT NOW()
  first_paid_at       → TIMESTAMPTZ (nullable)
  UNIQUE(tenant_id)   ← Constraint: SATU TENANT DILARANG DIMILIKI OLEH MULTI AFFILIATOR.

affiliate_commissions (Riwayat Duit Mengalir ke Afiliator)
  id (UUID PK)
  affiliate_id        → FK ke affiliates.id ON DELETE RESTRICT
  referral_id         → FK ke affiliate_referrals.id ON DELETE RESTRICT
  transaction_id      → FK ke subscription_transactions.id ON DELETE SET NULL (nullable)
  tenant_id           → FK ke tenants.id ON DELETE CASCADE
  amount              → NUMERIC(12,2) NOT NULL (hasil kalkulasi Math.floor)
  commission_rate     → NUMERIC(5,2) NOT NULL (snapshot angka rate saat komisi dicetak)
  transaction_amount  → INT NOT NULL (jumlah kotor yang dibayar oleh tenant)
  type                → 'subscription' | 'upgrade'
  status              → 'pending' | 'available' | 'processing' | 'paid' | 'cancelled'
                        pending    : dana belum matang, ditahan 7 hari.
                        available  : sudah 7 hari ke atas, bisa ditarik affiliator.
                        processing : affiliator sudah klik tarik, menunggu admin transfer.
                        paid       : transfer sudah disetujui & dikirim oleh superadmin.
                        cancelled  : invoice dibatalkan.
  available_at        → TIMESTAMPTZ (Nilainya NOW() + 7 hari penahanan)
  paid_at             → TIMESTAMPTZ (nullable)
  created_at          → TIMESTAMPTZ DEFAULT NOW()
  notes               → TEXT (nullable)

affiliate_withdrawals (Permintaan Uang Tunai / Pencairan)
  id (UUID PK)
  affiliate_id        → FK ke affiliates.id ON DELETE RESTRICT
  amount              → NUMERIC(12,2) NOT NULL
  status              → 'requested' | 'processing' | 'paid' | 'rejected'
  bank_name           → TEXT NOT NULL
  bank_account_number → TEXT NOT NULL
  bank_account_name   → TEXT NOT NULL
  admin_notes         → TEXT (nullable)
  transfer_proof_url  → TEXT (nullable)
  requested_at        → TIMESTAMPTZ DEFAULT NOW()
  processed_at        → TIMESTAMPTZ (nullable)
  commission_ids      → UUID[] (Array pencatatan asal usul komisi yang dicairkan)
  CONSTRAINT minimum_withdrawal CHECK (amount >= 50000)

-- TABEL BARU (2026-04-02): Log aktivitas follow-up super admin
superadmin_followups
  id             UUID PK DEFAULT gen_random_uuid()
  tenant_id      FK → tenants.id ON DELETE CASCADE
  admin_id       FK → users.id (superadmin yang melakukan follow-up)
  case_type      TEXT CHECK IN ('renewal','usage_check','churn','upgrade_offer','custom')
  channel        TEXT CHECK IN ('whatsapp','phone','email','internal_note')
  note           TEXT
  outcome        TEXT CHECK IN ('no_response','interested','renewed','churned_confirmed','pending')
                 DEFAULT 'pending'
  scheduled_at   TIMESTAMPTZ     -- nullable, untuk follow-up terjadwal
  done_at        TIMESTAMPTZ     -- nullable, diisi saat outcome diupdate
  created_at     TIMESTAMPTZ DEFAULT NOW()

-- TABEL BARU (2026-04-02): Alasan berhenti berlangganan
churn_surveys
  id             UUID PK DEFAULT gen_random_uuid()
  tenant_id      FK → tenants.id ON DELETE CASCADE
  reason         TEXT CHECK IN ('too_expensive','not_using','switched_competitor',
                               'temporary_close','other')
  detail_note    TEXT            -- nullable, keterangan tambahan
  recorded_by    TEXT CHECK IN ('superadmin','self_reported') DEFAULT 'superadmin'
  recorded_at    TIMESTAMPTZ DEFAULT NOW()

INDEX yang perlu ditambahkan:
  - idx_superadmin_followups_tenant_id ON superadmin_followups(tenant_id)
  - idx_superadmin_followups_case_type ON superadmin_followups(case_type, outcome)
  - idx_churn_surveys_tenant_id ON churn_surveys(tenant_id)
```

### Tabel Tambahan Tenant Health Tracking

```sql
tenant_activity_events  (Log Event Aktivitas Tenant — Sumber Data Health Score)
  id (UUID PK)
  tenant_id           → FK ke tenants.id ON DELETE CASCADE
  event_type          → TEXT NOT NULL CHECK (
                          'owner_login' | 'booking_created' | 'barber_added' |
                          'service_updated' | 'profile_updated' |
                          'wa_blast_sent' | 'custom_domain_set'
                        )
  event_metadata      → JSONB DEFAULT '{}'
  created_at          → TIMESTAMPTZ DEFAULT NOW()

churn_surveys  (Alasan Tenant Berhenti Berlangganan)
  id (UUID PK)
  tenant_id                → FK ke tenants.id ON DELETE CASCADE
  recorded_by_admin_id     → FK ke users.id ON DELETE SET NULL (nullable)
  reason                   → TEXT NOT NULL CHECK (
                               'too_expensive' | 'not_using_features' |
                               'switched_competitor' | 'temporary_close' |
                               'technical_issues' | 'no_customers' | 'other'
                             )
  detail_note              → TEXT (nullable)
  win_back_potential       → TEXT DEFAULT 'unknown' CHECK:
                              'high' | 'medium' | 'low' | 'unknown'
  recorded_at              → TIMESTAMPTZ DEFAULT NOW()
  follow_up_scheduled_at   → TIMESTAMPTZ (nullable)

superadmin_followups  (Mini-CRM Log Follow-Up Superadmin ke Tenant)
  id (UUID PK)
  tenant_id       → FK ke tenants.id ON DELETE CASCADE
  admin_id        → FK ke users.id ON DELETE SET NULL (nullable, NULL jika dicatat sistem/cron)
  case_type       → TEXT NOT NULL CHECK (
                    'renewal_reminder' | 'usage_coaching' | 'churn_prevention' |
                    'reactivation_offer' | 'upgrade_offer' | 'general'
                  )
  channel         → TEXT NOT NULL DEFAULT 'whatsapp' CHECK:
                    'whatsapp' | 'phone_call' | 'internal_note'
  message_sent    → TEXT (nullable)
  outcome         → TEXT DEFAULT 'pending' CHECK (
                    'pending' | 'no_response' | 'interested' |
                    'renewed' | 'upgraded' | 'churned_confirmed' | 'not_applicable'
                  )
  scheduled_at    → TIMESTAMPTZ (nullable)
  done_at         → TIMESTAMPTZ (nullable)
  created_at      → TIMESTAMPTZ DEFAULT NOW()
```

**INDEX PENTING (DIAMBIL DARI MIGRATION)**
Dokumentasi ini vital untuk menjaga performansi Query Kueri Dashboard:
- `idx_affiliate_clicks_affiliate_id ON affiliate_clicks(affiliate_id)`
- `idx_affiliate_clicks_clicked_at ON affiliate_clicks(clicked_at DESC)`
- `idx_affiliate_commissions_affiliate_id ON affiliate_commissions(affiliate_id, status)`
- `idx_affiliate_commissions_created_at ON affiliate_commissions(created_at DESC)`
- `idx_affiliate_referrals_affiliate_id ON affiliate_referrals(affiliate_id)`
- `idx_affiliates_referral_code ON affiliates(referral_code)`
- `idx_tenant_activity_tenant_id ON tenant_activity_events(tenant_id)`
- `idx_tenant_activity_created_at ON tenant_activity_events(created_at DESC)`
- `idx_tenant_activity_event_type ON tenant_activity_events(tenant_id, event_type)`
- `idx_churn_surveys_tenant_id ON churn_surveys(tenant_id)`
- `idx_churn_surveys_recorded_at ON churn_surveys(recorded_at DESC)`
- `idx_churn_surveys_reason ON churn_surveys(reason)`
- `idx_followups_tenant_id ON superadmin_followups(tenant_id)`
- `idx_followups_created_at ON superadmin_followups(created_at DESC)`
- `idx_followups_case_type ON superadmin_followups(case_type, outcome)`
- `idx_followups_scheduled_at ON superadmin_followups(scheduled_at) WHERE scheduled_at IS NOT NULL`

---

## 6. Supabase Clients (`lib/supabase.ts`)

CukurShip menggunakan **dua buah** Supabase client fundamental:

| Client | Variabel Node | Kegunaan |
|---|---|---|
| **Admin** | `supabaseAdmin` | **Bypass total RLS** — Seluruh manipulasi data dari API route serverless. |
| **Anon** | `supabase` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Hanya untuk client-side GET statik. |

> 🚨 **ATURAN PENTING AFILIASI:** Semua query data spesifik ke tabel `affiliate_*` WAJIB mengeksekusi fungsi relasional melalui rute `supabaseAdmin` dengan disisipi filter rantai `.eq('affiliate_id', affiliateId)` secara persisten.

---

## 7. Portal Pelanggan (Customer Portal)

### 7.1 Routing & Navigasi SPA

Portal pelanggan beroperasi sepenuhnya di bawah subdomain spesifik setiap tenant (contoh: `{slug}.cukurship.id`).

| Route | Kegunaan |
|---|---|
| `/` | Redirect otomatis ke `/dashboard` |
| `/dashboard` | SPA utama pelanggan dengan tab navigasi: **Home**, **Booking**, **Riwayat**, **Profil** |
| `/login` | Halaman login via OTP WhatsApp untuk pelanggan |
| `/register` | Halaman registrasi untuk tenant baru (owner) |
| `/book` | Halaman utama booking (alur: Pilih Layanan → Pilih Barber → Pilih Waktu) |
| `/book/[id]` | Halaman konfirmasi dan detail status booking spesifik |
| `/history` | Daftar riwayat booking pelanggan pada tenant ini |
| `/shop-not-found` | Halaman error jika slug tenant tidak ditemukan di database |
| `/subscription-expired` | Halaman error jika masa aktif langganan tenant sudah habis |

### 7.2 Database Schema — Tabel Baru

```sql
-- 1. Tabel Barbers
CREATE TABLE barbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    photo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    specialties TEXT[], -- array layanan unggulan
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_barbers_tenant_id ON barbers(tenant_id);

-- 2. Tabel Services
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price INT NOT NULL, -- dalam Rupiah
    duration_minutes INT NOT NULL DEFAULT 30,
    category TEXT, -- contoh: potong, perawatan, paket
    is_active BOOLEAN DEFAULT true,
    is_home_service BOOLEAN DEFAULT false, -- eksklusif Pro & Business
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_services_tenant_id ON services(tenant_id);

-- 3. Tabel Barber Schedules
CREATE TABLE barber_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barber_id UUID NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL, -- 0=Minggu, 1=Senin, ..., 6=Sabtu
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    is_available BOOLEAN DEFAULT true,
    UNIQUE(barber_id, day_of_week)
);

-- 4. Tabel Bookings
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    barber_id UUID REFERENCES barbers(id) ON DELETE SET NULL,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    booking_date DATE NOT NULL,
    booking_time TIME NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','in_progress','done','cancelled')),
    
    -- Snapshot data (mencegah data historis berubah jika master data diubah)
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    service_name TEXT NOT NULL,
    service_price INT NOT NULL,
    barber_name TEXT NOT NULL,
    
    is_home_service BOOLEAN DEFAULT false,
    home_address TEXT, -- wajib jika is_home_service true
    notes TEXT,
    cancelled_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_bookings_tenant_id ON bookings(tenant_id);
CREATE INDEX idx_bookings_date ON bookings(tenant_id, booking_date);
CREATE INDEX idx_bookings_customer ON bookings(customer_user_id);
CREATE INDEX idx_bookings_status ON bookings(tenant_id, status);

-- 5. Perluasan Tabel Tenant Settings
-- (Tabel di-create saat register-shop, ekstensi dari struktur lama)
ALTER TABLE tenant_settings
    ADD COLUMN logo_url TEXT,
    ADD COLUMN banner_url TEXT,
    ADD COLUMN primary_color TEXT DEFAULT '#1a1a1a',
    ADD COLUMN accent_color TEXT DEFAULT '#f5c518',
    ADD COLUMN shop_description TEXT,
    ADD COLUMN address TEXT,
    ADD COLUMN open_days TEXT[] DEFAULT '{1,2,3,4,5,6}',
    ADD COLUMN open_time TIME DEFAULT '09:00',
    ADD COLUMN close_time TIME DEFAULT '21:00',
    ADD COLUMN is_open BOOLEAN DEFAULT true,
    ADD COLUMN wa_number TEXT,
    ADD COLUMN instagram_url TEXT,
    ADD COLUMN booking_slot_duration_minutes INT DEFAULT 30,
    ADD COLUMN max_advance_booking_days INT DEFAULT 30,
    ADD COLUMN auto_confirm_booking BOOLEAN DEFAULT false;
```

### 7.3 API Routes — Portal Pelanggan

| Route | Method | Auth | Fungsi |
|---|---|---|---|
| `/api/store/info` | `GET` | *Public* | Nama toko, deskripsi, jam buka, warna, logo. Butuh header `x-tenant-id`. |
| `/api/posts` | `GET` | *Public* | Feed promo/post toko. |
| `/api/barbers` | `GET` | *Public* | Daftar barber aktif di tenant tersebut. |
| `/api/services` | `GET` | *Public* | Daftar layanan aktif tenant tersebut. |
| `/api/bookings/availability` | `GET` | *Public* | Mengembalikan slot tersedia berdasarkan parameter `?barber_id` & `?date`. |
| `/api/check-slug` | `GET` | *Public* | Validasi apakah slug subdomain tersedia untuk pendaftaran. |
| `/api/bookings` | `GET` | **Customer** | Mengambil riwayat booking milik customer yang sedang login. |
| `/api/bookings` | `POST` | **Customer** | Membuat booking baru. |
| `/api/bookings/[id]` | `PATCH` | **Customer** | Membatalkan booking (ubah status → 'cancelled'). |
| `/api/profile` | `GET` | **Customer** | Mengambil data profil customer. |
| `/api/profile` | `PATCH` | **Customer** | Mengupdate nama/foto profil customer. |
| `/api/auth/request-otp` | `POST` | *Shared* | Kirim OTP WA (digunakan login Customer & Admin). |
| `/api/auth/verify-otp` | `POST` | *Shared* | Verifikasi OTP, me-return JWT token. |
| `/api/register-shop` | `POST` | *Shared* | Pendaftaran tenant baru (Shop Owner). |

### 7.4 Alur Booking End-to-End

```ascii
[CUSTOMER PORTAL: /book]
   │
   ├─ 1. Buka {slug}.cukurship.id/book
   │
   ├─ 2. Pilih Layanan (GET /api/services)
   │
   ├─ 3. Pilih Barber (GET /api/barbers)
   │      - Jika tidak dipilih, sistem bisa set auto-assign (opsional)
   │
   ├─ 4. Tentukan Waktu (GET /api/bookings/availability?barber_id=X&date=Y)
   │      - Backend mengecualikan slot yang sudah terisi (status collision check)
   │
   ├─ 5. Isi Data Diri (Otomatis terisi jika sudah Login)
   │      - Jika is_home_service = true, wajib masukkan detail Alamat
   │
   └─ 6. Konfirmasi Reservasi → POST /api/bookings
          │
          ├─ Cek Limit: COUNT(booking bulan ini) >= limit plan? → Tolak (403)
          ├─ Cek Double Booking: Pastikan slot waktu terkonfirmasi murni kosong
          ├─ Simpan Database: INSERT ke `bookings`
          │      (Status `pending` atau `confirmed` tergantung auto_confirm_booking setting)
          ├─ Notifikasi Customer: "Booking kamu berhasil!..."
          └─ Notifikasi Owner: "Ada booking baru dari {nama}..."
                 │
                 ▼
          7. Redirect ke /book/{booking_id} (Halaman Sukses/Detail)
```

> **CATATAN PENTING (Plan Guard):**  
> Sebelum INSERT booking, backend WAJIB mengecek batasan plan. Jika kuota bulanan `monthly_bookings` >= limit kuota, kembalikan HTTP 403 dengan pesan `"Kuota booking bulan ini sudah habis"`.  
> Paket Trial **TIDAK** mendukung `is_home_service`.

### 7.5 Alur Autentikasi Customer

Auth untuk Pelanggan (Customer) dan Pemilik (Owner) awalnya menggunakan gerbang OTP yang sama, namun dibedakan hak aksesnya pasca-login melalui payload JWT.

- **A. Customer Login:** Masuk portal tenant → OTP lewat WA → JWT tercetak role `customer` → Akses hanya terbatas di `/dashboard` dkk.
- **B. Owner Login:** Masuk ke `/admin/login` → OTP lewat WA → JWT tercetak role `owner` → Akses terbuka ke `/admin`.

**Struktur JWT Payload Customer:**
```json
{
  "id": "uuid-user-1234",
  "phoneNumber": "6281234567890",
  "name": "Budi Santoso",
  "role": "customer",           // Gatekeeper
  "tenant_id": "uuid-tenant"    // INJECTED dari Proxy middleware saat pengunjung login
}
```

### 7.6 Sistem Referral Banner (Hook di `/register`)
Sistem mengotomatisasi sambutan dan perekatan rujukan affiliasi jika tautan dikunjungi:
1. Skrip membaca `referral_code` dari parameter URL `?ref=REF-BUDI-X7K2`.
2. Menyimpan status sementara di Window `sessionStorage` (referral code, utm keys).
3. Melakukan HTTP `POST /api/affiliate/track` di latar belakang (*silent hook*) untuk mencatat *Click Log* via backend dan menetapkan `click_id`.
4. Mengembalikan dan menyimpan respon `click_id` di Session Storage.
5. Membangkitkan **Banner Teks Coklat (Amber)** pada View Form Utama: *"🎉 Kamu diundang oleh Budi Santoso! Daftar toko potong Anda sekarang."*
6. Saat form sukses di-submit: Parameter muatan `referral_code` dan `affiliate_click_id` akan disuntik di badan JSON sebagai data turunan ke API Registrasi (`POST /api/register-shop`).
7. Browser membuang kunci session storage setelah API mengembalikan 200 OK.

### 7.7 Notifikasi WhatsApp — Customer Events

Integrasi WA secara otomatis dipicu oleh sistem *(Fire-and-Forget)* menggunakan `WHATSAPP_SERVICE_URL`.

**Pesan Ke CUSTOMER:**
- *Saat booking berhasil dibuat (`pending`)*:
  `"Halo {customer_name}, booking layanan {service_name} di {shop_name} untuk {booking_date} jam {booking_time} telah kami terima dan sedang menunggu konfirmasi."`
- *Saat booking dikonfirmasi (`confirmed`)*:
  `"Asyik! Booking kamu di {shop_name} ({service_name} dengan {barber_name}) pada {booking_date} jam {booking_time} sudah DIKONFIRMASI. Sampai jumpa!"`
- *Saat booking dibatalkan (`cancelled`)*:
  `"Maaf {customer_name}, booking kamu di {shop_name} pada {booking_date} terpaksa dibatalkan. Hubungi admin untuk jadwal ulang."`

**Pesan Ke OWNER:**
- *Booking Baru*:
  `"🔔 BOOKING BARU!\nNama: {customer_name}\nLayanan: {service_name}\nJadwal: {booking_date} {booking_time}\nBarber: {barber_name}\nSilakan cek Admin Panel."`
- *Pembatalan oleh Customer*:
  `"⚠️ PEMBATALAN!\nPelanggan {customer_name} telah membatalkan jadwal {service_name} pada {booking_date} {booking_time}."`

### 7.8 Plan Guard — Pembatasan per Paket

Logika bisnis (Plan Guard) diterapkan ketat secara *Server-Side* di `/api/bookings` dan manajemen toko.

| Batasan Fitur | Trial | Starter | Pro | Business |
|---------------|-------|---------|-----|----------|
| **Booking/Bulan** | 10 | 50 | *Unlimited* | *Unlimited* |
| **Maks. Barber Aktif** | 1 | 2 | 5 | *Unlimited* |
| **Layanan Aktif** | - | 5/bln | *Unlimited* | *Unlimited* |
| **Home Service** | ❌ | ❌ | ✅ | ✅ |
| **WA Blast** | ❌ | ❌ | *Limit Terbatas* | *Penuh* |

> **CATATAN PENTING (Mekanisme Penegakan Limit):**
> - Sebelum melakukan proses penyisipan (`INSERT`), Backend **WAJIB** mengeksekusi perhitungan `COUNT` atas booking pada bulan berjalan untuk tenant terkait.
> - Hasil di bandingkan dengan fungsi limitator `getPlanLimit(tenant.plan)` dari library terpusat `lib/billing-plans.ts`.
> - Jika ditolak, kembalikan payload format standar: `{ error: "PLAN_LIMIT_REACHED", message: "Telah mencapai batas plan...", upgrade_url: "/admin/billing" }`.

---

## 8. Admin Panel Owner Portal

### 8.1 Routing Panel
Dokumentasi rute utama untuk operasional toko (Pemilik Toko).

| Route | Halaman | Akses | Keterangan |
|---|---|---|---|
| `/admin/login` | Login OTP | *Shared* | Halaman login OTP via `components/AdminLoginContent.tsx` |
| `/admin` | Overview | **Owner** | Metrik statistik hari ini, booking pending, info pendapatan, status toko |
| `/admin/bookings` | Tabel Booking | **Owner** | Manajemen semua booking dengan filter: tanggal, status, barber |
| `/admin/bookings/[id]`| Detail | **Owner** | Tampilan detail pemesanan + respon konfirmasi/tolak/selesai |
| `/admin/barbers` | CRUD Barber | **Owner** | CRUD daftar kapster toko |
| `/admin/barbers/[id]` | Jadwal/Detail | **Owner** | Detail spesifik dan panel jadwal barber terkait |
| `/admin/services` | CRUD Layanan| **Owner** | Manajemen daftar layanan jenis cukur dan harga |
| `/admin/posts` | Promo & Info| **Owner** | Mengelola pengumuman, event, dan kode promo untuk pelanggan |
| `/admin/time-off` | Jadwal Libur| **Owner** | Manajemen hari libur & penentuan kerangka jadwal |
| `/admin/settings` | Pengaturan | **Owner** | Kustomisasi tampilan toko, URL Subdomain, layanan WhatsApp Blast, dan jam operasional lewat antarmuka tab |
| `/admin/billing` | Paket & Promo | **Owner** | Konfigurasi informasi langganan, *upgrade* tagihan, riwayat transaksi |

### 8.2 Auth & Security Flow (Revisi Role)
Portal sangat diamankan pada area komponen otentikasi login:
- Seluruh modul login dienkapsulasi menggunakan UI statis `components/AdminLoginContent.tsx`.
- Saat fungsi validasi OTP berjalan sukses (`verify-otp`), halaman tujuan akan membaca payload `role` dari JWT.
- Keamanan divalidasi presisi: `if (!['owner', 'superadmin'].includes(role))` maka *kick-out* pelanggan dengan meredirectnya ke `/admin/login?error=accessdenied`.
- **TIDAK ADA CEK role `barber`**. Entitas kapster bukanlah login-user mandiri dan direduksi menjadi data obyek pekerja semata di sistem ini.
- Hak akses *database-level*: Seluruh kueri mutasi **DIWAJIBKAN** ditautkan menggunakan `.eq('tenant_id', tenantId)` oleh SDK Supabase backend *(Multi-Tenant Isolation Guard)* menggunakan payload token asal.

### 8.3 API Routes — Admin Panel Owner
Setiap *hit* backend Owner akan dipaksa menyaring sumber `tenant_id` via header JWT.

| Route | Method | Auth | Fungsi | Plan Guard |
|---|---|---|---|---|
| **MANAJEMEN BARBER** | | | | |
| `/api/admin/barbers` | `GET` | **Owner** | Daftar semua barber tenant | - |
| `/api/admin/barbers` | `POST` | **Owner** | Tambah barber baru | **Cek Limit Slot Barber/Plan** |
| `/api/admin/barbers/[id]` | `PATCH` | **Owner** | Update data profil / toggle opsi `is_active` | - |
| `/api/admin/barbers/[id]` | `DELETE`| **Owner** | Hapus barber (soft delete mekanisme via `is_active=false`) | - |
| `/api/admin/barbers/[id]/schedule`| `GET` | **Owner** | Data keping jadwal per barber per hari | - |
| `/api/admin/barbers/[id]/schedule`| `PATCH` | **Owner** | Mengupdate jadwal dan ketersediaan waktu jam potong aktif individu barber | - |
| **MANAJEMEN LAYANAN** | | | | |
| `/api/admin/services` | `GET` | **Owner** | Mengembalikan array daftar layanan tenant terkait | - |
| `/api/admin/services` | `POST` | **Owner** | Tambah layanan baru | - |
| `/api/admin/services/[id]` | `PATCH` | **Owner** | Update konfigurasi layanan / toggle visibilitas `is_active` | - |
| `/api/admin/services/[id]` | `DELETE`| **Owner** | Pembuangan opsi/soft-delete layanan | - |
| **MANAJEMEN BOOKING** | | | | |
| `/api/admin/bookings` | `GET` | **Owner** | Daftar penuh booking terfilter (params: `date`, `status`, `barber_id`) | - |
| `/api/admin/bookings/[id]` | `GET` | **Owner** | Tarik single metadata booking detail | - |
| `/api/admin/bookings/[id]` | `PATCH` | **Owner** | Merubah label proses konfirmasi pemesanan (`confirmed`, `in_progress`, dll) **lalu dikaitkan hook otomatis tembak WhatsApp Blast notifikasi customer** | - |
| `/api/admin/overview` | `GET` | **Owner** | Mengalkulasi nilai omzet hari ini, bulan ini, beserta performansi *per-barber* | - |
| **PENGUMUMAN & PROMO (POSTS)** | | | | |
| `/api/admin/posts` | `GET` | **Owner** | Daftar pengumuman/promo dengan statistik jangkauan (notifikasi) | - |
| `/api/admin/posts` | `POST/PUT`| **Owner** | Buat/Update post pengumuman atau promo diskon | - |
| `/api/admin/posts/[id]`| `DELETE`| **Owner** | Hapus post | - |
| `/api/admin/posts/upload`| `POST`| **Owner** | Upload instrumen gambar banner Post | - |
| **MANAJEMEN LIBUR (TIME-OFF)** | | | | |
| `/api/admin/time-off` | `GET` | **Owner** | Sinkronisasi data cuti barber / libur universal toko | - |
| `/api/admin/time-off` | `POST/DEL`| **Owner** | Pembuatan dan penghapusan record kalender cuti | - |
| **PENGATURAN TOKO** | | | | |
| `/api/admin/settings` | `GET` | **Owner** | Mengembalikan entitas profil warna, atribut *font* dan UI *banner*. | - |
| `/api/admin/settings` | `PATCH` | **Owner** | Update sinkronisasi text komponen profil usaha dan lain lain | - |
| `/api/admin/settings/upload` | `POST` | **Owner** | Upload instrumen berkas logo/banner melalui Supabase Storage Bucket | - |
| `/api/admin/settings/hours` | `PATCH` | **Owner** | Pengaturan absolut *master limit* buka/tutup jam operasi | - |
| `/api/admin/settings/toggle` | `PATCH` | **Owner** | Fitur tombol hijau *override* On/Off (Membuka / Tutup toko paksa statis) (`is_open`) | - |
| `/api/admin/subdomain`| `PATCH` | **Owner** | Migrasi string URL default menuju alamat kustom brand sendiri | **Cek ketersediaan limit revisi URL via canCustomSubdomain dll** |
| `/api/admin/subdomain/check`| `GET` | **Owner** | Mevalidasi duplikasi string Slug URL custom pilihan brand | - |
| **WA BLAST (Eksklusif Pro+)** | | | | |
| `/api/admin/whatsapp` | `GET/POST`| **Owner** | Manajemen template pesan dan integrasi Blast promosi WhatsApp massal ke eks-pelanggan | **Cek flag canBlastWA() Cukup / Tidak** |
| **BILLING** | | | | |
| `/api/admin/billing/info`| `GET` | **Owner** | Mengembalikan format tagihan Midtrans riwayat berjalan & flag kuota *expire date* promo | - |
| `/api/admin/billing/create-invoice`| `POST`| **Owner** | Eksekusi konversi ke Snap Midtrans perolehan item upgrade/belanja siklus tahunan/bulanan | - |

### 8.4 Logic Konfirmasi Booking

Diagram alur ketika owner mengubah/menangani transisi data status antrian reservasi:

```ascii
[BOOKING PENDING: Menunggu Konfirmasi]
   │
   ├─ Owner masuk dashboard view → Klik record yang berstatus 'pending'
   │      ↓
   ├─ Owner menekan tombol "Konfirmasi"
   │      ↓
   ├─ Frontend: HTTP PATCH /api/admin/bookings/[id] { status: 'confirmed' }
   │      ↓
   ├─ Backend Database: UPDATE bookings SET status='confirmed', updated_at=NOW()
   │      ↓
   ├─ WHATSAPP INTEGRATION: Mengirim hook payload ke WHATSAPP_SERVICE_URL
   │  "Booking kamu dikonfirmasi! Mari datang tepat waktu ke [Toko X]..."
   │      ↓
   └─ API Mengembalikan Objek: { success: true, booking: {...} }
```

**Transisi Status Valid:**
- `pending` → `confirmed` (Owner menerima dan menyiapkan staf)
- `pending` → `cancelled` (Owner menolak booking, kuota penuh/diluar batas)
- `confirmed` → `in_progress` (Customer tiba, layanan sedang berlangsung)
- `in_progress` → `done` (Cukur selesai, status statis usai)
- `confirmed` → `cancelled` (Pembatalan mendadak / Sepihak di tengah waktu)

> **CATATAN KRITIS:** Skrip backend WAJIB mengeksekusi integrasi webhook pesan Notifikasi WA kepada customer setiap kali owner mengubah state di atas, agar customer tak menanti info dalam ketidakjelasan.

### 8.5 Plan Guard — Pembatasan Fitur Owner

Akses dan aksi CRUD tertentu yang *illegal* maupun di luar perjanjian akan ditangani oleh Helper terpusat `lib/billing-plans.ts`.

| Percobaan Owner | Respon HTTP API (Error/Guard) | Catatan UX |
|---|---|---|
| Tambah barber ke-3 di plan **Starter** | **403**: *"Upgrade ke Pro untuk lebih dari 2 barber"* | Return objek memiliki field `upgrade_url: "/admin/billing"` untuk call to action upgrade plan. |
| Klik dashboard module WA Akses `/admin/blast` di **Starter** | **403**: *"Fitur eksklusif plan premium"* | Modul terkunci / *Forbidden Route*. |
| Ganti subdomain di plan **Trial** | **403**: *"Fitur tidak tersedia di paket ini"* | Disarankan UI Banner Upgrade Plan segera. |
| Owner mengganti slug ke-4 kalinya di plan **Pro** | **403**: *"Revisi subdomain sudah habis (3/3)"* | Guard membaca angka metrik `subdomain_revisions_remaining` == 0. Transaksi modifikasi URL di tolak penuh. |

### 8.6 Manajemen Subdomain
Alur mekanika logis pengubahan atribut URL tenant:
1. Owner membuka panel kontrol: `/admin/settings/subdomain`.
2. Input parameter text string `slug` pilihan brand baru miliknya.
3. Front end mevalidasi nama dengan trigger cepat `GET /api/check-slug?slug=OpsiBaru` → Memastikan properti string tidak *duplicate*.
4. Memicu endpoint simpan API `PATCH /api/admin/settings/subdomain { new_slug }`.
5. REST API Melakukan validasi pengamanan sebelum disimpan:
   - Evaluasi Limit Plan: `canCustomSubdomain(plan)` == `true`? (Hancurkan / 403 jika tipe paket membatasi modifikasi).
   - Pastikan Limit Coba Berubah belum habis `tenants.subdomain_revisions_remaining > 0` (Hancurkan / 403 jika 0).
   - Eksekusi DB : `UPDATE tenants SET slug=new_slug, subdomain_revisions_remaining = subdomain_revisions_remaining - 1`.
6. Sukses, URL beroperasi pada instansi *proxy resolver*, dan token login / domain referer pelanggan berganti. Objek respon disebar: `{ success: true, new_slug, revisions_remaining }`.

> **CATATAN KRITIS:** Alamat *Default Subdomain* (yang digenerate otomatis sejak hari pertama saat form register dikirim) itu **BUKAN** hitungan jatah revisi *Subdomain Kustom*. Mengganti default acak ini ke URL proper pilihan (seperti *goodtime.cukurship.id*) barulah menguras jatah limitator modifikasi.

### 8.7 Reusable Components Admin Panel
Komponen terdistribusi arsitektural secara luas, didesain *reusable* ke seluruh penjuru admin panel.

| Component Component | Fungsionalitas | Perilaku Mutasi / Guarding Status |
|---|---|---|
| `AdminLoginContent.tsx` | View state perantara akses root. | Input dan memvalidasi `request-otp` / `verify-otp` JWT token untuk role admin eksklusif (Bukan entitas customer). |
| `BookingCard.tsx` | UI box untuk merender per potong item di timeline list. | Mengekstrak detail waktu dan integrasi klik pop-out. |
| `BarberForm.tsx` | Modal/Drawer pembuatan dan edit input bio. | Tersambung pada validasi `PlanGuardBanner` (Jika max tercapai → Drawer tertahan blok). |
| `ServiceForm.tsx` | Konfigurasi label produk paket layanan. | Flag input *Home Service* otomatis disabel/tergembok jika paket plan toko dibawah **Pro**. |
| `StatusBadge.tsx` | Chip komponen representasi warna per-elemen label teks (Kuning: Pend, Hijau: Conf, dll). | Kosmetik *Read-Only* |
| `BookingCalendar.tsx` | Antarmuka grafis matriks per grid harian penjadwalan. | Visualisasi kekosongan durasi jadwal yang tabrakan antar pelanggan. |
| `PlanGuardBanner.tsx` | Blok intersep pengkondisian plan premium vs standard. | Menempel pada halaman-halaman tertutup. Membawa tombol aksi kilat mengarah `/billing` URL referensi bayar. |

---

## 9. Super Admin Portal

### 9.1 Routing Admin Pusat
Tabel lengkap pemetaan rute halaman Super Admin di `/superadmin/*`:

| Konteks URL | Fungsi Halaman (Super Admin) |
|---|---|
| `/superadmin` | Halaman utama (Dashboard/Overview) untuk melihat statistik agregate semua tenant (MRR, Total, Expiring). |
| `/superadmin/login` | Portal khusus autentikasi administrator utama |
| `/superadmin/tenants` | Monitoring daftar semua tenant + penagihan (billing) |
| `/superadmin/affiliates` | Manajemen profil affiliator (Approve/Suspend) |
| `/superadmin/affiliates/withdrawals` | Kasir antrian pencairan komisi affiliasi |
| **[BARU]** `/superadmin/pipeline` | Papan visual CRM lifecycle tenant (Kolom: Expiring Soon → At Risk → Churned → Renewed) |
| **[BARU]** `/superadmin/followups` | Riwayat rekam jejak semua aktivitas follow-up dengan saringan `case_type` & `outcome` |
| **[BARU]** `/superadmin/whatsapp` | Manajemen status koneksi Gateway bot otomatisasi WhatsApp (QR Code / Status). |

### 9.2 Overview Fitur Super Admin
Portal ini terbagi menjadi dua domain operasional makro:

**A. Domain Afiliasi (Manajemen Agen Reseller)**
- Persetujuan (Approve) agen pasif menjadi tier *Reseller*.
- Memblokir gerak agen nakal dengan fitur *Suspend*.
- Pencairan komisi aktif, menolak/menerima permohonan (*withdrawals*).
- Meninjau laporan MRR dari jalur pemasaran afiliasi.

**B. [BARU] Domain CRM Tenant (Pipeline & Follow-Up)**
- **Pipeline Dashboard**: Visualisasi lifecycle semua tenant dalam corong status: `Healthy`, `Expiring Soon`, `At Risk`, `Churned`, `Trial`.
- **Health Score Engine**: Mesin deteksi skor (0-100) dikalkulasi otomatis berdasar jejak aktivitas sebulan terakhir (`tenant_activity_events`).
- **Follow-Up CRM**: Log sinkronisasi rekaan kontak sentuhan Admin ke penyewa via WA/Telp. Tersambung API WA `WHATSAPP_SERVICE_URL`.
- **Churn Survey Tracking**: Rekam histori jejak alasan mengapa sebuah toko mati (Pindah saingan, Kemahalan, Tutup sementara).

### 9.3 Database — Tabel CRM Baru
Berikut adalah pembaruan struktur basis data utama penampungan jejak CRM yang berelasi dengan tabel `tenants` dan `users`:

```sql
-- 1. Tabel Log Follow-Up
CREATE TABLE superadmin_followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    admin_id UUID REFERENCES users(id), -- Null jika dihasilkan Cron Otomatis
    case_type TEXT NOT NULL CHECK (case_type IN ('renewal', 'usage_check', 'churn', 'upgrade_offer', 'custom')),
    channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'phone', 'email', 'internal_note')),
    note TEXT,
    outcome TEXT NOT NULL CHECK (outcome IN ('no_response', 'interested', 'renewed', 'churned_confirmed', 'pending')),
    scheduled_at TIMESTAMPTZ,
    done_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_superadmin_followups_tenant ON superadmin_followups(tenant_id);

-- 2. Tabel Survei Pemberhentian (Churn)
CREATE TABLE churn_surveys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    reason TEXT NOT NULL CHECK (reason IN ('too_expensive', 'not_using', 'switched_competitor', 'temporary_close', 'other')),
    detail_note TEXT,
    recorded_by TEXT NOT NULL CHECK (recorded_by IN ('superadmin', 'self_reported')),
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_churn_surveys_tenant ON churn_surveys(tenant_id);
```

### 9.4 API Routes Super Admin
Tabel utuh endpoint Super Admin. **Seluruh REST API di bawah ini (kecuali Cron)** dikawal secara persisten oleh barikade `getUserFromToken(request)` → `requireRole(['superadmin'])` beserta *Bearer* `localStorage.superadmin_token`.

| Route Map | Method | Domain Sasaran | Fungsi Endpoint |
|---|---|---|---|
| **DOMAIN OVERVIEW UTAMA** | | | |
| `/api/superadmin/overview` | `GET` | Internal | Ambil agregat metriks tenant tahunan, bulanan, estimasi ARR & array expiring_annual_14days. |
| **DOMAIN AFILIASI** | | | |
| `/api/superadmin/affiliates` | `GET/PATCH` | Eksternal | Sinkronisasi tabel agen / Toggle Suspend Affiliator. |
| `/api/superadmin/affiliates/overview`| `GET` | Eksternal | Tarikan agregator statistik ekosistem uang rujukan pasif khusus Affiliate. |
| `/api/superadmin/affiliates/withdrawals`| `GET/PATCH`| Eksternal | Baca tagihan komisi agen dan ekskusi bayar pencairan (`paid/rejected`). |
| **DOMAIN MANAJEMEN TENANT** | | | |
| `/api/superadmin/tenants` | `GET` | Internal | Baca garis besar seluruh langganan, list billing dan status flag paket. |
| `/api/superadmin/tenants/[id]/extend-plan` | `POST` | Internal | Perpanjang `plan_expires_at` tenant secara paksa sekaligus kirim notifikasi WA (Bonus Hari). |
| `/api/superadmin/tenants/[id]/reset-subdomain-revisions` | `POST` | Internal | Mengembalikan sisa jatah batas penggantian nama custom URL subdomain pelanggan. |
| `/api/superadmin/tenants/[id]/toggle-active` | `POST` | Internal | Blokir/Aktifkan operasi sebuah toko secara unilateral. |
| **[BARU] DOMAIN CRM PIPELINE** | | | |
| `/api/superadmin/tenants/pipeline` | `GET` | Internal | Lembar JSON array tenant per `lifecycle_status` + `paid_cycles`, `is_in_promo`. |
| `/api/superadmin/tenants/activity` | `GET` | Internal | (*TIDAK menggunakan [id] di URL*) Menarik detil `health_score` berdasarkan `tenant_id` Query parameter. |
| `/api/superadmin/followups` | `GET/POST`| Internal | Narik catatan riwayat teguran / Catat record komunikasi sentuhan baru. |
| `/api/superadmin/followups/[id]` | `PATCH` | Internal | Mutakhirkan status interaksi (Merespon/Mati) dan log presisi waktu `done_at=NOW()`. |
| `/api/superadmin/tenants/[id]/send-wa`| `POST` | Komunikasi | Konversi trigger pengiriman WA resmi dan sisip otomatis status INSERT follow-up baru. |
| `/api/superadmin/churn-surveys` | `GET/POST`| Analitik | Daftar rekap pemberhentian / Pendaftaran tenant mati. (Otomatis menyisipkan status churn). |
| **[BARU] DOMAIN WHATSAPP GATEWAY** | | | |
| `/api/superadmin/whatsapp/qr` | `GET` | Sistem | Mengekstraksi kode bar scan WhatsApp Node JS. |
| `/api/superadmin/whatsapp/status` | `GET` | Sistem | Mendeteksi status kehandalan koneksi WhatsApp Service `session_id`. |
| **[BARU] CRON JOBS AUTOMATION** | | | *(Auth Khusus Menggunakan: Header `Bearer CRON_SECRET`)* |
| `/api/cron/affiliate-commissions` | `GET` | Komisi | (Jam 00:00 WIB) Pencairan tag status komisi `pending` menyeberang jadi tunai `available`. |
| `/api/cron/tenant-health-check` | `GET` | CRM & Notif | (Jam 01:00 WIB) Scan radar Tenant habis masa berlangganannya & Sisipkan follow up renewal. |

### 9.5 Sistem CRM Pipeline — Lifecycle Tenant
Model pergerakan sirkulasi tenant diatur dalam state *Lifecycle Status* dengan hierarki selektif teratas ke bawah:

1. **`churned`** → `is_active=false` DAN `plan_expires_at < NOW()`. (Toko benar-benar kandas).
2. **`expiring_soon`** → `is_active=true` DAN masa sewa kedaluwarsa `<= 7 hari`. (Butuh pemanasan perpanjangan).
3. **`at_risk`** → `is_active=true` DAN masa sewa kedaluwarsa `8-30 hari`. (Status teguran awal resiko tutup).
4. **`trial`** → `plan = 'trial'`. (Status spesial, bukan akun berbayar mandiri).
5. **`healthy`** → `is_active=true` DAN masa sewa kedaluwarsa `> 30 hari`. (Toko sehat dan rajin beroperasi).

**Alir Skema Diagram Otomasi CRM (ASCII):**
```ascii
[CRON HARIAN] Deteksi tenant 'expiring_soon' (Kedaluwarsa dlm 0-7 hari)
      │
      ▼
Sistem Auto-Insert baris ke `superadmin_followups` (case_type='renewal', outcome='pending')
      │
      ▼
Super admin melek layar `/superadmin/pipeline` → Cek tabel antrian follow-up
      │
      ▼
Klik tombol kontak tenant → Memicu POST `/api/superadmin/tenants/[id]/send-wa`
      │
      ▼
Pesan Reminder WA terkirim ke gawai Owner. Status followup dirubah melaju.
      │
      ├─ Owner perpanjang tagihan Midtrans → Sistem reorientasi status ke 'healthy' 🟢
      ├─ Owner Tidak Merespon Panggilan → Super Admin set outcome 'no_response' 🟡
      └─ Owner Memilih Tutup Usaha → Admin catat `churn_surveys` + outcome 'churned_confirmed' 🔴
```

### 9.6 Template Pesan WhatsApp Super Admin
Format baku komunikasi mesin telah di-*hardcode* di server berdasarkan pemetaan label tipe perlakuan (`case_type`), sama sekali **BUKAN** dimanipulasi teks bebas via inputan payload Front-End:

| Tipe (Case Type) | Deskripsi Rangka Pesan |
|---|---|
| **`renewal`** | Format peringatan batas hari penutupan toko berjalan beserta URL tombol perpanjang langganan. |
| **`usage_check`** | Format *ice-breaker* CS peduli untuk tenant dengan skor booking/health memprihatinkan, menawarkan asistensi bantuan manual. |
| **`churn`** | Pesan pengantar tawaran re-aktivasi berbalut diskon khusus kembalian (Win-Back) agar yang sudah kedaluwarsa (*churned*) menyala kembali. |
| **`upgrade_offer`** | Broadcast promosi dorongan upgrade limit paket (contoh dari Starter menuju Pro / Business) untuk kapasitas barber penuh. |
| **`custom`** | Rute dinamis bebas diisi super admin merespon tiket urgensi khusus insidental di luar kurikulum. |

### 9.7 Cron Jobs
Konfigurasi rutinitas perputaran tuas global tercatat kuat di sistem *engine scheduler* (`vercel.json`). Semua transmisi data dieksekusi tertutup via validasi rahasia autentikasi: `Authorization: Bearer {CRON_SECRET}`.

| Alamat Penjadwalan API (Path) | Jadwal Skrip UTC | Konversi Lokal WIB | Sasaran Fungsi Latar Belakang |
|---|---|---|---|
| `/api/cron/affiliate-commissions` | `0 17 * * *` | **00:00 WIB** | *(Existing)* Meruntuhkan label dana pending hasil tagihan afiliasi cair ke dalam saku mutasi siap tarik `'available'` (Batas waktu 7 hari pengikatan pecah asuransi jatuh tempo). |
| **[BARU]** `/api/cron/tenant-health-check` | `0 18 * * *` | **01:00 WIB** | Menembakkan radar siluman pencari kelompok Tenant langganan berisiko hangus terbatas seumur `≤ 7 hari` *plan_expires_at*. Menciptakan induksi antrian list kerangka silsilah `superadmin_followups` *renewal*. |

### 9.8 Checklist Aturan Developer — Domain Super Admin
Perhatian tajam untuk insinyur kode yang membangun tumpukan lapis rute belakang API wilayah Portal Super Admin:

- 🛡️ **Penegakan Gate-Way Otentikasi**: Modul API WAJIB menyematkan filter sandi kombinasi mutlak `getUserFromToken(request)` diikuti eksekusi validasi persis fungsi `requireRole('superadmin')`.
- 🛡️ **Pengecualian Lapis Cron**: Khusus Cron Job meniadakan token identitas manusia karena ia robot, dan ia digeser memakai metode cek baku sintaks parameter murni: otoritas Header === `Bearer CRON_SECRET` sebagai kuncinya.
- 🛡️ **Kunci Induk Administrator Tetap (`admin_id`)**: Patokan angka id administrator yang sedang membalas obrolan WA atau Follow-Up *Hanya Bisa & Murni* disadap bulat-bulat dari jantung deeskripsi Payload Token JWT. Pelarangan mutlak untuk mengadopsi data perantara palsu via JSON HTTP tubuh Post request *body* dari client.
- 🛡️ **Penolakan Penyusupan Konten Palsu (Client Hijack)**: Baris rakitan variabel teks Pesan Template WA secara ketat wajib digodok terpusat dari rahim **Server** bukan hasil kiriman injeksi semena-mena via tangkapan peramban (*client*). Kunci autentikasi peretas `WHATSAPP_SERVICE_SECRET` abadi tetap di kurung aman layaknya pedang di dalam konfigurasi rahasia server `.env`.
- 🛡️ **Kestabilan Lembut Anti Retak (Graceful Fallback)**: Meskipun konektor API bot WhatsApp terjengkang di Endpoint pengiriman sentuh `/send-wa`, server api pantang runtuh mati total atau menyiarkan kode Error HTTP Fatal! Log rekapitulasi kontak penagih `followup` ke basis pangkalan PostgreSQL harus mulus dikerjakan tak terganggu. Return object pelapor JSON menanggungnya dengan lembut bertuliskan kembalian label indikator malfungsi pengiriman `message_sent: false`.
- 🛡️ **Rute Penolak Cache**: Pasang baut pelumpuh ingatan memori peramban *Route Caching* sistem App Router dengan mewajibkan penguncian frasa permanen blok deklaratif baris `export const dynamic = 'force-dynamic'` ke setiap ubun struktur API CRM.

---

## 10. Public API Routes

Beberapa API bebas *Authorization Header* (Guest friendly):
| Route Backend | Metode Data | Fungsi |
|---|---|---|
| `/api/store/info` | `GET` | Meta info warung barber terbuka (nama toko, layanan). |
| `/api/posts` | `GET` | Ambil promo dan unggahan terbuka. |
| `/api/auth/request-otp` | `POST` | Generate string OTP login. |
| `/api/check-slug` | `GET` | Validasi ketersediaan subdomain string di pasar saat buat lapak. |
| **`/api/affiliate/register`** | `POST` | *API Pendaftaran identitas Affiliator independen (Diri sendiri).* |
| **`/api/affiliate/track`** | `POST` | *Trigger perekam aktivitas klik referral secara anonim.* |

*(Afiliasi Route publik `register` & `track` diabaikan Token Autentikasinya karena terjadi sebelum pengunjung tercetak menjadi Agen).*

---

## 11. Tenant Onboarding (Alur Registrasi Referral)

Bagan berikut memvisualisasikan bagaimana Pendaftar toko baru mengikat diri mereka terhadap agen Afiliator tanpa cela saat mendaftar paket aplikasi:

1. Buka Portal pendaftaran `/register`. URL bisa normal atau membawa ekor ref `?ref=REF-BUDI-X7K2`.
2. Jika ada Referensi → Skrip menembak HTTP Pilihan Publik `POST /api/affiliate/track` dan jendela merespons ID Klik sesifik (`click_id`).
3. User lengkapi data: HP Utama, Nama Toko, Setingan URL `slug`.
4. Browser meminta restu pengecekan ketersediaan namespace di `GET /api/check-slug`.
5. Formulir akhir menembak Payload JSON ke `POST /api/register-shop` mencakup: `{ phone, shop_name, slug, referral_code?, affiliate_click_id? }`.
6. Pembuatan Barbershop:
   - Buat `tenants` (set `plan='starter'` bawaan + **`referred_by_code=referral_code`**).
   - Bentuk default tema UI di tabel `tenant_settings`.
   - Setup hierarki Akun Admin Utama dengan Role *Owner* atas ID tadi (`users` table).
7. **[TRY-CATCH TERPISAH]** Pemrosesan Blok Rantai Referral:
   - Cari affiliator aktif `WHERE referral_code = 'KODEXXX' AND status='active'`.
   - Melahirkan relasi pengikat affiliasi: `INSERT INTO affiliate_referrals {affiliate_id, tenant_id, status: 'registered'}`.
   - Perbarui angka kinerja makro Affiliator `total_referrals += 1`.
   - Lipat balik dan setel bendera *konversi* kunjungan tabel Klik `affiliate_clicks.converted = true`.
   - Bot menembak Webhook ke nomor WhatsApp sang agen Affiliator untuk menepuk pundaknya (Notifikasi Tembus Target).
   > ⚠️ **Catatan Failsafe:** Jika karena suatu kesalahan komputasi proses Referral di atas rusak (Error Node), baris kode dibungkus perlindungan anti-crash terpisah sehingga **Gagalnya proses Afiliator TIDAK AKAN PERNAH menjagal/menggagalkan pendaftaran sang Pemilik Toko**.
8. Konfirmasi selesai dan pelanggan dilempar masuk ke panel admin `/admin/login`.

---

## 12. Billing Plans (Rencana Tarif Langganan Sistem)

  Sistem Harga CukurShip (Diperbarui 2026-04-02)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  | Plan          | Harga Promo/bln   | Harga Normal/bln | Harga Annual    | Durasi Promo |
  |---------------|-------------------|------------------|-----------------|--------------|
  | Trial         | -                 | Gratis           | -               | -            |
  | Starter       | Rp 49.000         | Rp 79.000        | Rp 852.000/thn  | 2 bulan      |
  | Pro           | Rp 99.000         | Rp 149.000       | Rp 1.430.400/thn| 2 bulan      |
  | Business      | Rp 199.000        | Rp 299.000       | Rp 2.691.000/thn| 2 bulan      |

  CATATAN KRITIS HARGA:
  - Promo hanya berlaku untuk PAKET BULANAN, bukan annual
  - Promo berlaku selama 2 bulan PERTAMA (paid_cycles 0 dan 1)
  - Mulai paid_cycles ke-2 → harga menyesuaikan ke normal_price otomatis
  - Annual plan: TIDAK ADA promo, langsung harga normal
  - Trial: TIDAK ADA promo_price, normal_price = 0

  Identifier key database tetap sama:
  trial | starter | pro | business | starter_annual | pro_annual | business_annual

UPDATE interface PlanDetails di lib/billing-plans.ts:

  Tambahkan 3 field baru (field lama TETAP ADA):
  - promo_price: number | null    // null jika tidak ada promo (trial, annual)
  - normal_price: number          // harga tagihan standar / harga annual
  - promo_duration_months: number // 0 jika tidak ada promo, 2 untuk monthly plans

UPDATE sub-section Fungsi Helper — GANTI yang lama dengan versi lengkap:

  Fungsi lama yang TETAP ADA (tidak diubah):
  - canBlastWA(planId) → boolean
  - isAnnualPlan(planId) → boolean
  - getPlanDurationDays(planId) → 365 | 30
  - canCustomSubdomain(planId) → boolean
  - getSubdomainRevisions(planId) → number
  - getPlanById(planId) → PlanDetails | undefined

  Fungsi BARU yang ditambahkan (2026-04-02):
  - getPlanPrice(planId, paidCyclesCount) → number
    Kembalikan promo_price jika paidCyclesCount < promo_duration_months
    dan promo_price bukan null. Jika tidak, return normal_price.

  - isInPromo(planId, paidCyclesCount) → boolean
    Return true jika tenant masih dalam periode promo.
    False jika plan tidak punya promo atau sudah melewati promo_duration_months.

  - promoMonthsRemaining(planId, paidCyclesCount) → number
    Return sisa bulan promo. Contoh: promo_duration_months=2, paidCycles=1 → return 1.
    Return 0 jika sudah lewat atau tidak ada promo.

  ATURAN PENGGUNAAN:
  - getPlanPrice() WAJIB dipanggil dari server (API route), BUKAN dari client
  - paid_cycles dihitung dari COUNT subscription_transactions
    WHERE tenant_id = X AND status IN ('settled','paid')
    menggunakan supabaseAdmin
  - Nilai getPlanPrice() inilah yang dikirim sebagai gross_amount ke Midtrans
  - DILARANG mengirim harga dari request body client ke Midtrans

---

## 13. Dynamic Page Titles

| Sasaran Ruang Lingkup | Tampilan Modifikasi Tab Browser | Injeksi Eksekutor DOM |
|---|---|---|
| Muka Pelanggan / Pelapak | `{shop_name}` | Setter sintetik dari hooks `document.title = shop.shop_name` |
| Admin Panel Pemilik | `{shop_name} - Admin Panel` | Settel pasca *Overview* dimuat utuh. |
| Super Admin Master | `CukurShip \| Super Admin` | Ditarik di awal saat rendering Layout `app/superadmin/layout.tsx`. |
| Master Root (Homepage) | `CukurShip` | Fungsi baku reaktif Next `generateMetadata()` di _App Layout_. |
| **Portal Affiliator Utama** | `CukurShip Affiliate` | Langsung dirender secara statis melalui `document.title`. |

---

## 14. Alur Resolusi Data di Browser

Fase alur muatan data untuk sub-domain sama sekali tidak dirubah (Pengecekan Hostname -> Proxy Extraction -> Injeksi Headers `x-tenant-id` -> Resolusi Client Komponen Dashboard Pelanggan & Tema Spesifikasi).

---

## 15. Variabel Lingkungan Pendukung (Environment Config)

Daftar `process.env` *(Environment)* yang diwajibkan untuk menjalankan instalasi utuh Node Instance ini:

```env
# Koneksi Basis Database & REST
NEXT_PUBLIC_SUPABASE_URL=https://nodenya.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ey_kode_asli...
SUPABASE_SERVICE_ROLE_KEY=ey_kunci_bypass_node_master...

# Engine Kriptografi Rahasia Sesi (Token Master)
JWT_SECRET=super_kripto_rahasiaku_buatlah_yang_panjang_sekali

# Root Alamat App 
NEXT_PUBLIC_APP_DOMAIN=cukurship.id

# Node WhatsApp Gateway Core
WHATSAPP_SERVICE_URL=https://nomorsistem.wagateway.com
WHATSAPP_SERVICE_SECRET=secret_wa_bot

# KOMPONEN TAMBAHAN AFFILIATOR & WAKTU (BARU)
CRON_SECRET=kunci_rahasia_untuk_bot_vercel_cron
SUPERADMIN_PHONE=081234567890 # (Wajib Untuk Ditembak Notifikasi Ada Reseller Yang Mendaftar ke Basis DB)
```

# Catatan: ENV berikut juga digunakan modul Tenant Health Tracking (BARU):
# WHATSAPP_SERVICE_URL    → Kirim WA follow-up CRM ke owner tenant
# WHATSAPP_SERVICE_SECRET → Bearer auth semua WA outbound (afiliasi + CRM)
# CRON_SECRET             → Juga digunakan /api/cron/tenant-health-check
# SUPERADMIN_PHONE        → Penerima laporan daily health check digest (WA)

---

## 16. Checklist Aturan Berlapis Developer — ⚠️ (HARUS DIPATUHI)

Apabila Pengembang lain ingin berkontribusi melahirkan *API Endpoint Baru* untuk Ekosistem Afiliasi, perhatikan kewajiban ini:

### Membangun API Affiliate Baru
- [x] Fungsi Autentikasi JWT **WAJIB** mengeksekusi `getAffiliateFromToken(request)` dari lib/affiliate.ts (_Perhatian: Jangan memanggil bawaan fungsi standar `getUserFromToken` milik admin panel pada route ini_).
- [x] Logika modifikasi database/Data Fetch Supabase (_supabaseAdmin_) **MUTLAK MENGGUNAKAN** klaim batas akhir filter relasional: `.eq('affiliate_id', affiliateId)`. Tidak boleh menyimpang.
- [x] Rute wajib dilempari balik Error Code `401 Unauthorized` dengan sigap ketika objek autentikasi merespon *null*.
- [x] Sematkan header konstanta reaktif server `export const dynamic = 'force-dynamic'` saat membangun halaman karena pembacaan *headers JWT* beraneka ragam per sesi.

### Membangun Fitur Tenant Health & CRM
- [x] trackTenantActivity() WAJIB dipanggil fire-and-forget — jangan await, selalu .catch(()=>{})
- [x] Event hanya boleh di-INSERT dari server-side API routes via supabaseAdmin — tidak dari client
- [x] /api/superadmin/tenants/pipeline WAJIB export const dynamic = 'force-dynamic'
- [x] POST /api/superadmin/churn-surveys WAJIB set tenants.is_active=false via supabaseAdmin
- [x] WA follow-up gagal TIDAK BOLEH gagalkan penyimpanan log superadmin_followups

### Pelanggaran Arsitektur yang Paling Dilarang
- 🛑 **JANGAN** sekali-kali memakai library primitif `createTenantClient`. Cara panggil ini di-*DEPRECATE* usang karena mencederai spesifikasi header format 500 server JWT *Claims Payload*. 
- 🛑 Field entitas `users.role` **TIDAK PERNAH** menyimpan properti bernama string `'barber'`. Entitas Tukang Potong bukan administrator.
- 🛑 Relasi Database Kunci Tenant ke Manusia harus berada di kolom `owner_user_id` (Jangan menembak nama kolom sintetik fiktif yang tidak ada seperti `owner_id`).
- 🛑 Peristiwa Billing yang berlangganan pada tag nama paket (`planId === 'trial'`) dilarang diikutsertakan memuntahkan rupiah/komisi ke tabel `affiliate_commissions`.
- 🛑 Pembatasan Entitas Basis Data: Kolom Konstrain `affiliate_referrals.UNIQUE(tenant_id)` secara kodrat diciptakan di tabel agar satu buah warung pangkas tenant *Hanya dapat diklaim mutlak referensinya sedari awal untuk satu orang/Pihak Affiliator Saja!*
- 🛑 *Anti Self-Referral*: Sistem kode sudah mengatur penolakan keras apabila Pendaftar adalah Sang Promotor Sendiri (`Phone affiliator !== Phone Owner`). Hal tersebut illegal dalam bisnis distribusi kami.
- 🛑 JANGAN insert ke tenant_activity_events dari client-side — hanya dari server API via supabaseAdmin
- 🛑 JANGAN hitung health score di client — wajib di server /api/superadmin/tenants/activity
- 🛑 WA gagal TIDAK BOLEH batalkan penyimpanan log CRM. Keduanya independen.

  ATURAN BILLING PROMO (BARU 2026-04-02):
  - getPlanPrice() adalah sumber kebenaran tunggal untuk harga.
    DILARANG menghitung harga promo secara manual di luar fungsi ini.
  - Harga yang dikirim ke Midtrans sebagai gross_amount HARUS berasal
    dari getPlanPrice(planId, paidCycles) yang dihitung di server.
  - DILARANG menerima nilai harga dari request body client untuk dipakai
    sebagai gross_amount Midtrans. Client hanya boleh memilih planId.
  - paid_cycles WAJIB dihitung ulang di server setiap checkout —
    DILARANG mempercayai nilai paid_cycles dari client/frontend.
  - Trial plan (planId = 'trial') tidak boleh masuk alur Midtrans.

  ATURAN SUPER ADMIN FOLLOW-UP (BARU 2026-04-02):
  - Template pesan WA untuk follow-up HARUS didefinisikan di server.
    DILARANG mengirim konten pesan WA mentah dari client ke API send-wa.
  - API /api/superadmin/tenants/pipeline WAJIB filter eksplisit
    menggunakan supabaseAdmin — jangan return data lintas tenant tanpa filter.
  - Auto-insert ke superadmin_followups via cron HARUS cek duplikat dulu
    sebelum insert (lihat aturan cron di atas).

---

## 17. Komponen Pembangun Modul UI Berulang (Reusable React Elements)

| Nama Variabel Kompatibilitas | Lokasi Source URI | Kegunaan Lini Depan HTML |
|---|---|---|
| `PostFeed` | `components/PostFeed.tsx` | Entitas reinkarnasi feed/promo list berdasar desain CSS tenant spesifik. |
| `AdminLoginContent` | `components/AdminLoginContent.tsx` | Tampilan layout kotak peraga Autentikasi nomor sandi gawai admin. |
| `OpenStatus` | File Induk Page Halaman `/dashboard` | Cetak biru teks status indikasi warna hijau (*Buka*) dan merah (*Tutup*). |

---

## 18. Arsitektur Terpadu Sistem Afiliasi dan Sub-Distribusi Peringkat

Sistem referensi program bagi hasil SaaS CukurShip disusun berdiri terpisah sepenuhnya dari program toko (Tenant Dashboard), demi ketahanan independensi peracikan skema komisi (*Multi-Tier Distribution Framework*).

### 18.1 Gambaran Makro Tipe Keagenan Affiliator
Subsistem membagi peserta affiliator ke dalam dua rantai perak level (`tier`):
1. **Pemasar Biasa (_Referral Level_) — `tier='referral'`:**
   Skema ini murni terbuka. Setiap manusia mendapatkan nilai margin **10%**, dengan gaya pencairan `'one-time'` (Cuma ditumpahkan sekali tatkala *Shop Owner* mulai langganan pertama kalinya). Afiliator referral otomatis `active` instan paska memasukkan form daftar.
2. **Pedagang Utama (_Reseller Level_) — `tier='reseller'`:**
   Akun premium keagenan tertutup bagi pihak besar. Level persentase dinaikkan tajam ke margin **20%**, bergaya perputaran kas pencairan pasif sepanjang waktu (`'recurring'`). Pendaftaran dibenturkan status `pending` hingga Admin tertinggi *Super Admin CukurShip* berkenan membuka gembok izin (`approve`) atas permohonan tersebut secara manual.

### 18.2 Pemetaan Eksekusi Proses (*A-Z Workflow Diagram*)

```ascii
[MASUKNYA AGEN KE SISTEM — START]
/affiliate/register (Form Daftarnya) → Tembak POST /api/affiliate/register
  ├─ Tier "Referral": Sistem bypass langsung simpan (status = 'active')
  └─ Tier "Reseller": Menyimpan data pasif (status = 'pending') menanti Restu Super Admin.
          │
          ▼
[MEMBERI LINK AJAIB KE PASAR]
Kirim tautan referensial: cukurship.id/register?ref=REF-BUDI-X7K2

[INTERAKSI SAAT TAUTAN DIKLIK PELAPAK]
Situs /register?ref=REF-XYZ menyebar sensor → Tembak POST /api/affiliate/track
  ├─ Simpan tapak log baru ke barisan tabel `affiliate_clicks`.
  ├─ Angka indikator tabel `affiliates.total_clicks` dinaikkan +1.
  ├─ Server melempar respond token rahasia: `{ valid:true, click_id:xxx, affiliate_name }`.
  └─ Tab browser penjelajah menaruh/mengamankan kunci di *sessionStorage* lokal.

[MENANCAPKAN AKAR REFERRAL KETIKA AKUN TENANT DISAHKAN]
Daftar Toko Berhasil (POST /api/register-shop + menyertakan {referral_code, affiliate_click_id})
  ├─ [Try-Catch Scope Khusus] Cek keabsahan kode Referral:
  ├─ Tulis perjanjian mengikat antara ID Agen & ID Toko di row `affiliate_referrals` (status baru: 'registered').
  ├─ Menampar angka statistik agen meroket naik -> `total_referrals` += 1.
  ├─ Tandai klik dari URL di DB sebagai berhasil tereksekusi → `affiliate_clicks.converted` = true.
  └─ Membungkam sirine bot pesan WhatsApp ke pangkuan sang affiliator pemberi kabar pendaftaran tenant sukes terjadi.

[PROSES KRUSIAL PENGUMPULAN UANG — REAKSI SAAT TENANT MEMBAYAR WAJIB BULAN/TAHUN KEDEPAN]
Selesai membayar *Checkout Midtrans* → Gateway menggerakkan POST /api/billing/webhook
  ├─ Server normal memulihkan tenggat waktu Tenant dan catatan Transaksinya (Lulus ✅).
  ├─ (Hanya terjadi Bila *plan* yang dimainkan BUKAN paket Coba-Coba 'trial') dan ikatan Referral menyala 'active':
  │    ├─ Lakukan Perhitungan Otomatis: calculateCommission(Uang Kering, Rate Margin).
  │    ├─ Ciptakan dan telurkan dana kas di tabel `affiliate_commissions` 
  │    │  dengan keadaan stempel masih 'pending' dan *Kalkulasi Jeda 7 HARI*. (available_at: +7hari).
  │    ├─ JIKA pembayaran ini adalah yang *PERTAMA KALI SEPANJANG HIDUP TENANT* (first-paid-at):
  │    │      ├─ Patenkan Status Keterikatan Referral Menjadi `converted`.
  │    │      └─ Angka skor sukses milik affiliator ditambah 1 ke `total_paid_referrals`.
  │    └─ Ketuk pintu WA Agen membagikan bon senyum: "Notif komisi berhasil dicetak ke brankas".

[SIKLUS PELEPASAN UANG DINGIN — AUTOMATIC VERIFICATION MIDNIGHT (CRON JOB) ]
Jam menunjuk 17:00 Standard UTC Global (Alias jam 00:00 TENGAH MALAM Waktu Indonesia):
  ├─ Vercel secara otomatis mencegat GET /api/cron/affiliate-commissions bermodal token master `CRON_SECRET`.
  └─ Eksekutor Membasmi penahan waktu: UPDATE `affiliate_commissions` ganti jadi `available` buat seluruh komisi yang kadaluarsanya sudah basi (available_at <= Waktu Semalam).

[PENARIKAN UANG OLEH AFFILIATOR]
Affiliator kehabisan uang di Dashboard menembak Request POST /api/affiliate/withdraw (+ diikat affiliate_token sesi)
  ├─ Sistem Menolak Kasar Jika: Withdraw melanggar standar `amount` < Rp 50.000 ATAU Dana melebihi total kas.
  ├─ Sistem Algoritma memutakhirkan FIFO (Pengurutan Dari Data Komisi Usia yang Paling Tua Diambil Cermat Pertama Sampai Nominal Terpenuhi).
  ├─ Komisi komisi parsial yang tersangkut keranjang langsung ditato paksa statusnya menjadi `processing` (Lock race kondisional agar saldo dihentikan penyedotannya lagi).
  └─ Sistem memompa data utang tunai perusahaan kepada si agen di berkas baru `affiliate_withdrawals` (status `requested`).

[PELUNASAN FISIK OLEH RAJA (SUPERADMIN APROVAL)]
Admin Pusat menatap layar `/superadmin/affiliates/withdrawals` (REST PATCH)
  ├─ Menyetujui Bon Rekening → 
  │   ├─ `affiliate_commissions` dirombak final secara mutlak menjadi `'paid'`.
  │   ├─ `affiliate_withdrawals` dinyatakan `'paid'` + tanggal cair (`processed_at`).
  │   └─ Bot WA mengabarkan Berita gembira transaksi mutasi antar-bank terlaksana ke pihak Agen.
  └─ MENOLAK / Reject (karena rekayasa data / Rekening cacat) →
      ├─ Seluruh tabungan `affiliate_commissions` dipulihkan paksa ke `available` semulajadi di brankas affiliator.
      ├─ Permintaan ganti status `'rejected'` terlampir catatan kekecewaan *Admin Notes*.
      └─ WA melapor penangguhan dan kompromi lanjutan ke agen bersangkutan.
```

### 18.3 Direktori Fungsi Skrip API Affiliasi (*Routes Map*)

| Target URI Endpoint | Keamanan JWT Guard | Fungsi HTTP | Latar Belakang Aksi |
|---|---|---|---|
| `/api/affiliate/register` | Terbuka (*None*) | POST | Pencetak pintu masuk entitas pendaftaran Identitas affiliator ke perpus DB |
| `/api/affiliate/track` | Terbuka (*None*) | POST | Sensor Radar pengirim dan penyerap statistik URL |
| `/api/affiliate/dashboard` | Dilindungi `affiliate_token` | GET | Muara seluruh ringkasan statistik, bagan grafik uang, dan profil tab untuk Frontend Dashboard affiliasi |
| `/api/affiliate/withdraw` | Dilindungi `affiliate_token` | POST | Juru tulis antrian hutang komisi kepada manajemen perusahaan pusat. |

### 18.4 Navigasi Client/Penyajian Muka Affiliator (*Route Layouts*)

Struktur jalur yang langsung disajikan peramban ke wajah pendaftar program.

| Alamat Penunjuk URL | Layar Halaman Tergambar |
|---|---|
| `/affiliate` | Muka utama gerbang landing page pemasaran bagi hasil CukurShip (Penjelasan Margin). |
| `/affiliate/register` | Area panjang pendaftaran formulir murni affiliator. |
| `/affiliate/login` | Ruang masuk yang menghisap Nomor OTP WA saja untuk dapat JWT. |
| `/affiliate/dashboard` | SPA Portal Lengkap Dashboard affiliatiator berlapis *Layout Wrapper* statis independen (Disinyalir ada fitur layar utama, saldo, komisi tunggal, riwayat afiliasi toko rujukan, ruang cuci tunai / tab Pencairan, dan ruang Setting Profil Edit Bank). |

### 18.5 Aturan Hukum & Logika Bisnis yang Sangat Kritis (*Must Know For Core Team*)
Rampungan ketat dalam desain logika program agar tidak diruntuhkan oleh injeksi buatan:
- **`Self-referral` TERLARANG**: Seseorang dengan nomor telepon HP (`affiliator_phone`) yang isinya sama dengan pengisi format registrasi Barbershop pemilik sistem (`owner_phone`) ditendang paksa (Mencegah potong margin biaya sewa server bulanan diri secara ilegal).
- **Entitas Unique Monopoli Kepemilikan (1 Tenant = 1 Maker)**: Struktur konstrain Basis PostgreSQL dikunci baku dengan tag eksklusif `UNIQUE(tenant_id)`. Seumur sisa nafas sistem, pemilik Barbershop hanya bisa disucikan bagi Satu Affiliator Pelapor semata.
- **Wabah Karantina Tujuh Hari (*7-Days Lock Protocol*)**: Komisi bernilai uang ditandai reaktif dibiarkan tak tersentuh layaknya asuransi tertunda, hanya dapat dituang *available_at* saat jam menunjuk +7 Hari dari *Date.now()* Midtrans tercetak, menghindari klaim dana hilang oleh pembatalan penyewa toko dadakan sepihak dan kerugian CukurShip.
- **Aturan Batas Pencairan Minimal**: CukurShip tidak mengizinkan administrasi biaya pengiriman bank merepotkan pusat dengan syarat Rp. 50.000 ambang bawah (*Bypass filter* API).
- **Penggelembungan Palsu (Gagal Referral Register Hook)**: Terhambatnya / Putusnya program kode referensi ditengah perputaran registrasi aplikasi *POST* shop baru di level bawah kodingan (*Node Crash/Slow Network*) TETAP MEMBIARKAN PEMBUATAN TOKO LULUS BERHASIL (Dipagari selimut pengamanan CATCH error diam perpecahan internal blok program).
- **Algoritme Pengosongan Uang (*FIFO Queuing*)**: Komisi di-gumpal menggunakan *First-In First-Out loop*, utang paling lama di tabel prioritas utama dibakar habis dahulu demi melunasi request penarikan duit pencairan affiliator demi kelancaran jurnal kas berdurasi rapih.

### 18.6 Utilitas `lib/affiliate.ts` (Modul Fungsi Sentral Kehidupan Afiliator)

Perbantuan rutin yang ada demi menjamin kelancaran fungsi matematis & akses platform:

```typescript
export function generateReferralCode(name: string): string
// Meracik pengenal acak (Pattern: "REF-" + Kata Dasar Nama + 4 Deret String Random Alfanumerik) 
// Membantu link URL jadi ramah pengetikan SEO tanpa harus terbelit spasi. Semua teks dibuat "UPPERCASE" dan disanitasi abjad kasarnya. Harus di-krocek keberadaannya dari duplikat saat API disajikan.

export function calculateCommission(amount: number, rate: number): number
// Modul sentra komputasi pembagian hasil (Return: Math.floor((amount * rate) / 100)).
// CATATAN BESAR: Operasi Float matematika kotor diabaikan seratus persen karena WAJIB dieksekusi pemaksaan "Math.floor" pembuangan Desimal. TIDAK BOLEH Ada CENTS di database sistem tunai kita!

export function getCommissionAvailableDate(): Date
// Penentu waktu (Return: new Date(Date.now() + 7 Hari x 24 Jam x 60 Menit x 60 Detik x 1000 Milidetik)).

export function formatRupiah(amount: number): string
// Komponen Pemandu string UI pencetak (Ter-konversi menjadi: "Rp 120.000"). Memakai tipe locale ('id-ID').

export function getAffiliateFromToken(request: NextRequest): { affiliateId: string; phone: string; name: string; tier: string } | null
// Intisari modul verifier yang SAKRAL dibubuhi diseluruh jajaran Backend "app/api/affiliate/*" guna mencocokan keaslian token otentifikasi JWT terenkripsi murni.
```

### 18.7 Perangkat Pengatur Waktu Berkala Otomatis Bawaan Server *(CRON)*

CukurShip mengatur nafas otomasi penjatahan pembayaran keagenan mandiri melalui mesin eksekusi rutinitas *Vercel Cron Schedule Engine*.

```json
// Berkas Skrip Parameter: vercel.json
{
  "crons": [
    {
      "path": "/api/cron/affiliate-commissions",
      "schedule": "0 17 * * *"
    }
  ]
}

  Cron BARU (2026-04-02):
  path: /api/cron/tenant-health-check
  schedule: "0 1 * * *"  ← jam 08.00 WIB setiap hari

  Tujuan:
  - Scan semua tenant setiap pagi
  - Tandai tenant yang plan_expires_at <= NOW() + 7 hari sebagai "expiring"
  - Auto-insert baris ke superadmin_followups dengan:
      case_type: 'renewal', outcome: 'pending', scheduled_at: NOW()
  - Hanya insert jika belum ada follow-up renewal pending untuk tenant tsb
    (cek duplikat: WHERE tenant_id = X AND case_type = 'renewal'
     AND outcome = 'pending' AND created_at > NOW() - interval '3 days')
  - Diamankan dengan header Authorization Bearer CRON_SECRET

* **Titik Operasi Global Waktu:** 17:00 UTC (Bilah Waktu Standar London). Secara langsung diterjemahkan menjadi **00:00 (Tengah Malam Bebas Matahari)** Waktu Indonesia Barat (WIB).
* **Autentikasi Aman:** Request otomatis akan menyuntik *headers* paspor pelindung `Authorization: Bearer {CRON_SECRET}` menuju route terdeklarasi, menghindari pencet keras API oleh pengganggu yang berusaha memutakhirkan paksa database secara illegal di sembarang jam fiktif.
* **Tujuan Operasional Tabel:** Melancarkan pergeseran kental (Batch Row Patching) yang mengubah masif seluruh parameter tag data Supabase `'pending'` berubah serentak ke `'available'` pada komisi-komisi dewasa yang umurnya melompati tenggat aman tujuh hari.

---

## 19. Webhook Billing — Konstruksi Logika Arsitektur Komisi

Ketika dana pembayaran paket Tenant sudah diterima, CukurShip Webhook (`POST /api/billing/webhook`) meredakan dan membongkar tagihan dari *Payment Gateway (MIDTRANS)*. Tiga bagian eksekusi utamanya sangat kritikal agar Tenant dan Affiliator mendapatkan bayarannya:

**Siklus Identifikasi Awal Dasar:**
↳ Bongkar Body POST -> Verifikasi string Hex Hash (Algoritma kunci keamanan Signature Midtrans).
↳ Baca status mentah `order_id` (ID database acak transaksi), `transaction_status`, dan `gross_amount` (Bentuknya bisa wujud serpihan angka desimal string tak beraturan dari server pusat Midtrans).

**Siklus Inti Berkas Database:**
Jika `transaction_status === 'settlement' / 'capture-accept'`:

**`[BAGIAN LOGIKA 1 — Update Transaksi & Hidupkan Toko (Pribadi Penyewa)]`**
→ UPDATE paksa table Supabase `subscription_transactions` menuju ke arah bendera `'settled'` atau `paid`.
→ Meniup nafas nyawa untuk tabel baris toko `tenants`. Atur is_active=true, mutakhirkan plan berjalan= *Variabel planId paket*,
Bungkus kalkulasi ketersediaan hidup langganan (Misal: plan_expires_at ditambah +30 Hari untuk paket starter bulanan atau +365 hari kalau ambil yang pro_annual basis). Tanamkan juga batas diskresi `subdomain_revisions_remaining` dari blueprint statis. Lontarkan kiriman WA bahagia ke Nomor Owner toko pertanda sukses bayar.

**`[BAGIAN LOGIKA 2 — Prosesi Pembuatan Uang Komponen Affiliate Program (Pribadi Keagenan Rahasia)]`**
→ Filter 1: Cek dahulu, `if (planId === 'trial')` → **HENTIKAN/ SKIP KOMISI**. Trial adalah haram di mata pembukuan margin perusahaan kas berbayar berjalan. Sistem lompat selesaikan sesi HTTP 200 normal di baris ini.
→ Filter 2: Sistem turun ke kolong menengadahkan informasi, MENGGABUNGKAN (JOIN RELASIONAL SQL) berkas kaitan `affiliate_referrals` dan data intip data induk si pemilik rujukan relasi (`affiliates`) DIMANA nilai persinggungan kolom database cocok dengan ID Tenant di atas tadi `WHERE tenant_id = tenantId param`.
→ Filter 3: Jika tenant *TIDAK ADA PERNAH* disentuh/dijewer tangan referral apapun (Data tidak ketemu) → **SKIP / LANJUT JALAN KARENA DIA TOKO BEBAS SAHAM.**
→ Filter 4: Jika affiliator si agen ini ternyata tertangkap sedang status *Nakal/Di-Freeze Master/Atau Belum Verif* (`affiliates.status !== 'active'`) → **SKIP. GA ADA DUIT BAGI AGEN BLOKIR!** Walaupun nyatanya referral asli ada di bagasi database.

**`[Penentuan Kepastian Duit Berwujud Kas: shouldCreateCommission]`**
Perangkat menimang tipe apa dia terdaftar?
- JIKA `commission_type` di otaknya adalah **'recurring'** (Afiliasi jenis Pedagang Aktif/Reseller) → **SELALU IYAKAN PERMINTAAN BUAT KOMISI.** Setiap bulan atau tahu tagihan muncul, cetaklah persenan!.
- JIKA `commission_type` dikunci **'one-time'** DAN parameter di catatan rujukan masih suci/belum diperawani alias `referral.status === 'registered'` -> **IYAKAN SAJA (Hanya kali ini Saja Komisi dibuatkan).**
- JIKA `commission_type === 'one-time'` TAPI nyatanya cek relasi pendaftaran referral sudah ditandai `converted` karena dia bayar bulan kedua → **TOLAK SETENGAH MATI MENTAH MENTAH. MASA PEMUNGUTAN PAJAK AGENT ONE TIME HANYA BERLAKU DIAWAL PERKEMAHAN BULAN KE-1! (Skip).**

→ Jika kepastian izin (`shouldCreateCommission`) tembus masuk berhasil:
- Parsing dana liar `transactionAmount` pakai `Math.round(Number(gross_amount))` karena MySQL/Postgres membenci angka titik nol palsu `.00` di dalam `INT`.
- Besaran Komisi Kas = `calculateCommission(transactionAmount kotor, parameter angka konkrit affiliate.commission_rate)`
- **INSERT** MENCIPTA UANG! Masukkan data tagihan di tabel abadi **`affiliate_commissions`**:
 `affiliate_id` , `referral_id`, `transaction_id`, `tenant_id`,
 Nominal utuh bersih `amount` , tingkat margin historis `commission_rate` , kotor duit `transaction_amount`, `type` berlangganan tulen,
 `status`: Tetapkan di penjara es selama 7 hari (`'pending'`) dan injeksi ramuan tanggal cair `available_at: getCommissionAvailableDate()`.

→ Cek Lagi apakah Kejadian Tagihan Ini adalah Perdana Pembuka Jalan Langganan si Pasien? (JIKA parameter stempel suci `isFirstPayment` true yakni  `referral.status === 'registered'`):
  - UPDATE tabel ikatan `affiliate_referrals` → hancurkan status registered, naik pangkat sakral menjadi `'converted'` dan berikan stempel tanggal pembayaran historikal suci (`first_paid_at=NOW()`).
  - UPDATE profil induk agen `affiliates` → sumbangkan poin karir prestigenya dengan nilai numerik meroket memukul tinggi `total_paid_referrals += 1`.

→ Akhiri dengan letusan Pesta: Kirim Bot Pesan Mesra ke layar kaca WhatsApp (`affiliate.phone`) di atas gerbong *Try-Catch Anti Eror*. (Notif ada komisi turun ke peraduan dompet pending Dasbornya).

> ⚠️ **Catatan Penting Menghindari Serangan Ledakan Database (Failsafe Bomb Defusal):**
Seluruh barisan proses "BAGIAN LOGIKA 2 KOMISI" di tubuh webhooks wajib dibungkus selimut `Try-Catch` / `Error handler kondisional` yang kedap suara *supabaseAdmin*. Jikapun database komisi menolak angka (*Constraint error/ Timeout Network*), Sistem **HANYA BOLEH ERROR LOGGING DI LOG TERMINAL SERVER (Vercel Log) TAPI DILARANG KERAS MENGAKHIRI ENDPOINT DENGAN STATUS REJECT KE API MIDTRANS**. Webhook akan membius dengan kata-kata manis tetap mereturn `200 OK` agara proses aktivasi sewa server Toko Berjalan sempurna bagi Client Customer tanpa merugikan pelanggan sedikitpun meskipun sisi pembukuan affiliator terganggu! 

---
_CukurShip Core Blueprint & Standard Operating System Procedure © 2026_
