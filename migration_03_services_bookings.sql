-- Migration: Update services and bookings tables for Phase 1C
-- Description: Menambahkan kolom tenant_id untuk isolasi data dan tipe layanan (BARBERSHOP/HOME)

-- 1. Tabel Services (Layanan)
-- Tambahkan tenant_id agar setiap barbershop punya list layanannya sendiri
ALTER TABLE public.services 
ADD COLUMN IF NOT EXISTS tenant_id UUID NULL;

-- Opsional: tipe layanan sebenarnya sudah dibedakan prefix namanya "BARBER |" atau "HOME |",
-- Tapi untuk filtering yang lebih rapi di code, kita tambahkan kolom eksplisit.
ALTER TABLE public.services 
ADD COLUMN IF NOT EXISTS service_type TEXT DEFAULT 'BARBERSHOP';

CREATE INDEX IF NOT EXISTS idx_services_tenant_id ON public.services(tenant_id);

-- 2. Tabel Bookings (Pesanan)
-- Tambahkan tenant_id ke bookings agar admin toko A hanya melihat booking toko A
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS tenant_id UUID NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_tenant_id ON public.bookings(tenant_id);

-- 3. Mengisi data lama (Data Backfill)
-- Jika Anda sudah punya data existing, jalankan ini agar data lama tersebut
-- masuk ke tenant Anda:
-- UPDATE public.services SET tenant_id = 'c41f6e24-4f05-4c07-b3e3-78b1f8bd4b67' WHERE tenant_id IS NULL;
-- UPDATE public.bookings SET tenant_id = 'c41f6e24-4f05-4c07-b3e3-78b1f8bd4b67' WHERE tenant_id IS NULL;
-- (Ganti UUID di atas dengan ID Anda jika ini adalah environment staging/prod yang sudah berjalan)
