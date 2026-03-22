-- Migration: Update barbers table for Phase 1B
-- Description: Menambahkan kolom yang dibutuhkan untuk fitur SaaS Multi-tenant dan Foto Kapster

-- 1. Tambahkan kolom photo_url untuk menyimpan link foto dari Storage
ALTER TABLE public.barbers 
ADD COLUMN photo_url TEXT NULL;

-- 2. Tambahkan kolom tenant_id untuk mengisolasi data kapster barbershop Anda dari kapster barbershop lain
-- Tipe is UUID, nullable sementara agar tidak error jika ada data kapster lama
ALTER TABLE public.barbers 
ADD COLUMN tenant_id UUID NULL;

-- Opsional: Buat index untuk mempercepat pencarian data kapster berdasarkan tenant
CREATE INDEX IF NOT EXISTS idx_barbers_tenant_id ON public.barbers(tenant_id);

-- 3. (OPSIONAL TAPI PENTING) 
-- SETELAH Anda menjalankan script ini, jika Anda memiliki data kapster LAMA, 
-- Anda harus mengisi `tenant_id` mereka dengan ID Anda agar mereka muncul di Dashboard Admin Anda.
-- Contoh:
-- UPDATE public.barbers SET tenant_id = 'c41f6e24-4f05-4c07-b3e3-78b1f8bd4b67' WHERE tenant_id IS NULL;
