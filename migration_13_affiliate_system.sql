-- migration_13_affiliate_system.sql

-- Tambah kolom referred_by_code di tenants
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS referred_by_code TEXT;

-- Tambah discount_percent & original_amount ke subscription_transactions
ALTER TABLE subscription_transactions
ADD COLUMN IF NOT EXISTS discount_percent INT DEFAULT 0;

ALTER TABLE subscription_transactions
ADD COLUMN IF NOT EXISTS original_amount INT;

-- TABEL 1: Data affiliator
CREATE TABLE IF NOT EXISTS affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  referral_code TEXT NOT NULL UNIQUE,
  
  tier TEXT NOT NULL DEFAULT 'referral',
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  commission_type TEXT NOT NULL DEFAULT 'one_time',
  status TEXT NOT NULL DEFAULT 'pending',
  
  bank_name TEXT,
  bank_account_number TEXT,
  bank_account_name TEXT,
  
  total_clicks INT DEFAULT 0,
  total_referrals INT DEFAULT 0,
  total_paid_referrals INT DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABEL 2: Tracking klik link referral
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  landing_page TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  converted BOOLEAN DEFAULT false,
  converted_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  clicked_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABEL 3: Hubungan tenant dengan affiliator
CREATE TABLE IF NOT EXISTS affiliate_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'registered',
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  first_paid_at TIMESTAMPTZ,
  UNIQUE(tenant_id)
);

-- TABEL 4: Komisi per transaksi
CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  referral_id UUID NOT NULL REFERENCES affiliate_referrals(id) ON DELETE RESTRICT,
  transaction_id UUID REFERENCES subscription_transactions(id) ON DELETE SET NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  amount NUMERIC(12,2) NOT NULL,
  commission_rate NUMERIC(5,2) NOT NULL,
  transaction_amount INT NOT NULL,
  
  type TEXT NOT NULL DEFAULT 'subscription',
  status TEXT NOT NULL DEFAULT 'pending',
  
  available_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- TABEL 5: Request pencairan komisi
CREATE TABLE IF NOT EXISTS affiliate_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  bank_name TEXT NOT NULL,
  bank_account_number TEXT NOT NULL,
  bank_account_name TEXT NOT NULL,
  admin_notes TEXT,
  transfer_proof_url TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  commission_ids UUID[],
  CONSTRAINT minimum_withdrawal CHECK (amount >= 50000)
);

-- INDEX untuk performa
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_affiliate_id ON affiliate_clicks(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_clicked_at ON affiliate_clicks(clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_affiliate_id ON affiliate_commissions(affiliate_id, status);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_created_at ON affiliate_commissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_affiliate_id ON affiliate_referrals(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_referral_code ON affiliates(referral_code);
