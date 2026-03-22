-- Migration: Create tenants table & Multi-tenancy Infrastructure
-- Description: Implement RLS and Tenant ID relations for Phase 3A

-- 1. Create `tenants` table
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  shop_name TEXT NOT NULL,
  owner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  plan TEXT DEFAULT 'trial',  -- 'trial' | 'starter' | 'pro' | 'business'
  plan_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  max_barbers INT DEFAULT 2,
  max_bookings_per_month INT DEFAULT 50,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Data Migration (Backfill Default Tenant)
-- Insert standard default tenant FIRST sebelum membuat konstrain foreign key
INSERT INTO public.tenants (id, slug, shop_name) 
VALUES ('c41f6e24-4f05-4c07-b3e3-78b1f8bd4b67', 'john-cukurship', 'John CukurShip')
ON CONFLICT (slug) DO NOTHING;

-- Pastikan tabel-tabel lain menggunakan tenant_id default jika masih kosong (NULL)
-- Atau jika mereka sudah memiliki tenant_id ini, relasi FK nantinya akan langsung valid
UPDATE public.users SET tenant_id = 'c41f6e24-4f05-4c07-b3e3-78b1f8bd4b67' WHERE tenant_id IS NULL;
UPDATE public.barbers SET tenant_id = 'c41f6e24-4f05-4c07-b3e3-78b1f8bd4b67' WHERE tenant_id IS NULL;
UPDATE public.services SET tenant_id = 'c41f6e24-4f05-4c07-b3e3-78b1f8bd4b67' WHERE tenant_id IS NULL;
UPDATE public.bookings SET tenant_id = 'c41f6e24-4f05-4c07-b3e3-78b1f8bd4b67' WHERE tenant_id IS NULL;

-- 3. Add Foreign Key constraints to existing tables
-- Karena Data Tenant sudah dimasukkan, maka mengecek konstrain sekarang akan berhasil.
ALTER TABLE public.users 
  ADD CONSTRAINT fk_user_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE public.barbers 
  ADD CONSTRAINT fk_barber_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE public.services 
  ADD CONSTRAINT fk_service_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE public.bookings 
  ADD CONSTRAINT fk_booking_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE public.tenant_settings 
  ADD CONSTRAINT fk_tenant_config FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE public.time_off 
  ADD CONSTRAINT fk_timeoff_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_off ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 5. Create Helper Function to extract tenant_id securely from Custom JWT claims
-- Because Supabase uses REST (PostgREST), the "SET LOCAL" method is not stateless.
-- The officially supported, secure way to pass tenant_id from Server to Supabase is by injecting it into a JWT.
CREATE OR REPLACE FUNCTION public.get_tenant_id_from_jwt()
RETURNS uuid
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN (current_setting('request.jwt.claims', true)::json->'app_metadata'->>'tenant_id')::uuid;
END;
$$;

-- 6. Create RLS Policies
-- Barbers
DROP POLICY IF EXISTS "tenant_isolation_barbers" ON public.barbers;
CREATE POLICY "tenant_isolation_barbers" ON public.barbers
  FOR ALL USING (tenant_id = public.get_tenant_id_from_jwt());

-- Services
DROP POLICY IF EXISTS "tenant_isolation_services" ON public.services;
CREATE POLICY "tenant_isolation_services" ON public.services
  FOR ALL USING (tenant_id = public.get_tenant_id_from_jwt());

-- Bookings
DROP POLICY IF EXISTS "tenant_isolation_bookings" ON public.bookings;
CREATE POLICY "tenant_isolation_bookings" ON public.bookings
  FOR ALL USING (tenant_id = public.get_tenant_id_from_jwt());

-- Tenant Settings
DROP POLICY IF EXISTS "tenant_isolation_settings" ON public.tenant_settings;
CREATE POLICY "tenant_isolation_settings" ON public.tenant_settings
  FOR ALL USING (tenant_id = public.get_tenant_id_from_jwt());

-- Time Off
DROP POLICY IF EXISTS "tenant_isolation_time_off" ON public.time_off;
CREATE POLICY "tenant_isolation_time_off" ON public.time_off
  FOR ALL USING (tenant_id = public.get_tenant_id_from_jwt());

-- Users
DROP POLICY IF EXISTS "tenant_isolation_users" ON public.users;
CREATE POLICY "tenant_isolation_users" ON public.users
  FOR ALL USING (tenant_id = public.get_tenant_id_from_jwt() OR public.get_tenant_id_from_jwt() IS NULL); 
  -- Users policy might need adjustment to let superadmins see all users or allow initial login.
