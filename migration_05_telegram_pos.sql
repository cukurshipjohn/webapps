-- Migration: Update barbers and bookings tables for Telegram POS
-- Description: Menambahkan kolom integrasi bot Telegram pada staf (kapster) dan melacak sumber transaksi POS.

-- 1. Tabel Barbers (Staf / Kapster)
-- Tambahkan ID unik chat Telegram dan username
ALTER TABLE public.barbers 
ADD COLUMN IF NOT EXISTS telegram_username TEXT NULL,
ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT NULL;

-- Memastikan tidak ada dua kapster yang mendaftarkan chat_id Telegram yang sama di seluruh platform
CREATE UNIQUE INDEX IF NOT EXISTS idx_barbers_telegram_chat_id 
ON public.barbers(telegram_chat_id) 
WHERE telegram_chat_id IS NOT NULL;

-- 2. Tabel Bookings (Transaksi)
-- Lacak asal transaksi (Web vs Telegram Walk-in)
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS booking_source TEXT DEFAULT 'web' CHECK (booking_source IN ('web', 'telegram_walk_in')),
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';

-- 3. Mengizinkan walk-in (tanpa user authentication)
ALTER TABLE public.bookings 
ALTER COLUMN user_id DROP NOT NULL;

-- Opsi Backfill:
-- UPDATE public.bookings SET booking_source = 'web', payment_status = 'pending' WHERE booking_source IS NULL;
