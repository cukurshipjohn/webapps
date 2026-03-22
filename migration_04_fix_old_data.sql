-- Migration: Auto-backfill tenant_id untuk data Kapster, Layanan, dan Pesanan lama
-- Deskripsi: Menghubungkan data peninggalan sebelum sistem Multi-Tenant (SaaS) diterapkan ke Owner pertama.

DO $$
DECLARE
    first_owner_tenant_id UUID;
BEGIN
    -- 1. Cari tenant_id dari user pertama yang memiliki role 'owner'
    SELECT tenant_id INTO first_owner_tenant_id 
    FROM public.users 
    WHERE role = 'owner' 
    LIMIT 1;
    
    -- Jika owner ditemukan dan punya tenant_id
    IF first_owner_tenant_id IS NOT NULL THEN
        
        -- 2. Update semua Kapster lama yang belum punya toko (tenant_id IS NULL)
        UPDATE public.barbers 
        SET tenant_id = first_owner_tenant_id 
        WHERE tenant_id IS NULL;
        
        -- 3. Update semua Layanan/Services lama yang tenant_id-nya masih kosong
        UPDATE public.services 
        SET tenant_id = first_owner_tenant_id 
        WHERE tenant_id IS NULL;
        
        -- 4. Update semua Pesanan/Bookings lama yang tenant_id-nya masih kosong
        UPDATE public.bookings 
        SET tenant_id = first_owner_tenant_id 
        WHERE tenant_id IS NULL;

        RAISE NOTICE 'Berhasil menghubungkan data lama ke Owner: %', first_owner_tenant_id;
    ELSE
        RAISE NOTICE 'Tidak ada User dengan role Owner yang memiliki tenant_id.';
    END IF;
END $$;
