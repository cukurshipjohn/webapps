# Arsitektur Bot Kasir Telegram — CukurShip

> Diperbarui: 9 April 2026
> Dokumentasi ini dihasilkan dari analisis
> kode aktual. Semua detail bersumber dari
> implementasi yang berjalan di produksi.

---

## 1. Gambaran Umum

Bot Kasir Telegram ini adalah antarmuka POS (Point of Sale) khusus untuk CukurShip yang bisa diakses langsung via chat Telegram. Bot ini digunakan oleh para Kapster/Barber untuk mencatat transaksi pelanggan secara cepat (tipe *walk-in*), tanpa harus login ke dashboard web. Selain itu, terdapat Mode Kasir Sentral untuk toko yang memiliki satu operator kasir terpusat. Teknologi yang digunakan mencakup Next.js App Router (Webhook endpoint), Supabase (Database), dan Google Gemini (untuk NLP / AI parsing order).

---

## 2. Entry Point & Infrastruktur

### 2.1 Webhook Endpoint
> 📁 Sumber: `app/api/telegram/webhook/route.ts`

- **URL Endpoint**: `POST /api/telegram/webhook`
- **Method**: HTTP POST
- Dihubungkan ke server Telegram dengan webhoook. Telegram API mengirim update payload JSON setiap ada pesan masuk (text) atau *callback_query* (ketika *inline keyboard* disentuh).

### 2.2 Variabel Environment
> 📁 Sumber: `app/api/telegram/webhook/route.ts` & `lib/nlp-kasir.ts`

- `TELEGRAM_BOT_TOKEN`: Token resmi dari BotFather yang dipakai untuk memanggil Telegram API (untuk send/edit pesan, dll).
- `TELEGRAM_WEBHOOK_SECRET`: Token rahasia yang dicek di header `x-telegram-bot-api-secret-token` dari setiap request webhook. Digunakan untuk keamanan agar endpoint tidak dipanggil sembarangan.
- `GEMINI_API_KEY`: API Key khusus autentikasi request Google Generative AI (NLP).

### 2.3 Cron Jobs (jika ada)
> 📁 Sumber: `vercel.json`

Terdapat *cron jobs* khusus dalam sistem untuk membantu maintain kebersihan sesi bot:
- `0 2 * * *` (Setiap jam 02:00 pagi) melakukan pemanggilan ke endpoint `/api/cron/cleanup-bot-sessions` untuk merapikan `telegram_bot_sessions` otomatis dari server Vercel.
- `0 1 * * *` (Setiap jam 01:00 UTC = 08:00 WIB) memanggil `/api/cron/booking-reminder` untuk mengirim notifikasi Telegram ke semua barber aktif yang memiliki booking online pending di hari tersebut. Skip: Barber tanpa telegram_chat_id, barber dengan 0 pending, tenant expired. Rate limit: delay 50ms antar pengiriman.

---

## 3. Autentikasi & Resolusi Tenant

### 3.1 Identifikasi Pengirim
> 📁 Sumber: `app/api/telegram/webhook/route.ts`

Bot membava payload Telegram untuk mengambil `chatId` (`body.message.chat.id` untuk Teks atau `body.callback_query.message.chat.id` untuk Tombol). `chatId` ini kemudian di-*query* ke tabel `barbers`:
```typescript
.from('barbers').select('id, name, tenant_id, role').eq('telegram_chat_id', chatId)
```

### 3.2 Resolusi Tenant
> 📁 Sumber: `app/api/telegram/webhook/route.ts`

Dari row `barbers` yang didapat, terdapat kolom `tenant_id`. ID inilah yang akan dipakai untuk menarik baris data dari tabel `tenants` (kolom `shop_name`, `plan`, `timezone`).

### 3.3 Auth Guard
> 📁 Sumber: `app/api/telegram/webhook/route.ts`

Jika query ke tabel `barbers` tidak menghasilkan data *(not registered)*, bot seketika menolak eksekusi dan membalas pesan "❌ Akses Ditolak – Akun Telegram kamu belum terhubung ke sistem kasir. Ketik /daftar untuk melihat Chat ID kamu." Eksekusi dihentikan dengan response `200 { ok: true }` supaya Telegram tidak mengulang webhook.

