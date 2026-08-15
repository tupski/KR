-- =============================================================
-- MIGRATION: Logout All Devices (Revoke All Sessions)
-- =============================================================
-- Menghapus dari auth.sessions akan meng-cascade ke auth.refresh_tokens.
-- Ini adalah cara resmi Supabase untuk mencabut (revoke) semua sesi
-- seorang user: refresh token hilang sehingga sesi tidak bisa diperbarui.
-- Access token saat ini tetap valid sampai expiry-nya (biasanya 1 jam),
-- lalu klien akan gagal refresh dan diarahkan ke halaman login.
-- Referensi: https://supabase.com/docs/guides/auth/sessions#revoke-all-sessions

-- 1) RPC: Admin mencabut semua sesi user lain (Super Admin only)
CREATE OR REPLACE FUNCTION public.admin_sign_out_user(p_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Cek apakah pemanggil adalah super_admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Akses ditolak. Hanya Super Admin yang dapat logout user.';
  END IF;

  -- Hapus semua sesi target user (cascade ke refresh_tokens)
  DELETE FROM auth.sessions WHERE user_id = p_target_user_id;

  RETURN true;
END;
$$;

-- 2) RPC: User logout semua perangkatnya sendiri (self-service)
-- Tidak ada cek admin; scoping via auth.uid() dari sesi pemanggil.
CREATE OR REPLACE FUNCTION public.sign_out_own_devices()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Hapus semua sesi user yang sedang login (cascade ke refresh_tokens)
  DELETE FROM auth.sessions WHERE user_id = auth.uid();

  RETURN true;
END;
$$;

-- Hak akses eksekusi
REVOKE ALL ON FUNCTION public.admin_sign_out_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_sign_out_user(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.sign_out_own_devices() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_out_own_devices() TO authenticated;
