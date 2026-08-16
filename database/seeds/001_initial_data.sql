-- =============================================================
-- Seed: Initial Data
-- Jalankan SETELAH semua migrations selesai.
-- Semua INSERT menggunakan ON CONFLICT DO NOTHING agar idempotent.
-- =============================================================

-- Lokasi apartemen contoh (ganti/tambah sesuai kebutuhan)
INSERT INTO public.lokasi_apartemen (name, total_rooms) VALUES
    ('Apartemen A', 0),
    ('Apartemen B', 0)
ON CONFLICT (name) DO NOTHING;

-- Kategori pengeluaran (sudah ada di 003_core_tables, seed ulang agar aman)
INSERT INTO public.pengeluaran_categories (name) VALUES
    ('Operasional'),
    ('Fee Marketing'),
    ('Tagihan Unit'),
    ('Lainnya')
ON CONFLICT (name) DO NOTHING;

-- System settings (sudah ada di 009_system_settings, seed ulang agar aman)
INSERT INTO public.system_settings (key, value, description) VALUES
    ('app_name',            '"Kakarama Room"'::jsonb, 'Nama Aplikasi'),
    ('maintenance_mode',    'false'::jsonb,           'Status Maintenance Mode'),
    ('wa_admin',            '"6289613413636"'::jsonb, 'Nomor WhatsApp Admin'),
    ('global_announcement', '""'::jsonb,              'Pengumuman global')
ON CONFLICT (key) DO UPDATE
    SET description = EXCLUDED.description,
        value       = COALESCE(public.system_settings.value, EXCLUDED.value);