### 3.4 Role Barber vs Kasir
> 📁 Sumber: `app/api/telegram/webhook/route.ts`

Kolom `role` dari tabel `barbers` digunakan sebagai detektor identitas pengirim:
- Jika `role === 'cashier'`: Pengirim dikenali sebagai Kasir Sentral, dimana ia menginput transaksi namun BUKAN barber yang mencukur. Bot akan beralih ke Mode Sentral.
- Jika `role === 'barber'`: Pengirim dipandang sebagai Barber Individual.

---

## 4. Database Schema (Relevan Bot)

### 4.1 Tabel bot_sessions
> 📁 Sumber: `lib/bot-session.ts`

Tabel di database ini bernama `telegram_bot_sessions`. Struktur TypeScript/skema relevannya:
- `id` (string): Primary Key
- `chat_id` (string): ID Chat Telegram.
- `tenant_id` (string): ID Toko/Tenant yang berhubungan.
- `barber_id` (string): ID Barber/Kasir pengirim pesan.
- `step` (string): Enum state (misal `idle`, `awaiting_customer`)
- `context` (jsonb): Objek data dinamis seperti `cart`, `payment_method`, dsb.
- `expires_at` (timestamp): Waktu di mana sesi menjadi *expired*.
- `updated_at` (timestamp): Tracking update untuk pengecekan TTL.

### 4.2 Tabel bookings (kolom yang di-insert bot)
> 📁 Sumber: `app/api/telegram/webhook/route.ts`

Saat `confirm_yes`, bot *insert* deretan baris ini:
- `tenant_id`: ID Toko
- `barber_id`: ID Barber pelaksana (tergantung *mode central* / *individual*)
- `service_id`: ID dari *CartItem*
- `service_type`: Selalu bernilai `'pos_kasir'`
- `customer_id`: Hasil *insert* / referensi dari tabel `customers`
- `status`: `'completed'`
- `final_price`: Harga beli per layanan
- `payment_method`: Tipe bayar (e.g., `'cash'`, `'qris'`, `'transfer'`)
- `payment_status`: `'paid'` (Langsung dianggap lunas)
- `booking_source`: `'telegram_walk_in'`
- `booking_group_id`: UUID generated by code untuk mengkoneksikan multipel *services* di satu set struk jika terjadi void.
- `start_time` & `end_time` & `created_at`: Waktu transaksi (`ISO string`)

### 4.3 Kolom relevan di tabel tenants
> 📁 Sumber: `app/api/telegram/webhook/route.ts`

- `id`: *Matching keys*
- `shop_name`: Diprint pada Struk.
- `plan`: Digunakan untuk verifikasi langganan apakah Kasir/NLP bisa aktif.
- `timezone`: Untuk melabeli waktu receipt.

### 4.4 Kolom relevan di tabel barbers
> 📁 Sumber: `app/api/telegram/webhook/route.ts`

- `id`: Internal UUID
- `name`: Nama Staff
- `tenant_id`: Foreign link tenant.
- `role`: `'cashier'` vs `'barber'`.
- `telegram_chat_id`: Hook/Auth identitas telegram.
- `is_active`: (Untuk memfilter siapa barber yang boleh dipilih di mode sentral).

### 4.5 Kolom relevan di tabel services
> 📁 Sumber: `app/api/telegram/webhook/route.ts`

- `id` & `name`: Identifikasi
- `price`, `price_type` (`fixed`, `range`, `custom`)
- `price_min`, `price_max`: Batasan validasi.
- `service_type`: Digunakan filter (`'pos_kasir'`).
- `duration_minutes`
- Digunakan `service_barber_pricing` melalui RELASI (*left join*) untuk menarik limit custom per barber.

---

## 5. Session State Machine

### 5.1 Diagram State

Mekanisme mesin *State* pada saat interaksi berjalan:

