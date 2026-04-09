# Arsitektur Web POS Kasir — CukurShip

> Diperbarui: 9 April 2026
> Dokumentasi ini dihasilkan dari analisis
> kode aktual. Semua detail bersumber dari
> implementasi yang berjalan di produksi setelah penyelarasan database.

---

## 1. Gambaran Umum

Web POS Kasir ini adalah antarmuka Point of Sale (POS) berbasis web responsif (Mobile-First) yang ditujukan untuk mempermudah Barber atau Kasir Sentral menginput transaksi pelanggan langsung dari browser. Sistem ini menggunakan arsitektur *stateless* di backend dengan JWT (JSON Web Token), sementara *state* keranjang (Cart) dikelola sepenuhnya di sisi Klien (React State & LocalStorage).

---

## 2. Entry Point & Infrastruktur

### 2.1 Route & Endpoints
> 📁 Sumber: `app/pos/page.tsx` & `app/api/pos/checkout/route.ts`

- **Frontend Route**: `/pos` (React Server Components dengan Interactive Client Hooks).
- **Backend Checkout**: `POST /api/pos/checkout`
- Proses checkout dikirim via HTTP Fetch dengan membawa Bearer Token yang menyimpan konteks `tenantId`.

- **GET `/api/pos/pending-bookings`**
  - Auth: POS JWT
  - Fungsi: Ambil daftar booking online hari ini dengan status 'pending' atau 'confirmed'
  - Filter: barber → hanya miliknya, kasir sentral → semua barber 1 tenant
  - Response: `{ pending_count, bookings[] }`

- **PATCH `/api/pos/pending-bookings/[id]/complete`**
  - Auth: POS JWT
  - Body: `{ payment_method }`
  - Fungsi: Ubah status booking online menjadi 'completed' + set `payment_method`
  - Validasi: kepemilikan tenant + barber

### 2.2 Variabel Environment
> 📁 Sumber: `.env.local`

- `POS_SESSION_HOURS`: Konstanta (misal: `12`) yang mendikte berapa lama sesi JWT Kasir bertahan sebelum kadaluarsa dan harus request OTP lagi.
- Web POS juga mengandalkan variabel integrasi WhatsApp (misal ZenZiva/Fonnte) untuk mengirim OTP ke nomor kasir.

---

## 3. Autentikasi & Resolusi Tenant

### 3.1 Alur OTP & JWT
> 📁 Sumber: `app/api/pos/auth/request-otp/route.ts` & `lib/pos-auth.ts`

Sistem login Web POS tidak memakan lisensi kurs/pengguna Supabase Auth, melainkan menggunakan OTP mandiri:
1. Pengguna memasukkan No. WhatsApp yang terdaftar.
2. Endpoint mencocokkan nomor di tabel `barbers` (atau owner) untuk mengenali `tenant_id`.
3. Mengirimkan kode 6 digit OTP.
4. Saat *Verify*, server meng-enerate token standar JWT via `jose` (`SignJWT`) dengan durasi = `POS_SESSION_HOURS`.

### 3.2 State Sesi Persisten
> 📁 Sumber: Frontend `localStorage`

- Key: `cukurship_pos_auth`
- Ini memungkinkan Kasir tetap login meskipun tab tertutup atau ter-*refresh* secara tidak sengaja. Token ini dilempar dalam Header `Authorization` ke seluruh *endpoint* `/api/pos/*`.

---

## 4. State Management (Keranjang & Pembayaran)

Berbeda dengan Bot Telegram yang menggunakan *state machine* di tabel `telegram_bot_sessions`, Web POS menggunakan React State lokal (dijalankan di browser):
- **Cart Array**: Memuat `service_id`, `name`, `final_price`, dan `qty`.
- **Customer Selection**: Input Teks opsional (Nama).
- **Barber Selection**: Wajib untuk mode Kasir Sentral (Dropdown pilihan pekerja).
- **Payment Method**: Cash, QRIS, Transfer.
- **Pending Bookings State**:
  - `pendingCount`: number (default 0)
  - `pendingList`: array (default `[]`)
  - `showPendingDrawer`: boolean (default `false`)

Karena sistemnya ada di sisi klien, ketika konfirmasi sukses, keranjang dihapus kembali ke `[]` via React *dispatch state*. 

---

## 5. Database Schema (Penyelarasan dengan Telegram)

### 5.1 Mekanika Upsert Customer
> 📁 Sumber: `app/api/pos/checkout/route.ts`

