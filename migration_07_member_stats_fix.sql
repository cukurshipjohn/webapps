-- ══════════════════════════════════════════════════════════════
-- migration_07_member_stats_fix.sql
-- CukurShip — Rekonsiliasi Statistik Member (2 Jalur Transaksi)
-- Jalankan di: Supabase Dashboard > SQL Editor
-- ══════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- STEP 1: Tambah kolom phone di tabel customers
-- Dipakai sebagai jembatan rekonsiliasi:
--   bookings.user_id (online) ↔ bookings.customer_id (POS walk-in)
-- ────────────────────────────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_phone
  ON customers(phone)
  WHERE phone IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- STEP 2: Perbaiki CHECK CONSTRAINT booking_source
--   Nilai lama : hanya 'web' dan 'telegram_walk_in'
--   Nilai baru : tambah 'web_pos' agar Web POS punya source sendiri
--   Pemisahan ini krusial agar data online booking TIDAK campur
--   dengan data POS walk-in di laporan & statistik member.
-- ────────────────────────────────────────────────────────────
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_booking_source_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_booking_source_check
  CHECK (booking_source IN (
    'web',              -- Online Booking via portal pelanggan
    'telegram_walk_in', -- Walk-in via Bot Telegram Kasir
    'web_pos'           -- Walk-in via Web POS Kasir (browser)
  ));

-- ────────────────────────────────────────────────────────────
-- STEP 3: Buat VIEW member_visit_stats
-- Menjadi SATU-SATUNYA sumber kebenaran statistik kunjungan member.
--
-- Logika rekonsiliasi:
--   Hitung booking_group_id unik dengan status = 'completed'
--   dimana booking tersebut:
--     - MILIK user ini via user_id = u.id  (jalur Online Booking), ATAU
--     - Terhubung ke customer walk-in yang phone-nya cocok (jalur POS)
--
-- Hasilnya: member yang walk-in pakai nomor HP yang sama dengan
-- akun online-nya akan dihitung SATU statistik yang utuh.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW member_visit_stats AS
SELECT
  u.id    AS user_id,
  u.phone AS user_phone,

  COUNT(DISTINCT b.booking_group_id)
    FILTER (WHERE b.status = 'completed'
      AND (b.user_id = u.id
        OR (b.customer_id IS NOT NULL
            AND c.phone = u.phone
            AND u.phone IS NOT NULL)))
    AS total_visits,

  COALESCE(SUM(b.final_price)
    FILTER (WHERE b.status = 'completed'
      AND (b.user_id = u.id
        OR (b.customer_id IS NOT NULL
            AND c.phone = u.phone
            AND u.phone IS NOT NULL))), 0)
    AS total_spent,

  MAX(b.created_at)
    FILTER (WHERE b.status = 'completed'
      AND (b.user_id = u.id
        OR (b.customer_id IS NOT NULL
            AND c.phone = u.phone
            AND u.phone IS NOT NULL)))
    AS last_visit_at

FROM users u

LEFT JOIN bookings b
  ON b.user_id = u.id
  OR b.customer_id IN (
      SELECT id FROM customers
      WHERE phone = u.phone
        AND phone IS NOT NULL)

LEFT JOIN customers c ON c.id = b.customer_id

WHERE u.role = 'customer'
GROUP BY u.id, u.phone;

-- ────────────────────────────────────────────────────────────
-- STEP 4: Deprecated kolom naif (tanpa DROP agar tidak breaking)
-- ────────────────────────────────────────────────────────────
COMMENT ON COLUMN customers.total_visits IS
  'DEPRECATED — Jangan gunakan untuk statistik member. Gunakan VIEW member_visit_stats sebagai gantinya.';

COMMENT ON COLUMN customers.last_visit_at IS
  'DEPRECATED — Gunakan VIEW member_visit_stats.last_visit_at sebagai gantinya.';

-- ────────────────────────────────────────────────────────────
-- VERIFIKASI (uncomment untuk test)
-- ────────────────────────────────────────────────────────────
-- SELECT * FROM member_visit_stats LIMIT 10;
-- SELECT booking_source, COUNT(*) FROM bookings GROUP BY booking_source;