```text
    /kasir
      │
      ▼
 [awaiting_customer] < ─ ─ ─ ─ ┐
      │                        │
      ├─► (teks: nama / tombol 'Skip')
      │                        │
      ▼                        │ NLP Result Teks (Mendadak)
   [idle] <────────────────────┘ (Jika ambiguity maka kesini)
      │
      ├─► Memilih Barber (Jika mode sentral) -> barber_pick_{id} (Kembali ke Idle)
      │
      ├─► Memilih Service Fixed -> svc_pick_{id} (Kembali ke Idle & add Cart)
      │
      ├─► Memilih Service Range -> svc_pick_{id} ->
      │      ▼
      │    [awaiting_price] -> Validasi price_*/range ->
      │      ▼
      │    [idle] (Kembali dengan item keranjang nambah)
      │
      ├─► Edit Keranjang -> cart_edit_list -> [idle] -> cart_rm_{idx} / cart_back_to_summary -> [idle]
      │
      ├─► Tambah Pilihan Lain -> cart_add_more -> [idle]
      │
      ├─► Selesai pilih -> cart_checkout ->
      ▼
[awaiting_payment]
      │
      ├─► Pilih Cara Bayar (pay_*) ->
      ▼
 [confirming]
      │
      ├─► (Tombol: 'Proses Transaksi')
      ▼
 Database Insert &
 Session Terhapus

    /pengeluaran
      │ (guard: jika ada session kasir aktif → tolak)
      ▼
 [expense_category]
      │ → exp_cat_*
      ▼
 [expense_description]
      │ → text input
      ▼
 [expense_amount]
      │ → text input angka
      ▼
 [expense_receipt]
      │ → exp_skip_receipt / photo upload
      ▼
 [expense_confirm]
      │ → exp_confirm_yes / exp_confirm_no
      ▼
 INSERT barber_expenses (status: pending)
 Session dihapus
```

### 5.2 Daftar Step Lengkap
> 📁 Sumber: `lib/bot-session.ts`

| Step Name           | Trigger Masuk | Trigger Keluar |
|---------------------|---------------|----------------|
| `idle`              | Saat baru selesai input nama (manual) , atau kembali dari pilih layanan/add cart. | Transisi saat minta harga range (`awaiting_price`) atau menekan bayar (`awaiting_payment`) |
| `awaiting_customer` | Memanggil `/kasir` (Start Sesi Baru) | Mengetik teks atau memencet tombol 'Tanpa Nama'. |
| `awaiting_price`    | Memilih service yang tipe `range` atau `custom`. | Menentukan harga/Mengetik angka harga yang valid. |
| `awaiting_payment`  | Menekan '✅ Tidak, Lanjut Bayar'. | Menekan salah satu metode bayar (`pay_cash`, `qris`, dll) |
| `confirming`        | Validasi summary pasca pilihan bayar. | Pilih '✅ Ya, Proses' (Berujung Hapus session) atau 'Batal'. |
| `expense_category`  | `/pengeluaran` dipanggil | Memilih salah satu kategori |
| `expense_description` | `exp_cat_*` dipilih | Teks keterangan valid |
| `expense_amount`    | Keterangan tersimpan | Angka nominal valid |
| `expense_receipt`   | Nominal tersimpan | `exp_skip_receipt` atau foto dikirim |
| `expense_confirm`   | Receipt diproses | `exp_confirm_yes` atau `exp_confirm_no` |

### 5.3 Struktur Context Object
> 📁 Sumber: `lib/bot-session.ts`

Objek `context` berupa JSON fields yang menumpang sepanjang umur sesi:
- `service_id`, `service_name`, `price_min`, `price_max`, `price_type`: Snapshot item layanan yang menanti di step `awaiting_price`.
- `cart`: Array (bertipe `CartItem[]` isi: `service_id`, `service_name`, `price`, `qty`).
- `customer_id` (string/null): UUID Real di Supabase.
- `customer_name` / `customer_phone`: Info pengguna.
- `selected_barber_id` & `selected_barber_name`: Spesifik bagi Mode Kasir Sentral atau NLP.
- `total_price` (number).
- `payment_method` (`'cash' | 'qris' | 'transfer'`).
- `awaiting_free_input` / `awaiting_cash_input` (boolean).
- Data khusus NLP: `nlp_draft`, `from_nlp`.

