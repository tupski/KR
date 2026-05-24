-- =============================================================
-- MIGRATION: Analytics Dashboard v2
--
-- Perubahan:
--   1. get_location_fullness — derive total_rooms dari tabel `nomor_kamar`
--      (COUNT(*) WHERE lokasi = la.name) sebagai sumber otoritatif.
--      Fallback ke kolom lokasi_apartemen.total_rooms hanya bila nomor_kamar
--      kosong untuk lokasi tersebut.
--   2. get_occupancy_per_location — RPC BARU: agregasi okupansi per LOKASI
--      (bukan per kamar). Mengembalikan satu baris per lokasi dengan
--      total_rooms, total_transactions, total_revenue, dan occupancy_rate
--      (= rata-rata harian (rooms_occupied / total_rooms) × 100).
--   3. get_stay_duration_summary — paparkan setiap jam transit (1..11) sebagai
--      kategori terpisah, hapus bucket "Transit - Lainnya".
--
-- CATATAN: Migrasi ini TIDAK mengubah/menghapus tabel, kolom, atau nilai.
-- Hanya CREATE OR REPLACE FUNCTION (idempotent).
-- =============================================================


-- =============================================================
-- 1) get_location_fullness
--    SOURCE: total_rooms ← nomor_kamar (otoritatif), fallback la.total_rooms
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_location_fullness(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL
)
RETURNS TABLE (
  apartment_location  TEXT,
  total_rooms         INT,
  peak_occupancy_rate NUMERIC,
  avg_occupancy_rate  NUMERIC,
  total_transactions  BIGINT,
  total_count         BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH period_days AS (
    SELECT (p_end_date - p_start_date + 1) AS total_days
  ),
  -- Sumber otoritatif jumlah unit per lokasi: tabel nomor_kamar.
  rooms_count AS (
    SELECT
      nk.lokasi::TEXT                                                          AS apartment_location,
      COUNT(*)::INT                                                            AS rooms_count
    FROM public.nomor_kamar nk
    GROUP BY nk.lokasi
  ),
  locations AS (
    SELECT
      la.name::TEXT                                                            AS apartment_location,
      -- Prioritas: nomor_kamar > la.total_rooms > 0
      COALESCE(rc.rooms_count, NULLIF(la.total_rooms, 0), 0)                   AS total_rooms
    FROM public.lokasi_apartemen la
    LEFT JOIN rooms_count rc ON rc.apartment_location = la.name
    WHERE (p_location IS NULL OR la.name = p_location)
  ),
  daily_occupancy AS (
    SELECT
      t.apartment_location::TEXT                                               AS apartment_location,
      DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta')                          AS checkin_date,
      COUNT(DISTINCT t.room_number)                                            AS rooms_occupied
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY t.apartment_location, DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta')
  ),
  location_stats AS (
    SELECT
      t.apartment_location::TEXT                                               AS apartment_location,
      COUNT(*)                                                                 AS total_transactions
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY t.apartment_location
  ),
  occupancy_stats AS (
    SELECT
      do_data.apartment_location,
      ROUND(
        SUM(do_data.rooms_occupied::NUMERIC / NULLIF(loc.total_rooms, 0) * 100)
        / NULLIF(pd.total_days, 0),
        2
      )                                                                        AS avg_occupancy_rate,
      ROUND(
        COUNT(*) FILTER (WHERE do_data.rooms_occupied >= loc.total_rooms AND loc.total_rooms > 0)::NUMERIC
        / NULLIF(pd.total_days, 0) * 100,
        2
      )                                                                        AS peak_occupancy_rate
    FROM daily_occupancy do_data
    JOIN locations loc ON loc.apartment_location = do_data.apartment_location
    CROSS JOIN period_days pd
    GROUP BY do_data.apartment_location, pd.total_days
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM locations
  )
  SELECT
    loc.apartment_location,
    loc.total_rooms,
    CASE WHEN loc.total_rooms IS NULL OR loc.total_rooms = 0
      THEN NULL
      ELSE os.peak_occupancy_rate
    END                                                                        AS peak_occupancy_rate,
    CASE WHEN loc.total_rooms IS NULL OR loc.total_rooms = 0
      THEN NULL
      ELSE os.avg_occupancy_rate
    END                                                                        AS avg_occupancy_rate,
    COALESCE(ls.total_transactions, 0)                                         AS total_transactions,
    c.cnt                                                                      AS total_count
  FROM locations loc
  LEFT JOIN occupancy_stats os ON os.apartment_location = loc.apartment_location
  LEFT JOIN location_stats ls ON ls.apartment_location = loc.apartment_location
  CROSS JOIN counted c
  ORDER BY
    CASE WHEN loc.total_rooms IS NULL OR loc.total_rooms = 0 THEN NULL ELSE os.avg_occupancy_rate END DESC NULLS LAST,
    loc.apartment_location;
END;
$$;

REVOKE ALL ON FUNCTION public.get_location_fullness(DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_location_fullness(DATE, DATE, TEXT) TO authenticated;


-- =============================================================
-- 2) get_occupancy_per_location — RPC BARU
--    Agregasi okupansi per lokasi (bukan per kamar):
--      - total_rooms        : COUNT(*) dari nomor_kamar untuk lokasi
--      - total_transactions : jumlah transaksi pada periode
--      - total_revenue      : SUM(cash_amount + transfer_amount)
--      - occupancy_rate     : rata-rata harian (rooms_occupied / total_rooms × 100)
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_occupancy_per_location(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL
)
RETURNS TABLE (
  apartment_location TEXT,
  total_rooms        INT,
  total_transactions BIGINT,
  total_revenue      NUMERIC,
  occupancy_rate     NUMERIC,
  total_count        BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH period_days AS (
    SELECT (p_end_date - p_start_date + 1) AS total_days
  ),
  rooms_count AS (
    SELECT
      nk.lokasi::TEXT                                                          AS apartment_location,
      COUNT(*)::INT                                                            AS rooms_count
    FROM public.nomor_kamar nk
    GROUP BY nk.lokasi
  ),
  locations AS (
    SELECT
      la.name::TEXT                                                            AS apartment_location,
      COALESCE(rc.rooms_count, NULLIF(la.total_rooms, 0), 0)                   AS total_rooms
    FROM public.lokasi_apartemen la
    LEFT JOIN rooms_count rc ON rc.apartment_location = la.name
    WHERE (p_location IS NULL OR la.name = p_location)
  ),
  tx_stats AS (
    SELECT
      t.apartment_location::TEXT                                               AS apartment_location,
      COUNT(*)                                                                 AS total_transactions,
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                        AS total_revenue
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY t.apartment_location
  ),
  daily_occupancy AS (
    SELECT
      t.apartment_location::TEXT                                               AS apartment_location,
      DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta')                          AS checkin_date,
      COUNT(DISTINCT t.room_number)                                            AS rooms_occupied
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY t.apartment_location, DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta')
  ),
  occupancy_stats AS (
    SELECT
      do_data.apartment_location,
      ROUND(
        SUM(do_data.rooms_occupied::NUMERIC / NULLIF(loc.total_rooms, 0) * 100)
        / NULLIF(pd.total_days, 0),
        2
      )                                                                        AS occupancy_rate
    FROM daily_occupancy do_data
    JOIN locations loc ON loc.apartment_location = do_data.apartment_location
    CROSS JOIN period_days pd
    GROUP BY do_data.apartment_location, pd.total_days
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM locations
  )
  SELECT
    loc.apartment_location,
    loc.total_rooms,
    COALESCE(ts.total_transactions, 0)                                         AS total_transactions,
    COALESCE(ts.total_revenue, 0)                                              AS total_revenue,
    CASE WHEN loc.total_rooms IS NULL OR loc.total_rooms = 0
      THEN NULL
      ELSE os.occupancy_rate
    END                                                                        AS occupancy_rate,
    c.cnt                                                                      AS total_count
  FROM locations loc
  LEFT JOIN tx_stats ts ON ts.apartment_location = loc.apartment_location
  LEFT JOIN occupancy_stats os ON os.apartment_location = loc.apartment_location
  CROSS JOIN counted c
  ORDER BY
    COALESCE(ts.total_transactions, 0) DESC,
    loc.apartment_location;
END;
$$;

REVOKE ALL ON FUNCTION public.get_occupancy_per_location(DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_occupancy_per_location(DATE, DATE, TEXT) TO authenticated;


-- =============================================================
-- 3) get_stay_duration_summary
--    Paparkan setiap jam transit (1..11) sebagai kategori sendiri.
--    Tidak ada lagi bucket "Transit - Lainnya".
--
--    Kategori final:
--      - 'Transit - 1 Jam' .. 'Transit - 11 Jam'
--      - 'Fullday'             (12..23)
--      - 'Per Malam - 1 Malam' (24..47)
--      - 'Per Malam - 2+ Malam'(>= 48)
--      - 'Lainnya'             (NULL / 0 / nilai tidak terklasifikasi)
--
--    Note: DROP FUNCTION dulu karena kita mengubah signature RETURNS TABLE
--          (menambah kolom duration_sort_key) — Postgres tidak izinkan
--          CREATE OR REPLACE bila tipe kembalian berubah.
-- =============================================================
DROP FUNCTION IF EXISTS public.get_stay_duration_summary(DATE, DATE, TEXT);

CREATE OR REPLACE FUNCTION public.get_stay_duration_summary(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL
)
RETURNS TABLE (
  duration_category TEXT,
  duration_sort_key INT,
  transaction_count BIGINT,
  percentage        NUMERIC,
  total_revenue     NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH categorized AS (
    SELECT
      CASE
        WHEN t.rental_duration BETWEEN 1 AND 11
          THEN 'Transit - ' || t.rental_duration::TEXT || ' Jam'
        WHEN t.rental_duration BETWEEN 12 AND 23                      THEN 'Fullday'
        WHEN t.rental_duration BETWEEN 24 AND 47                      THEN 'Per Malam - 1 Malam'
        WHEN t.rental_duration >= 48                                  THEN 'Per Malam - 2+ Malam'
        ELSE                                                               'Lainnya'
      END::TEXT                                                                AS duration_category,
      -- Sort key untuk urutan natural di chart (kecil ke besar)
      CASE
        WHEN t.rental_duration BETWEEN 1 AND 11                       THEN t.rental_duration
        WHEN t.rental_duration BETWEEN 12 AND 23                      THEN 100
        WHEN t.rental_duration BETWEEN 24 AND 47                      THEN 200
        WHEN t.rental_duration >= 48                                  THEN 300
        ELSE                                                               999
      END                                                                      AS duration_sort_key,
      t.cash_amount,
      t.transfer_amount
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
  ),
  aggregated AS (
    SELECT
      c.duration_category,
      MIN(c.duration_sort_key)                                                 AS sort_key,
      COUNT(*)                                                                 AS tx_count,
      ROUND(SUM(c.cash_amount + c.transfer_amount), 2)                        AS revenue
    FROM categorized c
    GROUP BY c.duration_category
  ),
  grand_total AS (
    SELECT COALESCE(SUM(a.tx_count), 0) AS total FROM aggregated a
  )
  SELECT
    a.duration_category,
    a.sort_key                                                                 AS duration_sort_key,
    a.tx_count                                                                 AS transaction_count,
    ROUND(
      a.tx_count::NUMERIC / NULLIF(g.total, 0) * 100,
      2
    )                                                                          AS percentage,
    a.revenue                                                                  AS total_revenue
  FROM aggregated a, grand_total g
  ORDER BY a.sort_key, a.duration_category;
END;
$$;

REVOKE ALL ON FUNCTION public.get_stay_duration_summary(DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_stay_duration_summary(DATE, DATE, TEXT) TO authenticated;
