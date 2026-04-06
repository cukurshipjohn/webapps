-- =============================================================
-- Migration 14: Add Missing Billing Columns
-- Jalankan di Supabase SQL Editor
-- =============================================================
-- Kolom di tabel `tenants` yang dibutuhkan webhook Midtrans & billing status API

-- 1. billing_cycle (menentukan apakah paket bulanan atau tahunan)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly';

-- 2. subdomain_revisions_remaining (jatah revisi subdomain per paket tahunan)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS subdomain_revisions_remaining INT DEFAULT 0;

-- 3. custom_slug (subdomain kustom yang dipilih owner, bisa NULL)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS custom_slug TEXT;

-- 4. effective_slug (slug aktif yang dipakai untuk routing — default ke slug awal)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS effective_slug TEXT;

-- Backfill effective_slug dari slug jika masih NULL
UPDATE public.tenants
  SET effective_slug = slug
  WHERE effective_slug IS NULL;

-- =============================================================
-- Kolom di tabel `subscription_transactions` yang dibutuhkan billing API
-- =============================================================

-- 5. billing_cycle
ALTER TABLE public.subscription_transactions
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly';

-- 6. discount_percent (persentase diskon, 0 untuk paket non-promo)
ALTER TABLE public.subscription_transactions
  ADD COLUMN IF NOT EXISTS discount_percent INT DEFAULT 0;

-- 7. original_amount (harga asli sebelum diskon, NULL jika tidak ada diskon)
ALTER TABLE public.subscription_transactions
  ADD COLUMN IF NOT EXISTS original_amount INT;