### 5.4 TTL & Expiry
> 📁 Sumber: `lib/bot-session.ts`

- Pembuatan Session: Set field `expires_at` (30 menit kedepan).
- Pengecekan TTL (`getSession`): Dilakukan hitungan manual antara `Date.now() - updated_at.getTime()`.
- Durasi Maksimum Idle: `15 * 60 * 1000` (**15 Menit**). Jika melebihi periode idle tanpa terupdate, pemanggilan `getSession` apa pun yang dipicu oleh pesan User/Telegram akan *self-destruct* (delete db records) dan mereturn nilai `null`.

---

## 6. Alur Transaksi Normal (Happy Path)
> 📁 Sumber: `app/api/telegram/webhook/route.ts`

1. **User (/kasir)**
   - **Bot Mengirim**: "💈 Transaksi Baru / Ketik nama pelanggan". Disertai Keyboard "👤 Tanpa Nama".
   - **User Merespon**: Input mengetik text "Budi".
   - **State Pindah**: `awaiting_customer` → `idle`.
2. **User (Pilih Layanan)**
   - **Bot Mengirim**: Menangkap context "Budi" dan memunculkan "💇 Pilih Layanan" (list berisi tombol-tombol `svc_pick_{id}`).
   - **User Merespon**: Memencet tombol "Potong Rambut". Karena *fixed*, harga auto tersimpan.
   - **State Pindah**: Tetap `idle` tetapi JSON `cart` bertambah isinya.
3. **User (Konfirmasi Add-More)**
   - **Bot Mengirim**: "✅ Layanan ditambahkan! / Tambah layanan lain?"
   - **User Merespon**: Pencet "✅ Tidak, Lanjut Bayar" (`cart_checkout`).
   - **State Pindah**: `idle` → `awaiting_payment`.
4. **User (Pilih Metode Bayar)**
   - **Bot Mengirim**: "💰 Pilih Metode Pembayaran" (Tombol Cash, QRIS, dll).
   - **User Merespon**: Pencet "QRIS" (`pay_qris`).
   - **State Pindah**: `awaiting_payment` → `confirming`.
5. **User (Konfirmasi Final)**
   - **Bot Mengirim**: Summary "📋 Konfirmasi Transaksi". Tombol "✅ Ya, Proses".
   - **User Merespon**: Pencet "✅ Ya, Proses" (`confirm_yes`).
   - **Bot Memproses**: Menempatkan Data ke Supabase -> Clear State Session sama sekali.
   - **Bot Mengirim**: Struk Stiker "✅ TRANSAKSI BERHASIL" dan tombol opsi Voiding.

---

## 7. Alur Kasir Sentral

### 7.1 Flag Pengaktif
> 📁 Sumber: `app/api/telegram/webhook/route.ts`

Didefinisikan murni oleh `barber.role === 'cashier'` berdasarkan hasil identifikasi pengirim. Tidak menggunakan settingan *tenant* lagi.

### 7.2 Perbedaan Alur
Pada Step Input Customer, Barber mode individual akan secara otomatis melompat ke Show List Services. Di mode Sentral, Bot mencegatnya dengan menahan list Services dan justru menjalankan fungsi `showBarberList()`.

### 7.3 Pemilihan Barber
> 📁 Sumber: `app/api/telegram/webhook/route.ts`

- Muncul list Barber Inline Keyboard `barber_pick_{id}`
- Pengguna memilih nama Kapster terkait.
- Session `context` merespon dengan menyimpan `selected_barber_id` & `selected_barber_name`, baru bot merender state List Layanan (`showServiceList`) terhadap kapster yang *terpilih* (bukan kapster kasir).

---

## 8. Penanganan Harga

### 8.1 Fixed Price
Saat service berstempel Fixed, `svc_pick_{id}` lansung mem-bypass step harga dan menjalankan Helper `addToCart()`.

