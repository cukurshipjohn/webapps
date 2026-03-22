-- Migration 06: Tambahan Dukungan Warna Gradien untuk Tenant
-- Menambahkan kolom color_secondary dan use_gradient pada tabel tenant_settings

ALTER TABLE tenant_settings
ADD COLUMN color_secondary TEXT DEFAULT '#D97706', -- amber-600 default
ADD COLUMN use_gradient BOOLEAN DEFAULT false;     -- secara bawaan mati (solid)
