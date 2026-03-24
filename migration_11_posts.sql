-- Migration 11: Posts System untuk setiap Barbershop Tenant
-- Jalankan di Supabase SQL Editor

CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'info',
  -- 'promo' | 'info' | 'status' | 'event'
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  image_url TEXT,
  cta_label TEXT,
  cta_url TEXT,
  promo_code TEXT,
  promo_discount_percent INT,
  is_pinned BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT true,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk performa query publik
CREATE INDEX idx_posts_tenant_published ON posts(tenant_id, is_published, published_at DESC);

-- RLS (konsisten dengan tabel lain)
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation on posts"
ON posts FOR ALL
USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
