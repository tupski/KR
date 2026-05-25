-- =============================================================
-- BACKFILL: Tandai tagihan unit yang sudah lunas sebagai rutin bulanan
--           + generate 1 tagihan unpaid untuk periode berikutnya (Opsi B)
-- =============================================================
-- Tujuan:
--   1. Untuk setiap pasangan (apartment_location, room_number) yang punya
--      tagihan dengan status 'paid', set is_recurring = TRUE pada tagihan
--      lunas TERAKHIR (paid_at terbaru) sehingga sistem rutin bulanan
--      bisa berjalan ke depan.
--   2. Untuk kamar yang belum punya tagihan periode berikutnya (mis. lunas
--      sebelum logic recurring ada, atau next-bill terlanjur dihapus),
--      generate 1 tagihan unpaid dengan due_date = last_due_date + 1 bulan.
--      Hanya 1 baris per kamar.
--
-- Catatan keamanan & anti-double:
--   * Anti-duplikasi ketat:
--       a. Hanya kamar yang TIDAK punya tagihan apa pun (paid/unpaid) dengan
--          due_date > last_due_date.
--       b. Tetap WHERE NOT EXISTS guard saat INSERT untuk jaga-jaga race.
--   * Idempotent: aman dijalankan ulang. Tagihan yang sudah is_recurring=TRUE
--     akan tetap TRUE; tagihan baru tidak akan digenerate kalau followup
--     sudah ada.
--   * Tidak menyentuh tagihan dengan status 'unpaid' yang sudah ada.
--   * Tidak menyentuh tabel pengeluaran atau transactions.
--
-- Efek pada data keuangan:
--   * Tabel pengeluaran: TIDAK ADA perubahan (tidak ada insert).
--   * Tabel transactions: TIDAK ADA perubahan.
--   * Ringkasan bulanan (pemasukan/pengeluaran/laba): TIDAK BERUBAH.
--   * Riwayat lunas: TIDAK BERUBAH.
--   * UI:
--       - Tagihan lunas terakhir per kamar dapat label "Rutin Bulanan".
--       - Daftar "Tagihan Aktif" akan bertambah 1 baris per kamar yang
--         belum punya followup. Kemungkinan ada yang langsung overdue
--         (label "Terlambat N hari" atau "Tempo hari ini") tergantung
--         due_date hasil hitungan.
-- =============================================================

BEGIN;

-- ---------------------------------------------
-- 1) Flag is_recurring = TRUE pada tagihan paid TERAKHIR per kamar
-- ---------------------------------------------
WITH last_paid AS (
  SELECT DISTINCT ON (apartment_location, room_number)
    id
  FROM public.tagihan_bulanan
  WHERE status = 'paid'
    AND apartment_location IS NOT NULL
    AND room_number IS NOT NULL
  ORDER BY apartment_location, room_number, paid_at DESC NULLS LAST, due_date DESC, id DESC
)
UPDATE public.tagihan_bulanan tb
SET is_recurring = TRUE
FROM last_paid lp
WHERE tb.id = lp.id
  AND COALESCE(tb.is_recurring, FALSE) = FALSE;

-- ---------------------------------------------
-- 2) Generate 1 tagihan unpaid untuk kamar yang belum punya followup
-- ---------------------------------------------
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
  -- Extra guard: skip jika kebetulan sudah ada tagihan persis di next_due_date
  SELECT 1 FROM public.tagihan_bulanan tb
  WHERE tb.apartment_location = lp.apartment_location
    AND tb.room_number        = lp.room_number
    AND tb.due_date           = (lp.due_date + INTERVAL '1 month')::date
);

-- ---------------------------------------------
-- 3) Log hasil untuk traceability
-- ---------------------------------------------
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

COMMIT;