Saat menekan "PROSES BAYAR", Web POS akan menjalankan algoritma *Upsert* persis seperti Telegram:
- Jika Input Pelanggan Umum / Kosong: `customer_id` bernilai `null`.
- Jika ada Namanya: Server mencari kemiripan nama via tabel `customers`.
    - Jika Ditemukan: Atribut `last_visit_at` di-update (sementara `total_visits` TIDAK di-update karena sudah *deprecated* dan menggunakan `VIEW member_visit_stats`), lalu UUID pelanggan diteruskan ke transaksi.
    - Jika Baru: Baris `customers` baru dibuat.

### 5.2 Tabel bookings (Payload Insert)
Baris ini di-insert ke Supabase tanpa menggunakan *trigger*:
- `tenant_id`: ID Toko (ditarik transparan dari JWT Token)
- `barber_id`: ID Pelaksana layanan.
- `service_id`: ID Item Keranjang.
- `service_type`: Sengaja dipatenkan menjadi `'pos_kasir'`.
- `customer_id`: Hasil upsert UUID / null.
- `status`: `'completed'` (Wajib untuk lolos *Postgres Constraint*).
- `final_price`: Berasal dari konfirmasi di klien yg juga divalidasi ke database.
- `payment_method`: Tipe bayar (`'cash'`, `'qris'`, `'transfer'`).
- `payment_status`: `'paid'`.
- `booking_source`: `'web_pos'` (Nilai ini BERBEDA dari online booking yang menggunakan 'web').
- `booking_group_id`: UUID tunggal untuk struk yang memayungi beberapa layanan.
- `start_time` & `end_time` & `created_at`: `ISO String` ter-stempel bersamaan. (Menggantikan parameter `booking_date` yang tidak ada di skema).

### 5.3 Rekonsiliasi Statistik Member (POS vs Online)
> 📁 Sumber: `migration_07_member_stats_fix.sql` & `app/api/profile/history/route.ts`

Agar booking pelanggan *online* (`user_id`) dan *walk-in POS* (`customer_id`) tidak dihitung terpisah, CukurShip menggunakan logika rekonsiliasi via kolom `phone`.
- Menggunakan `VIEW member_visit_stats` sebagai *Single Source of Truth*.
- Menghitung jumlah `booking_group_id` dan `final_price` yang _completed_, di mana booking itu bersumber dari user langsung, atau dari customer dengan nomor HP (`phone`) yang cocok dengan user.
- Kolom `total_visits` dan `last_visit_at` pada tabel statis `customers` sudah di-mark *Deprecated*.

---

## 6. Penanganan Keamanan & Duplikasi

- **Validasi Harga di Backend**: Harga dari Frontend (`final_price`) selalu di-*crosscheck* ke `price` (atau rentang `price_min`/`price_max`) milik layanan `services` di *database* untuk menghindari intervensi harga klien melalui fitur *Inspect Element*.
- **CORS & Middleware**: Web POS *route* di-proxy/diproteksi melalui otentikasi token JWT, memastikan hanya toko/kasir bersangkutan yang bisa mencetak transaksi.

---

## 7. Alert System

### Alert Banner — Pending Bookings

Web POS memiliki sistem notifikasi visual pantang-tutup (no-dismiss) yang menampilkan jumlah booking online aktif hari ini yang belum diselesaikan.

**Mekanisme:**
- Banner kuning tampil jika `pendingCount > 0`
- Tidak ada tombol Close/X
- Banner hilang HANYA saat `pendingCount = 0` (semua booking sudah diselesaikan di-handle oleh React Local State `newList.length === 0`).
- Data di-refresh via mekanisme **Polling Sinkron Setiap 30 Detik** (`setInterval(fetchPendingBookings, 30_000)`), TIDAK MENGGUNAKAN Supabase Realtime *subscription*.
- Kasir menyelesaikan booking online melalui Drawer yang slide dari kanan (memanggil *API* `PATCH /api/pos/pending-bookings/[id]/complete`).
- Setiap penyelesaian booking online akan mengupdate stat todayTx (`loadTodayStats()`).

---

## 8. Lib Dependencies

### Shared Helper

Fungsi `countPendingBookings()` tersedia di:
`lib/booking-alerts.ts`

Digunakan oleh:
- `app/api/pos/pending-bookings/route.ts`
- `app/api/telegram/webhook/route.ts`
- `app/api/cron/booking-reminder/route.ts`
