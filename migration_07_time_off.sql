-- Migration: Add time_off table for Shop Holidays & Barber Time Off
-- Description: Menambahkan tabel untuk memblokir jadwal pemesanan

CREATE TABLE IF NOT EXISTS public.time_off (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL, -- REFERENCES public.tenants(id) akan ditambahkan di fase 3
    barber_id UUID NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexing for faster availability queries
CREATE INDEX IF NOT EXISTS idx_time_off_tenant_id ON public.time_off(tenant_id);
CREATE INDEX IF NOT EXISTS idx_time_off_dates ON public.time_off(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_time_off_barber_id ON public.time_off(barber_id);
