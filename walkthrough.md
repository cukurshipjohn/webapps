# Panduan Deploy WhatsApp OTP Service ke Render

## File yang Dibuat

| File | Keterangan |
|---|---|
| `whatsapp-service/server.js` | Server Express + Baileys (inti) |
| `whatsapp-service/package.json` | Dependencies microservice |
| `whatsapp-service/.gitignore` | Abaikan session WA & .env |
| `whatsapp-service/.env.example` | Template variabel lingkungan |
| `app/api/auth/request-otp/route.ts` | Generate & kirim OTP |
| `app/api/auth/verify-otp/route.ts` | Verifikasi OTP → JWT |
| `app/login/page.tsx` | UI login 2 langkah |

---

## Langkah 1 — Tambah Tabel di Supabase

Jalankan SQL ini di **Supabase SQL Editor**:

```sql
CREATE TABLE public.otp_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policy
ALTER TABLE public.otp_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access - otp_sessions"
  ON public.otp_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
```

---

## Langkah 2 — Deploy ke Render

1. Buat repository GitHub baru **khusus** untuk `whatsapp-service/`  
   *(copy isi folder `whatsapp-service` ke repo baru tersebut)*
2. Buka [render.com](https://render.com) → **New Web Service**
3. Pilih repo GitHub Anda
4. Setting:
   - **Runtime:** Node
   - **Build Command:** `npm install --legacy-peer-deps`
   - **Start Command:** `node server.js`
5. Tambah **Environment Variables** di Render:
   ```
   ALLOWED_ORIGIN   = https://url-nextjs-anda.vercel.app
   INTERNAL_SECRET  = (string acak panjang, sama dengan di Next.js)
   ```
6. Klik **Deploy**

---

## Langkah 3 — Scan QR Code

Setelah deploy selesai, buka **Render → Logs**:

1. Tunggu sampai muncul QR Code berbentuk kotak ASCII di log
2. Buka WhatsApp di HP Anda → **Perangkat Tertaut** → **Tautkan Perangkat**
3. Scan QR tersebut
4. Tunggu log konfirmasi: `✅ WhatsApp berhasil terkoneksi!`

> [!IMPORTANT]
> QR Code hanya berlaku ~60 detik. Jika expired, Render akan auto-generate QR baru. Ulangi scan.

---

## Langkah 4 — Konfigurasi Next.js

Update `.env.local` di project Next.js:

```env
WHATSAPP_SERVICE_URL=https://nama-service-anda.onrender.com
WHATSAPP_SERVICE_SECRET=secret_yang_sama_seperti_di_render
```

Lalu redeploy Next.js ke Vercel.

---

## Langkah 5 — Setup UptimeRobot (Agar Tidak Sleep)

1. Daftar gratis di [uptimerobot.com](https://uptimerobot.com)
2. **New Monitor** → HTTP(s)
3. URL: `https://nama-service-anda.onrender.com/health`
4. Interval: **5 minutes**
5. Aktifkan

Selesai! Server tidak akan pernah tidur.

---

## Alur Login Setelah Deploy

```
1. User buka /login → masukkan nomor HP
2. Klik "Kirim OTP via WhatsApp"
3. Next.js → simpan OTP ke Supabase → panggil Render service
4. Render service kirim pesan WA: "Kode OTP: 847291"
5. User masukkan 6 digit di browser
6. Next.js verifikasi → terbitkan JWT → redirect ke home
```
