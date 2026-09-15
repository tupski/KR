-- =============================================================
-- MIGRATION: Security Remediation Sprint 1
-- Menutup: C-1 (user_roles privilege escalation), H-2 + H-3
-- (otorisasi & replay RPC keuangan), M-1 (bucket legacy public).
--
-- Catatan deployment:
-- - Jalankan sebagai postgres (supabase db push / SQL editor).
-- - Migrasi ini IDEMPOTENT: aman dijalankan ulang.
-- - Setelah migrasi, VERIFIKASI manual di dashboard Supabase:
--   Authentication -> Providers -> Email: "Enable Signup" HARUS OFF
--   (public signup ditutup di sisi dashboard, tidak bisa dari repo).
-- =============================================================

-- ------------------------------------------------------------
-- 1) C-1: Perbaiki RLS public.user_roles
--
-- Model keamanan:
--   SELECT  : user boleh baca role-nya sendiri (dipakai UI role sync);
--             super_admin boleh baca semua (untuk fungsi admin).
--   INSERT / UPDATE / DELETE : TIDAK ADA policy untuk authenticated.
--             PostgREST menolak (RLS enabled, tanpa policy = deny).
--             Perubahan role HANYA via RPC SECURITY DEFINER:
--             admin_create_user / admin_update_user (cek is_super_admin).
-- ------------------------------------------------------------

-- is_super_admin() dijadikan SECURITY DEFINER agar policy pada
-- user_roles sendiri tidak menyebabkan infinite recursion RLS,
-- dan agar cek role di policy tabel lain tetap bekerja setelah
-- user_roles dikunci. search_path dipatok (anti search_path hijack).
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'super_admin'
  );
$$;

-- Hapus SEMUA policy lama pada user_roles (nama dari schema.sql dan
-- migrasi lama) supaya tidak ada policy permisif yang tertinggal.
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.user_roles;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.user_roles;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.user_roles;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.user_roles;
DROP POLICY IF EXISTS "Enable read user roles for authenticated users" ON public.user_roles;
DROP POLICY IF EXISTS "Enable insert user roles for authenticated users" ON public.user_roles;
DROP POLICY IF EXISTS "Enable update user roles for authenticated users" ON public.user_roles;
DROP POLICY IF EXISTS "Enable delete user roles for authenticated users" ON public.user_roles;

-- SELECT: sendiri
CREATE POLICY "user_roles_select_self" ON public.user_roles
    FOR SELECT USING (
        auth.role() = 'authenticated'
        AND auth.uid() = user_id
    );

-- SELECT: super_admin (butuh is_super_admin SECURITY DEFINER di atas)
CREATE POLICY "user_roles_select_super_admin" ON public.user_roles
    FOR SELECT USING (
        auth.role() = 'authenticated'
        AND public.is_super_admin()
    );

-- INSERT/UPDATE/DELETE: sengaja TANPA policy.
-- C-1 ditutup di sini: `update({role:'super_admin'}).eq('user_id', uid)`
-- dari klien mana pun sekarang ditolak oleh RLS.

-- ------------------------------------------------------------
-- 2) M-1: Tutup bucket Supabase Storage legacy yang masih public.
--    Data TIDAK dihapus; hanya visibility di-set private.
--    NOTE: aplikasi aktif mengunggah via Vercel Blob; bucket ini
--    legacy. Verifikasi di dashboard -> Storage setelah push.
-- ------------------------------------------------------------
UPDATE storage.buckets
SET public = false
WHERE id IN ('ktp_images', 'transfer_proofs', 'tagihan_proofs');