### 8.2 Range Price
Jika list layanan berstempel Rentang:
- Bot memanggil `upsertSession` ke state `awaiting_price`. Context diisi `pending_service`.
- Inline Tombol merender 4 Pilihan Minimum, Harga Tengah, Maximum, dan '✏️ Nominal Lain' (`price_custom_{id}`).
- Bila menekan yang non-custom (`price_{id}_{amt}`), bot akan mencegat value dari params `{amt}`.

### 8.3 Custom / Free Input
Bila `price_custom_{id}` ditekan:
- Session Context update `awaiting_free_input: true`.
- Bot bertanya "Ketik nominal harga...".
- Teks yang akan datang akan diparsing oleh blok Text masuk saat `session.step === 'awaiting_price'`. Akan diperiksa nominal dan min-max bounds (jika rentang). Jika valid, dimutasikan dan clear `pending_service`.

---

## 9. Fitur Cart

### 9.1 Tambah Item
Diatur oleh Library `addToCart()` (bukan database query tapi manipulasi JSON lokal session). Menggunakan logic `c.qty + 1` bila ID layanan duplikat, atau mereturn array object utuh bagi item baru.

### 9.2 Hapus Item (cart_rm_)
Dikontrol saat user menekan "🗑️ Hapus / Edit Item" (`cart_edit_list`).
- Callback `cart_rm_{index}` memuat Index mapping.
- Logika: `cart.splice(index, 1)`.
- Jika keranjang mendadak habis isinya (0 element), bot mengarahkan balik interaksi ke menu memilih pelayanan awal (`showServiceList`).

### 9.3 Format Tampilan Cart
Menggunakan helper string manual bernama `formatCart(cart, timezone)` yang loop array lalu dikalikan dan di string-interpolate `Rp x.toLocaleString('id-ID')`.

---

## 10. Idempotency — Cegah Double Insert
> 📁 Sumber: `app/api/telegram/webhook/route.ts`

Bot telah mengadopsi struktur pengamanan Double Tap:
1. **Lapis 1 (`getSession` read)**: Saat `confirm_yes` dikirim, hal PERTAMA yang dilakukan adalah memanggil `getSession`. Jika respon `null` ATAU `.step !== 'confirming'`, bot keluar jalur "⚠️ Transaksi sudah diproses atau sesi habis".
2. **Lapis 2 (`clearSession` wipeout)**: TEPAT SEBELUM logic `insert` dilakukan ke tabel tabel utama Supabase `bookings`, Session db di Delete permanen `await clearSession(chatId, tenant.id);`.
3. **Lapis 3 (Database Write)**: Jika Database lolos, selamat.
4. **Error Recovery**: Jika `supabaseAdmin.from('bookings').insert` Gagal (Network Throw, Trigger error Supabase), bot hanya mengembalikan status error Telegram (Gagal Menyimpan). Note: Saat ini data Cart hangus karena sudah di Clear pada Lapis 2.

---

## 11. NLP Smart Input (Gemini)

### 11.1 Kondisi Aktif
> 📁 Sumber: `app/api/telegram/webhook/route.ts`

- Billing Plan Support = Memanggil `canUseKasir(tenant.plan)`. NLP berstatus menyala otomatis bagi seluruh pengguna berbayar dan `trial`.
- Tergantung juga pada tersedianya sistem `GEMINI_API_KEY`.

### 11.2 Pre-Filter looksLikeOrder
> 📁 Sumber: `lib/nlp-kasir.ts`

Untuk melinduni endpoint LLM yang bisa diserang spam teks bebas, digunakan algoritma ringan boolean `looksLikeOrder(text, barberNames, serviceNames)`:
- Panjang wajib `> 8 chars` dan non-simbol miring.
- Mengandung irisan irisan kata `substring(4)` yang merepresentasikan salah satu object database (layanan / nama kru aktif). Bila tak lolos, reject statis.

### 11.3 Rate Limiter
> 📁 Sumber: `lib/nlp-kasir.ts`

Terdapat memori Node cache Map `lastCallMap`. Hanya dimitasi 1 Tembakan *Prompt AI* per 3 Detik (3000 ms) via chatId.

### 11.4 Integrasi Gemini
> 📁 Sumber: `lib/nlp-kasir.ts`

