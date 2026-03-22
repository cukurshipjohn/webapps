-- Migration: Membuat tabel tenant_settings untuk fitur White-label SaaS

CREATE TABLE IF NOT EXISTS public.tenant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID UNIQUE NOT NULL,   -- REFERENCES tenants(id) saat kita buat di fase selanjutnya
  shop_name TEXT NOT NULL DEFAULT 'My Barbershop',
  shop_tagline TEXT DEFAULT 'Tampil Kece, Harga Terjangkau',
  logo_url TEXT,
  hero_image_url TEXT,
  color_primary TEXT DEFAULT '#F59E0B',      -- amber-500 default
  color_primary_hover TEXT DEFAULT '#D97706', -- amber-600 default
  color_background TEXT DEFAULT '#0A0A0A',   -- neutral-950 default
  color_surface TEXT DEFAULT '#171717',       -- neutral-900 (card background)
  color_accent TEXT DEFAULT '#FFFFFF',        -- teks utama
  font_choice TEXT DEFAULT 'modern',          -- 'modern' | 'classic' | 'bold'
  whatsapp_owner TEXT,
  operating_open TIME DEFAULT '10:00',
  operating_close TIME DEFAULT '20:30',
  is_home_service_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger untuk update timestamp
CREATE OR REPLACE FUNCTION set_current_timestamp_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_tenant_settings_updated_at ON public.tenant_settings;
CREATE TRIGGER set_tenant_settings_updated_at
BEFORE UPDATE ON public.tenant_settings
FOR EACH ROW
EXECUTE FUNCTION set_current_timestamp_updated_at();

-- RLS (Row Level Security) - Nantinya hanya owner tenant yang bisa ubah
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

-- Untuk sekarang, disable sementara agar testing gampang (hingga Auth RLS Supabase fully set)
CREATE POLICY "Enable all access for now" ON public.tenant_settings FOR ALL USING (true) WITH CHECK (true);
