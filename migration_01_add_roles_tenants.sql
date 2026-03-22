-- Migration: Add role and tenant_id to users table
-- Description: Supports multi-tenant SaaS setup

-- 1. Add 'role' column
-- Type is TEXT with default 'customer'
-- Valid values should be 'customer', 'owner', 'superadmin'
ALTER TABLE public.users 
ADD COLUMN role TEXT DEFAULT 'customer' NOT NULL;

-- Add a check constraint to ensure only valid roles are inserted
ALTER TABLE public.users 
ADD CONSTRAINT check_valid_role CHECK (role IN ('customer', 'owner', 'superadmin'));

-- 2. Add 'tenant_id' column
-- Type is UUID, nullable. (Foreign key to a tenants/barbershops table will be added in phase 3)
ALTER TABLE public.users 
ADD COLUMN tenant_id UUID NULL;

-- Optional: Create an index on tenant_id for faster lookups later when filtering users by tenant
CREATE INDEX idx_users_tenant_id ON public.users(tenant_id);