- Menggunakan `gemini-1.5-flash`.
- Opsi `temperature: 0` agar jawaban tidak terlalu kreatif dan deterministic JSON saja.
- Format disepakati berupa System Prompt tebal yang memberi struktur format `JSON`. Safety filters level dimatikan *(BLOCK_NONE)* agar kata seperti 'Gunting Botak' tidak dibanned model AI salah paham.

### 11.5 Hasil NLP → State Machine
> 📁 Sumber: `app/api/telegram/webhook/route.ts`

Teks dari Gemini menjadi Parsing `nlpResult`.
Jika valid dan lengkap, bot segera melakukan *Jumping* dan memBypass segala menu. Sistem langsung mengisi `upsertSession` ke state `awaiting_payment` dan mengatur `cart[]` otomatis.
Bila bot menemukan ambiguity `"ambiguous_barber": true` (misal di Chat tertulis 'Cukur Reza' dan toko punya *Reza 1* dan *Reza 2*), state dialihkan ke mode nlp_draft + idle agar bisa diseleksi Kapster mana dengan *Callback Keyboard manual*.

### 11.6 Edge Cases
- Tidak Ketemu Layanan: `validatedServices.length === 0`: Menyerah lalu "Tidak menemukan".
- Validation JSON Error: Ter-catch try catch dan melempar instruksi fallback 'Gagal memproses'.
- Pengecekan Range kembali dari `NLP Result`:
  Layanan dinilai harganya dengan rumus absolut di `app/api/telegram/webhook/route.ts`:
  `finalPrice = Math.min(max, Math.max(min, s.fixed_price))`

---

## 12. Callback Reference
> 📁 Sumber: `app/api/telegram/webhook/route.ts`

| Callback Pattern   | Trigger / Fungsi | Handler Pilihan |
|--------------------|-------------------|---------|
| `customer_skip`    | Memilih untuk tidak menginput nama secara harfiah. | Isi state jadi 'Pelanggan Umum' & Pindah menu List. |
| `barber_pick_{id}` | (Kasir Sentral) Memilih Barber target pengerjaan. | Cari Database & isi State `selected_barber_id`. |
| `svc_pick_{id}`    | Barber menekan salah satu tombol paket pelayanan. | Query `service` jika fix masukin `CartItem`, kalau range ke menu selanjutnya. |
| `price_{id}_{amt}` | Opsi Pilihan Harga Range cepat (Min/Tengah/Max). | Parsing String integer lalu Push ke AddToCart Session. |
| `price_custom_{id}`| Pilihan meminta harga bebas pada Menu range. | Edit pesan ke menu Awaiting Price text. |
| `cart_add_more`    | User menyetujui menambahkan pelayanan tambahan. | Memunculkan Layout List Paket lagi. |
| `cart_edit_list`   | User memilih ingin mengubah / menghapus keranjang. | Update Keyboard List Item beserta Array indexnya. |
| `cart_rm_{index}`  | User Delete layanan dalam list array `Cart`. | Lakukan `cart.splice(index)` dan kemaskini total. |
| `cart_back_to_summary` | Kembali dari list penghapusan menu Editor. | Rendering Summary Lanjut Bayar ulang. |
| `cart_checkout`    | Selesai menu Tambah cart (Ke menu metode) | State => `awaiting_payment`. |
| `pay_cash`         | Memilih cash sbg Method | State => `confirming` dengan setup `.payment_method`  |
| `pay_qris`         | Memilih qris sbg Method | State => `confirming` dengan setup `.payment_method` |
| `pay_transfer`     | Memilih tfer sbg Method | State => `confirming` dengan setup `.payment_method` |
| `confirm_yes`      | Transaksi Sah disepakati secara human approval. | Validasi Idempotent, Update/Insert Data di PgSQL. |
| `confirm_cancel`   | Transaksi Berhenti di tengah jalan. | `clearSession()` dan pesan perpisahan. |
| `void_req_{group}` | Menginisiasi Refund Invoice jika direquest <= 5min | Menulis Database Booking status ke `cancelled` |
| `exp_cat_*`        | Pilih kategori pengeluaran | Simpan ke context, pindah step description |
| `exp_skip_receipt` | Lewati upload foto struk | receipt_url = null, tampil ringkasan |
| `exp_confirm_yes`  | Konfirmasi kirim pengajuan | INSERT barber_expenses, notif owner, clear session |
| `exp_confirm_no`   | Batalkan pengajuan | clearSession, pesan batal |
| `exp_cancel`       | Batalkan di tengah alur | clearSession, pesan batal |

