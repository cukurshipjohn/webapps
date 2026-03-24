-- Migration 12: Notification Logs untuk WA Blast System
-- Jalankan di Supabase SQL Editor

CREATE TABLE notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'sent',  -- 'sent' | 'failed'
  UNIQUE(post_id, user_id)     -- satu user hanya dapat 1 notif per post
);

-- Index untuk query stat cepat
CREATE INDEX idx_notif_logs_post ON notification_logs(post_id, status);
CREATE INDEX idx_notif_logs_tenant ON notification_logs(tenant_id, sent_at DESC);

-- RLS
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation on notification_logs"
ON notification_logs FOR ALL
USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
