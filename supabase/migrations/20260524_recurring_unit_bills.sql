-- =============================================================
-- MIGRATION: Recurring (tagihan rutin) untuk Tagihan Unit
--
-- Hanya berlaku untuk public.tagihan_bulanan (menu "Tgh. Unit").
--
-- 1. Tambah kolom is_recurring (default false di DB; default true di UI form)
-- 2. Tambah kolom recurring_parent_id (link ke parent bill)
-- 3. Update RPC pay_tagihan_bulanan:
--    - tetap mark lunas + insert pengeluaran (sama seperti sebelumnya)
--    - jika is_recurring = true → generate tagihan periode berikutnya
--      (due_date maju 1 bulan) dengan anti-duplikasi: jika sudah ada
--      tagihan unpaid pada apartment+room+next_due_date, jangan dibuat lagi.
-- =============================================================

-- 1) Tambah kolom recurring (idempotent)
ALTER TABLE public.tagihan_bulanan
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.tagihan_bulanan
  ADD COLUMN IF NOT EXISTS recurring_parent_id BIGINT
    REFERENCES public.tagihan_bulanan(id) ON DELETE SET NULL;

-- Index untuk lookup anti-duplikasi pada next-period generation
CREATE INDEX IF NOT EXISTS idx_tagihan_bulanan_unit_due
  ON public.tagihan_bulanan (apartment_location, room_number, due_date);


-- 2) Update RPC pay_tagihan_bulanan: tambah generate bulan berikutnya
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

  SELECT *
  INTO v_row
  FROM public.tagihan_bulanan
  WHERE id = p_tagihan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tagihan tidak ditemukan.';
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

    -- Anti-duplikasi: skip jika sudah ada tagihan untuk unit yang sama pada
    -- jatuh tempo berikutnya (status apa pun, agar tidak duplikat).
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
