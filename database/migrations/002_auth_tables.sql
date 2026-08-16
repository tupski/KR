-- =============================================================
-- Migration 002: Auth Tables (pengganti auth.users Supabase)
-- Harus dijalankan SEBELUM 003_core_tables.sql karena tabel lain
-- FK ke public.users
-- =============================================================

-- Tabel: users (pengganti auth.users Supabase)
CREATE TABLE IF NOT EXISTS public.users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email        TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- Tabel: user_profiles
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id         UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    email      TEXT NOT NULL,
    full_name  TEXT,
    phone      TEXT,
    gender     VARCHAR(20),
    role       TEXT DEFAULT 'karyawan',
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabel: user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id    UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    role       TEXT NOT NULL DEFAULT 'karyawan',
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Tabel: sessions (pengganti auth.sessions Supabase)
CREATE TABLE IF NOT EXISTS public.sessions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    refresh_token TEXT UNIQUE NOT NULL,
    device_info   JSONB DEFAULT '{}'::jsonb,
    expires_at    TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT now() NOT NULL,
    last_used_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id        ON public.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token  ON public.sessions(refresh_token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at     ON public.sessions(expires_at);

-- =============================================================
-- Helper functions: role checks (tanpa auth.uid())
-- =============================================================

-- Cek apakah user adalah super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p_user_id
          AND ur.role = 'super_admin'
    );
$$;

-- Cek apakah user adalah admin atau super_admin
CREATE OR REPLACE FUNCTION public.is_admin_or_super(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p_user_id
          AND ur.role IN ('admin', 'super_admin')
    );
$$;