---

## 13. Command Reference
> 📁 Sumber: `app/api/telegram/webhook/route.ts`

| Command  | Fungsi | Auth Required |
|----------|--------|---------------|
| `/daftar`| Register Token Hook. Menampilkan UUID Chat Telegram ID | Tidak Perlu |
| `/id`    | Alias kepada Perintah `/daftar`. | Tidak Perlu |
| `/start` | Me-restart ulang semua menu awal ke menu `/kasir`. | Perlu Barber Relational DB. |
| `/kasir` | Pintu Masuk Flow Utama Transaksi (*awaiting_customer*). Menyertakan peringatan jumlah booking online pending hari ini jika pendingCount > 0. Filter: barber melihat miliknya saja, kasir sentral melihat seluruh toko. | Perlu Barber Relational DB. |
| `/pengeluaran` | Membuka alur pencatatan pengeluaran operasional toko. Barber memilih kategori, mengisi keterangan, nominal, dan opsional foto struk. Pengajuan dikirim ke owner untuk disetujui. | Perlu Barber Relational DB |
| `/laporan`| Menampilkan agregasi omset dari tabel Bookings dan Barbers (`today`). Role Kasir mendapatkan toko utuh, Role Barber mendapat shift individu. | Perlu Barber Relational DB. |

---

## 14. Error Handling
- **Session Expire / Tidak ditemui**: Saat payload di ketik tapi session null:
  "⏰ Sesi habis. Ketuk /kasir untuk mulai lagi."
- **Barber yang belum Terdaftar**: Akan di stop oleh middleware detektor ID `.single()`.
  "❌ Akses Ditolak – Akun Telegram."
- **Service tak ditemui pada Payload List Dropdown Cepat**: Akan dikembalikan `⚠️ Belum ada layanan yang tersedia.`
- **Supabase Gagal Insert Record / Constraint Failed**: 
  Tampil: `❌ Gagal menyimpan. Error: <error_message_string>`
- **Double tap Yes Confirm**:
  Session tidak ketemu ditengah jalan (Dianggap kosong oleh sistem). "⚠️ Transaksi sudah diproses...".

---

## 15. Booking Group ID
> 📁 Sumber: `app/api/telegram/webhook/route.ts`

Variabel konstan `groupId` ini diciptakan sebelum Insert Query dengan instansiasi `const groupId = crypto.randomUUID();`.
Tujuan: Saat Kasir memecah 3 Buah `cart[]` service, query PostgreSQL `.insert` menyisipkan *multi-line database rows* (`inserts` map Array). `booking_group_id` menjahit semua row menjadi sebuah satu nomor referensi Resi. Berguna saat pengoperasian fitur *Void* (Pembatalan di chat), di mana callback akan membabat/memfilter row berdasarkan referensi grupnya.

---

## 16. Void / Pembatalan Transaksi
> 📁 Sumber: `app/api/telegram/webhook/route.ts`

Saat Struk Tampil, Tombol *Callback* `void_req_{groupId}` diberikan.
Apabila ditekan, maka:
- Bot memuat query Supabase apakah ada `bookings` atas grup tersebut.
- Bot melacak `Age` Waktu (DateNow - Timestamp).
- Jika **Kurang dari 5 Menit**, Booking langsung update status jadi `cancelled`. Void tabel `booking_voids` di write sebagai *auto_approved*. Transaksi berhasil batal!
- Jika **Melebihi 5 Menit**, *Refund* tertunda. Row `booking_voids` diselipkan dengan status `pending` dan akan melakukan mocking Gateway WA kepada sang Pemilik (Owner) untuk proses moderasi lanjut.

---

