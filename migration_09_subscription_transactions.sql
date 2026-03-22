-- =============================================================
-- Migration 09: Subscription Transactions Table
-- Jalankan di Supabase SQL Editor
-- =============================================================

CREATE TABLE IF NOT EXISTS subscription_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  midtrans_order_id TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL,                    -- 'starter' | 'pro' | 'business'
  amount INT NOT NULL,
  status TEXT DEFAULT 'pending',         -- 'pending' | 'paid' | 'failed' | 'expired'
  paid_at TIMESTAMPTZ,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk query cepat di billing history
CREATE INDEX IF NOT EXISTS idx_sub_transactions_tenant ON subscription_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sub_transactions_status ON subscription_transactions(status);

-- RLS
ALTER TABLE subscription_transactions ENABLE ROW LEVEL SECURITY;

-- Hanya row milik tenant yang sama yang bisa dibaca (via service role karena kita gunakan supabaseAdmin)
-- Edge function dan webhooks menggunakan service role, jadi RLS tidak memblokir mereka
CREATE POLICY "tenant_can_view_own_transactions"
  ON subscription_transactions FOR SELECT
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));
