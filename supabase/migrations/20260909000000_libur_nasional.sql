-- Migration: Tabel libur nasional
-- Jalankan: supabase migration new create_libur_nasional

CREATE TABLE IF NOT EXISTS public.libur_nasional (
    id BIGSERIAL PRIMARY KEY,
    tanggal DATE NOT NULL UNIQUE,
    nama VARCHAR(255) NOT NULL,
    tipe VARCHAR(50) DEFAULT 'holiday', -- 'holiday' | 'cuti_bersama' | 'libur_agama'
    sumber VARCHAR(50) DEFAULT 'api',   -- 'api' | 'manual'
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_libur_nasional_tanggal ON public.libur_nasional(tanggal);

-- RLS: semua user authenticated bisa baca, hanya admin/super_admin yang bisa write
ALTER TABLE public.libur_nasional ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "libur_nasional_select_authenticated" ON public.libur_nasional;
CREATE POLICY "libur_nasional_select_authenticated" ON public.libur_nasional
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "libur_nasional_write_admin" ON public.libur_nasional;
CREATE POLICY "libur_nasional_write_admin" ON public.libur_nasional
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
              AND role IN ('admin', 'super_admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
              AND role IN ('admin', 'super_admin')
        )
    );

-- Trigger updated_at (handle_updated_at sudah didefinisikan di schema.sql)
DROP TRIGGER IF EXISTS trigger_libur_nasional_updated_at ON public.libur_nasional;
CREATE TRIGGER trigger_libur_nasional_updated_at
    BEFORE UPDATE ON public.libur_nasional
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();