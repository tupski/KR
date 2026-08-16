-- =============================================================
-- Migration 009: System Settings
-- =============================================================

CREATE TABLE IF NOT EXISTS public.system_settings (
    key         TEXT PRIMARY KEY,
    value       JSONB,
    description TEXT,
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Seed default settings.
-- ON CONFLICT: update description only; jaga value yang sudah ada.
INSERT INTO public.system_settings (key, value, description) VALUES
    ('app_name',             '"Kakarama Room"'::jsonb,  'Nama Aplikasi'),
    ('maintenance_mode',     'false'::jsonb,            'Status Maintenance Mode'),
    ('wa_admin',             '"6289613413636"'::jsonb,  'Nomor WhatsApp Admin'),
    ('global_announcement',  '""'::jsonb,               'Pengumuman global')
ON CONFLICT (key) DO UPDATE
    SET description = EXCLUDED.description,
        value       = COALESCE(public.system_settings.value, EXCLUDED.value);
