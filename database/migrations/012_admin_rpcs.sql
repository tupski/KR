-- =============================================================
-- Migration 012: Admin RPCs
-- Requires: 002_auth_tables.sql (public.users, public.user_roles,
--           public.user_profiles, public.sessions, public.is_super_admin)
--
-- PERUBAHAN vs Supabase:
--   - Tidak ada INSERT ke auth.users (tidak ada Supabase Auth)
--   - Tidak ada auth.uid() — semua pakai p_caller_id uuid eksplisit
--   - Password di-hash di application layer sebelum dikirim ke RPC
--   - admin_sign_out_user: DELETE dari public.sessions (bukan auth.sessions)
--   - sign_out_own_devices: pakai p_user_id eksplisit
-- =============================================================

-- =============================================================
-- RPC: admin_create_user
-- Buat user baru di public.users + public.user_roles + public.user_profiles
-- Hanya bisa dipanggil oleh super_admin
-- p_password_hash: password sudah di-hash di application layer (bcrypt)
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_create_user(
    p_caller_id    uuid,
    p_email        text,
    p_password_hash text,
    p_full_name    text,
    p_phone        text,
    p_gender       text,
    p_role         text
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id uuid;
BEGIN
    IF NOT public.is_super_admin(p_caller_id) THEN
        RAISE EXCEPTION 'Akses ditolak. Hanya Super Admin yang dapat membuat user.';
    END IF;

    -- Validasi role
    IF p_role NOT IN ('karyawan', 'admin', 'super_admin') THEN
        RAISE EXCEPTION 'Role tidak valid: %', p_role;
    END IF;

    -- Insert user
    INSERT INTO public.users (email, password_hash)
    VALUES (p_email, p_password_hash)
    RETURNING id INTO v_user_id;

    -- Insert role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, p_role)
    ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = now();

    -- Insert profile
    INSERT INTO public.user_profiles (id, email, full_name, phone, gender, role)
    VALUES (v_user_id, p_email, p_full_name, p_phone, p_gender, p_role)
    ON CONFLICT (id) DO UPDATE SET
        full_name  = EXCLUDED.full_name,
        phone      = EXCLUDED.phone,
        gender     = EXCLUDED.gender,
        role       = EXCLUDED.role,
        updated_at = now();

    RETURN v_user_id;
END;
$$;

-- =============================================================
-- RPC: admin_update_user
-- Update profil dan role user. Hanya super_admin.
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_update_user(
    p_caller_id      uuid,
    p_target_user_id uuid,
    p_full_name      text,
    p_phone          text,
    p_gender         text,
    p_role           text
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT public.is_super_admin(p_caller_id) THEN
        RAISE EXCEPTION 'Akses ditolak. Hanya Super Admin yang dapat mengubah user.';
    END IF;

    IF p_role NOT IN ('karyawan', 'admin', 'super_admin') THEN
        RAISE EXCEPTION 'Role tidak valid: %', p_role;
    END IF;

    UPDATE public.user_profiles
    SET
        full_name  = p_full_name,
        phone      = p_phone,
        gender     = p_gender,
        role       = p_role,
        updated_at = now()
    WHERE id = p_target_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User tidak ditemukan: %', p_target_user_id;
    END IF;

    -- Upsert role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_target_user_id, p_role)
    ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = now();

    RETURN true;
END;
$$;

-- =============================================================
-- RPC: admin_delete_user
-- Hapus user beserta semua data terkait (CASCADE). Hanya super_admin.
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_delete_user(
    p_caller_id      uuid,
    p_target_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT public.is_super_admin(p_caller_id) THEN
        RAISE EXCEPTION 'Akses ditolak. Hanya Super Admin yang dapat menghapus user.';
    END IF;

    -- Jangan hapus diri sendiri
    IF p_caller_id = p_target_user_id THEN
        RAISE EXCEPTION 'Tidak dapat menghapus akun sendiri.';
    END IF;

    DELETE FROM public.users WHERE id = p_target_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User tidak ditemukan: %', p_target_user_id;
    END IF;

    RETURN true;
END;
$$;

-- =============================================================
-- RPC: admin_sign_out_user
-- Cabut semua sesi user target (hapus dari public.sessions).
-- Hanya super_admin.
-- PERUBAHAN: DELETE dari public.sessions bukan auth.sessions
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_sign_out_user(
    p_caller_id      uuid,
    p_target_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT public.is_super_admin(p_caller_id) THEN
        RAISE EXCEPTION 'Akses ditolak. Hanya Super Admin yang dapat logout user.';
    END IF;

    DELETE FROM public.sessions WHERE user_id = p_target_user_id;

    RETURN true;
END;
$$;

-- =============================================================
-- RPC: sign_out_own_devices
-- User mencabut semua sesi miliknya sendiri.
-- PERUBAHAN: pakai p_user_id eksplisit (tidak pakai auth.uid())
-- =============================================================
CREATE OR REPLACE FUNCTION public.sign_out_own_devices(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM public.sessions WHERE user_id = p_user_id;
    RETURN true;
END;
$$;

-- =============================================================
-- RPC: admin_reset_password
-- Reset password user (hash dikirim dari application layer).
-- Hanya super_admin.
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_reset_password(
    p_caller_id      uuid,
    p_target_user_id uuid,
    p_new_hash       text
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT public.is_super_admin(p_caller_id) THEN
        RAISE EXCEPTION 'Akses ditolak.';
    END IF;

    UPDATE public.users
    SET password_hash = p_new_hash, updated_at = now()
    WHERE id = p_target_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User tidak ditemukan: %', p_target_user_id;
    END IF;

    -- Cabut semua sesi agar user login ulang dengan password baru
    DELETE FROM public.sessions WHERE user_id = p_target_user_id;

    RETURN true;
END;
$$;
