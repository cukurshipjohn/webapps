-- migration_08_barber_expenses.sql

-- Tabel utama pengeluaran
CREATE TABLE IF NOT EXISTS barber_expenses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  barber_id        UUID NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  category         TEXT NOT NULL CHECK (category IN ('supplies', 'utility', 'other')),
  description      TEXT NOT NULL,
  amount           INT  NOT NULL CHECK (amount > 0),
  receipt_url      TEXT,          -- NULL jika tidak upload
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,          -- Wajib diisi saat reject
  submitted_at     TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at      TIMESTAMPTZ,   -- Di-set saat approve/reject
  reviewed_by      UUID           -- ID owner yang review (dapat NULL)
                     REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_status
  ON barber_expenses(tenant_id, status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_barber
  ON barber_expenses(barber_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_pending
  ON barber_expenses(tenant_id, submitted_at DESC)
  WHERE status = 'pending';
