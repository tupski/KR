-- =============================================================
-- Migration 010: Recurring Bills Backfill
-- Requires: 005_finance_tables.sql (public.tagihan_bulanan)
--
-- Tujuan:
--   1. Flag is_recurring = TRUE pada tagihan paid TERAKHIR per kamar
--   2. Generate 1 tagihan unpaid untuk kamar yang belum punya followup
--
-- Idempotent: aman dijalankan ulang karena menggunakan WHERE guards.
-- =============================================================

-- -------------------------------------------------------------
-- 1) Flag is_recurring = TRUE pada tagihan paid terakhir per kamar
-- -------------------------------------------------------------
UPDATE public.tagihan_bulanan tb
SET is_recurring = TRUE
FROM (
    SELECT DISTINCT ON (apartment_location, room_number)
        id
    FROM public.tagihan_bulanan
    WHERE status = 'paid'
      AND apartment_location IS NOT NULL
      AND room_number IS NOT NULL
    ORDER BY apartment_location, room_number, paid_at DESC NULLS LAST, due_date DESC, id DESC
) last_paid
WHERE tb.id = last_paid.id
  AND COALESCE(tb.is_recurring, FALSE) = FALSE;

-- -------------------------------------------------------------
-- 2) Generate 1 tagihan unpaid untuk kamar yang belum punya followup
-- -------------------------------------------------------------
INSERT INTO public.tagihan_bulanan (
    apartment_location,
    room_number,
    amount,
    due_date,
    status,
    is_recurring,
    recurring_parent_id,
    user_id
)
SELECT
    lp.apartment_location,
    lp.room_number,
    lp.amount,
    (lp.due_date + INTERVAL '1 month')::date AS next_due_date,
    'unpaid',
    TRUE,
    lp.id,
    lp.user_id
FROM (
    SELECT DISTINCT ON (apartment_location, room_number)
        id, apartment_location, room_number, amount, due_date, user_id
    FROM public.tagihan_bulanan
    WHERE status = 'paid'
      AND apartment_location IS NOT NULL
      AND room_number IS NOT NULL
    ORDER BY apartment_location, room_number, paid_at DESC NULLS LAST, due_date DESC, id DESC
) lp
WHERE NOT EXISTS (
    -- Skip jika sudah ada tagihan apa pun dengan due_date > last_due_date
    SELECT 1 FROM public.tagihan_bulanan tb
    WHERE tb.apartment_location = lp.apartment_location
      AND tb.room_number        = lp.room_number
      AND tb.due_date           > lp.due_date
)
AND NOT EXISTS (
    -- Extra guard: skip jika sudah ada tagihan persis di next_due_date
    SELECT 1 FROM public.tagihan_bulanan tb
    WHERE tb.apartment_location = lp.apartment_location
      AND tb.room_number        = lp.room_number
      AND tb.due_date           = (lp.due_date + INTERVAL '1 month')::date
);

-- -------------------------------------------------------------
-- 3) Log hasil
-- -------------------------------------------------------------
DO $$
DECLARE
    v_recurring integer;
    v_unpaid    integer;
BEGIN
    SELECT COUNT(*) INTO v_recurring
    FROM public.tagihan_bulanan
    WHERE is_recurring = TRUE AND status = 'paid';

    SELECT COUNT(*) INTO v_unpaid
    FROM public.tagihan_bulanan
    WHERE status = 'unpaid';

    RAISE NOTICE 'Backfill selesai. Tagihan paid recurring=TRUE: %, total tagihan unpaid: %',
        v_recurring, v_unpaid;
END$$;
