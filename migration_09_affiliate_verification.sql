-- migration_09_affiliate_verification.sql

-- 1. Tambah kolom untuk verifikasi nomor WA
ALTER TABLE affiliates 
ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;

-- 2. Jika sebelumnya tabel diproteksi oleh CHECK constraint pada kolom "status",
-- kita hapus constraint tersebut agar bisa menampung 'unverified'.
-- Jika tidak ada constraint, drop ini akan diabaikan (karena IF EXISTS tidak disupport DROP CONSTRAINT di bbrp versi PG jadi kita pakai blok DO)
DO $$
DECLARE
    row record;
BEGIN
    FOR row IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'affiliates'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%status%'
    LOOP
        EXECUTE 'ALTER TABLE affiliates DROP CONSTRAINT ' || quote_ident(row.conname);
    END LOOP;
END;
$$;

-- 3. Tambahkan constraint baru yang mencakup 'unverified'
ALTER TABLE affiliates
ADD CONSTRAINT affiliates_status_check 
CHECK (status IN ('unverified', 'pending', 'active', 'suspended'));
