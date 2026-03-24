-- Add multi-tenant WhatsApp session tracking to tenant_settings table
ALTER TABLE tenant_settings 
ADD COLUMN IF NOT EXISTS wa_session_id TEXT UNIQUE;

ALTER TABLE tenant_settings 
ADD COLUMN IF NOT EXISTS wa_session_status TEXT DEFAULT 'disconnected';

ALTER TABLE tenant_settings 
ADD COLUMN IF NOT EXISTS wa_phone_connected TEXT;
