-- Link generated unit-bill expenses to their apartment and room.
-- Existing paid bills are backfilled without creating duplicate expenses.

ALTER TABLE public.pengeluaran
  ADD COLUMN IF NOT EXISTS tagihan_bulanan_id bigint;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pengeluaran_tagihan_bulanan_id
  ON public.pengeluaran (tagihan_bulanan_id)
  WHERE tagihan_bulanan_id IS NOT NULL;

WITH candidates AS (
  SELECT
    p.id AS expense_id,
    tb.id AS bill_id,
    tb.apartment_location,
    tb.room_number,
    ROW_NUMBER() OVER (
      PARTITION BY p.id
      ORDER BY tb.paid_at DESC NULLS LAST, tb.id DESC
    ) AS expense_rank,
    ROW_NUMBER() OVER (
      PARTITION BY tb.id
      ORDER BY p.id
    ) AS bill_rank
  FROM public.pengeluaran p
  JOIN public.tagihan_bulanan tb
    ON tb.status = 'paid'
   AND p.jumlah = tb.amount
   AND p.nama_pengeluaran = format('Bayar Tagihan Unit %s - %s', tb.apartment_location, tb.room_number)
   AND p.tanggal = (tb.paid_at AT TIME ZONE 'Asia/Jakarta')::date
  WHERE p.tagihan_bulanan_id IS NULL
    AND p.apartment_location IS NULL
    AND p.room_number IS NULL
    AND (p.category = 'Tagihan Unit' OR p.category IS NULL)
)
UPDATE public.pengeluaran p
SET
  tagihan_bulanan_id = c.bill_id,
  apartment_location = c.apartment_location,
  room_number = c.room_number
FROM candidates c
WHERE p.id = c.expense_id
  AND c.expense_rank = 1
  AND c.bill_rank = 1;

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

  IF v_row.status = 'paid' THEN
    RAISE EXCEPTION 'Tagihan sudah lunas.';
  END IF;

  UPDATE public.tagihan_bulanan
  SET
    status = 'paid',
    paid_at = v_paid_at,
    proof_url = COALESCE(p_proof_url, proof_url)
  WHERE id = p_tagihan_id;

  INSERT INTO public.pengeluaran (
    nama_pengeluaran,
    jumlah,
    tanggal,
    keterangan,
    category,
    apartment_location,
    room_number,
    tagihan_bulanan_id,
    user_id
  )
  VALUES (
    format('Bayar Tagihan Unit %s - %s', v_row.apartment_location, v_row.room_number),
    v_row.amount,
    (v_paid_at AT TIME ZONE 'Asia/Jakarta')::date,
    format('Tagihan lunas pada %s %s %s %s WIB',
      to_char(v_paid_at AT TIME ZONE 'Asia/Jakarta', 'DD'),
      CASE EXTRACT(MONTH FROM v_paid_at AT TIME ZONE 'Asia/Jakarta')
        WHEN 1 THEN 'Jan' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar'
        WHEN 4 THEN 'Apr' WHEN 5 THEN 'Mei' WHEN 6 THEN 'Jun'
        WHEN 7 THEN 'Jul' WHEN 8 THEN 'Agu' WHEN 9 THEN 'Sep'
        WHEN 10 THEN 'Okt' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Des'
      END,
      to_char(v_paid_at AT TIME ZONE 'Asia/Jakarta', 'YYYY'),
      to_char(v_paid_at AT TIME ZONE 'Asia/Jakarta', 'HH24:MI')
    ),
    'Tagihan Unit',
    v_row.apartment_location,
    v_row.room_number,
    p_tagihan_id,
    v_user_id
  );

  IF COALESCE(v_row.is_recurring, FALSE) THEN
    v_next_due_date := (v_row.due_date + INTERVAL '1 month')::date;

    SELECT id INTO v_existing_id
    FROM public.tagihan_bulanan
    WHERE apartment_location = v_row.apartment_location
      AND room_number = v_row.room_number
      AND due_date = v_next_due_date
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
    'tagihan_id', p_tagihan_id,
    'paid_at', v_paid_at,
    'next_tagihan_id', v_new_tagihan_id,
    'next_due_date', v_next_due_date,
    'next_already_exists', (v_existing_id IS NOT NULL)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pay_tagihan_bulanan(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_tagihan_bulanan(bigint, text) TO authenticated;