-- ------------------------------------------------------------
-- 3) H-2: pay_tagihan_bulanan versi aman.
--    Basis: definisi recurring terakhir (20260524_recurring_unit_bills.sql)
--    yang merupakan definisi aktif. Perubahan:
--    a) Guard role admin/super_admin (definer bypass RLS, baca langsung).
--    b) Guard status: tagihan 'paid' ditolak -> tidak ada pengeluaran
--       duplikat dari replay berurutan (FOR UPDATE + cek status dalam
--       satu transaksi = idempotency di level DB).
--    c) Atomicity dipertahankan: lock -> validate -> update -> expense
--       -> generate recurring berikutnya, satu eksekusi fungsi.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_tagihan_bulanan(
  p_tagihan_id bigint,
  p_proof_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_paid_at timestamptz := now();
  v_row public.tagihan_bulanan%ROWTYPE;
  v_next_due_date date;
  v_existing_id bigint;
  v_new_tagihan_id bigint := NULL;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak valid.';
  END IF;

  -- (a) Guard role: hanya admin / super_admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Akses ditolak. Hanya admin yang dapat menandai tagihan lunas.';
  END IF;

  SELECT *
  INTO v_row
  FROM public.tagihan_bulanan
  WHERE id = p_tagihan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tagihan tidak ditemukan.';
  END IF;

  -- (b) Guard replay: sudah lunas -> tolak, jangan buat pengeluaran lagi
  IF v_row.status = 'paid' THEN
    RAISE EXCEPTION 'Tagihan sudah lunas.';
  END IF;

  -- Mark lunas
  UPDATE public.tagihan_bulanan
  SET
    status   = 'paid',
    paid_at  = v_paid_at,
    proof_url = COALESCE(p_proof_url, proof_url)
  WHERE id = p_tagihan_id;

  -- Catat ke pengeluaran (kategori "Tagihan Unit")
  INSERT INTO public.pengeluaran (nama_pengeluaran, jumlah, tanggal, keterangan, category, user_id)
  VALUES (
    format('Bayar Tagihan Unit %s - %s', v_row.apartment_location, v_row.room_number),
    v_row.amount,
    (v_paid_at AT TIME ZONE 'Asia/Jakarta')::date,
    format('Tagihan lunas pada %s %s %s %s WIB',
      to_char(v_paid_at AT TIME ZONE 'Asia/Jakarta', 'DD'),
      CASE EXTRACT(MONTH FROM v_paid_at AT TIME ZONE 'Asia/Jakarta')
        WHEN 1  THEN 'Jan' WHEN 2  THEN 'Feb' WHEN 3  THEN 'Mar'
        WHEN 4  THEN 'Apr' WHEN 5  THEN 'Mei' WHEN 6  THEN 'Jun'
        WHEN 7  THEN 'Jul' WHEN 8  THEN 'Agu' WHEN 9  THEN 'Sep'
        WHEN 10 THEN 'Okt' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Des'
      END,
      to_char(v_paid_at AT TIME ZONE 'Asia/Jakarta', 'YYYY'),
      to_char(v_paid_at AT TIME ZONE 'Asia/Jakarta', 'HH24:MI')
    ),
    'Tagihan Unit',
    v_user_id
  );

  -- Generate tagihan periode berikutnya jika recurring
  IF COALESCE(v_row.is_recurring, FALSE) THEN
    v_next_due_date := (v_row.due_date + INTERVAL '1 month')::date;

    SELECT id INTO v_existing_id
    FROM public.tagihan_bulanan
    WHERE apartment_location = v_row.apartment_location
      AND room_number        = v_row.room_number
      AND due_date           = v_next_due_date
    LIMIT 1;

    IF v_existing_id IS NULL THEN
      INSERT INTO public.tagihan_bulanan (
        apartment_location, room_number, amount, due_date,
        status, is_recurring, recurring_parent_id, user_id
      )
      VALUES (
        v_row.apartment_location,
        v_row.room_number,
        v_row.amount,
        v_next_due_date,
        'unpaid',
        TRUE,
        v_row.id,
        v_user_id
      )
      RETURNING id INTO v_new_tagihan_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'tagihan_id',          p_tagihan_id,
    'paid_at',             v_paid_at,
    'next_tagihan_id',     v_new_tagihan_id,
    'next_due_date',       v_next_due_date,
    'next_already_exists', (v_existing_id IS NOT NULL)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pay_tagihan_bulanan(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_tagihan_bulanan(bigint, text) TO authenticated;

-- ------------------------------------------------------------
-- 4) H-3: pay_fee_items versi aman.
--    Basis: gabungan fix_pay_fee_items (20260417) + kategori
--    (20260520) = definisi aktif terakhir. Perubahan:
--    a) Guard role admin/super_admin.
--    b) Anti-replay diperketat: total fee DIHITUNG HANYA dari
--       transaksi yang belum ada di tagihan_fee_lunas_items
--       (versi 20260520 menghitung semua match -> replay
--       menyisipkan pengeluaran + receipt duplikat meski
--       items ON CONFLICT noop).
--    c) Receipt tagihan_fee_lunas hanya dibuat jika ada item baru.
--    d) Dedupe per transaction_id dipertahankan (ON CONFLICT).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_fee_items(
  p_marketing_name text,
  p_transaction_ids bigint[],
  p_proof_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_items_inserted int := 0;
  v_total_fee numeric := 0;
  v_paid_at timestamptz := now();
  v_actual_transactions JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak valid.';
  END IF;

  -- (a) Guard role: hanya admin / super_admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Akses ditolak. Hanya admin yang dapat membayar fee marketing.';
  END IF;

  IF p_marketing_name IS NULL OR btrim(p_marketing_name) = '' THEN
    RAISE EXCEPTION 'Marketing tidak valid.';
  END IF;

  IF p_transaction_ids IS NULL OR array_length(p_transaction_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Tidak ada transaksi yang dibayarkan.';
  END IF;

  -- (b) Hitung fee HANYA dari transaksi yang BELUM dibayar
  SELECT
    COALESCE(sum(t.marketing_fee), 0),
    jsonb_agg(
      jsonb_build_object(
        'transaction_id', t.id,
        'customer', t.customer_name,
        'location', t.apartment_location
      )
    )
  INTO v_total_fee, v_actual_transactions
  FROM public.transactions t
  WHERE t.id = ANY(p_transaction_ids)
    AND t.marketing_name = p_marketing_name
    AND COALESCE(t.marketing_fee, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.tagihan_fee_lunas_items tfli
      WHERE tfli.transaction_id = t.id
    );

  -- Tidak ada yang perlu dibayar -> keluar tanpa insert apa pun
  -- (anti duplikat pengeluaran + receipt pada replay)
  IF v_actual_transactions IS NULL OR jsonb_array_length(v_actual_transactions) = 0 THEN
    RETURN jsonb_build_object(
      'items_inserted', 0,
      'total_fee', 0,
      'paid_at', v_paid_at
    );
  END IF;

  -- Insert items; ON CONFLICT do nothing supaya idempotent per transaction_id
  INSERT INTO public.tagihan_fee_lunas_items (
    transaction_id, marketing_name, fee_amount, paid_at, paid_by, proof_url
  )
  SELECT
    t.id,
    p_marketing_name,
    COALESCE(t.marketing_fee, 0),
    v_paid_at,
    v_user_id,
    p_proof_url
  FROM public.transactions t
  WHERE t.id = ANY(p_transaction_ids)
    AND t.marketing_name = p_marketing_name
    AND COALESCE(t.marketing_fee, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.tagihan_fee_lunas_items tfli
      WHERE tfli.transaction_id = t.id
    )
  ON CONFLICT (transaction_id) DO NOTHING;

  GET DIAGNOSTICS v_items_inserted = ROW_COUNT;

  -- Catat ke pengeluaran dengan category = 'Fee Marketing'
  -- (c) hanya jika benar-benar ada item baru
  IF v_items_inserted > 0 AND v_total_fee > 0 THEN
    INSERT INTO public.pengeluaran (nama_pengeluaran, jumlah, tanggal, keterangan, category, user_id)
    VALUES (
      format('Bayar Fee Marketing %s', p_marketing_name),
      v_total_fee,
      (v_paid_at AT TIME ZONE 'Asia/Jakarta')::date,
      format('%s customer.', v_items_inserted),
      'Fee Marketing',
      v_user_id
    );
  END IF;

  -- Simpan "receipt" untuk kompatibilitas history/share — hanya jika ada item baru
  IF v_items_inserted > 0 THEN
    INSERT INTO public.tagihan_fee_lunas (
      marketing_name, customer_count, total_fee, transactions_detail, proof_url, paid_at, user_id
    )
    VALUES (
      p_marketing_name,
      v_items_inserted,
      v_total_fee,
      v_actual_transactions,
      p_proof_url,
      v_paid_at,
      v_user_id
    );
  END IF;

  RETURN jsonb_build_object(
    'items_inserted', v_items_inserted,
    'total_fee', v_total_fee,
    'paid_at', v_paid_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pay_fee_items(text, bigint[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_fee_items(text, bigint[], text) TO authenticated;