## 17. Keterbatasan & Catatan Teknis
- **Satu Node Database**: Saat ini session *Telegram* memanipulasi Local Memory State TTL manual (`getSession`), tidak memanfaatkan Redis. Cukup baik pada skala startup, namun hindari load ribuan pesan asinkon per second (`Race Condition` potensial di tabel auth Supabase).
- **Hard Limit Cart Display**: Menampilkan 16 Item Pertama dari Button Callback Telegram agar tak melebihi grid layout `slice(0,16)`.
- **Tidak Memiliki Fitur Multi-Tenant Timezone Lengkap dalam Laporan Telegram**: Laporan masih sangat mengandalkan script TZ lokal di mana Server / Vercel Host berjalan, biarpun formatReceiptDate ada di Helper, pemanggilan UTC Start-End rentan bergeser pada logika edge case Leap Time / Locale yang langka.
- **Bot Memeriksa Gemin API Setiap Request Text**: Jangan hilangkan `environment env` Gemin.
- **Logika Cart Hapus**: Begitu insert ke supabase, sesi dibersihkan duluan. Data keranjang hilang kalau DB error insert. Workaround ini dimaklumi untuk mencegah duplicate insert jika network Telegram berlipat.
- **Notifikasi Booking Online**: Peringatan booking online disuntikkan secara kondisional — HANYA jika `pendingCount > 0`. Barber dengan jadwal bersih mendapat pesan `/kasir` normal tanpa noise tambahan.

---

## 18. Shared Helper: lib/booking-alerts.ts

**Fungsi**: `countPendingBookings(tenantId, barberId|null, role) → { count, bookings[] }`

**Query**:
- Source: tabel `bookings`
- Filter:
  - `booking_source = 'web'`
  - `status IN ('pending', 'confirmed')`
  - `start_time` antara 00:00 - 23:59 hari ini
  - `tenant_id = tenantId`
  - `barber_id = barberId` (jika role 'barber')

**Digunakan oleh**:
- Injeksi pesan `/kasir` dan `/start` di webhook
- Endpoint `GET /api/pos/pending-bookings`
- Cron `/api/cron/booking-reminder`

---

## 19. Fitur Pengeluaran Operasional

### 19.1 Gambaran Umum
Barber atau Kasir Sentral dapat mencatat pengeluaran operasional toko melalui command `/pengeluaran`. Setiap pengajuan masuk dengan status 'pending' dan membutuhkan persetujuan owner via Admin Panel sebelum dihitung dalam laporan keuangan.

### 19.2 Guard Session
Sistem memeriksa session aktif sebelum memproses `/pengeluaran`:
- Jika step BUKAN dalam `EXPENSE_STEPS` dan BUKAN `idle` → pengajuan ditolak dengan pesan instruksi menyelesaikan kasir dulu.
- `EXPENSE_STEPS`: `['expense_category', 'expense_description', 'expense_amount', 'expense_receipt', 'expense_confirm']`

### 19.3 Tabel barber_expenses (Kolom yang di-insert)
`tenant_id`, `barber_id`, `category`, `description`, `amount`, `receipt_url`, `status`.

### 19.4 Upload Foto Struk
Menggunakan Supabase Storage bucket `expense-receipts` secara public. Path diset berdasarkan `tenant_id/barber_id/timestamp.ext`. Jika lewati struk, kolom di-set null.

### 19.5 Notifikasi Owner
Setelah INSERT berhasil, fungsi `notifyOwnerNewExpense()` di `lib/expense-notify.ts` dipanggil secara non-blocking (`.catch(console.error)`). Telegram (jika bot jalan) dan fallback ke WHATSAPP_SERVICE_URL akan digunakan untuk mengirim pesan approval.

### 19.6 Shared Lib
`lib/expense-notify.ts` berisi:
- `notifyOwnerNewExpense()`: Menarik no WA owner dari `users` via relasi `tenants`, lalu kirim via WA api.
- `notifyBarberExpenseResult()`: Mengambil notifikasi status accepted/rejected ke barber yang mengajukan (dengan fallback prioritas Telegram -> WhatsApp).
