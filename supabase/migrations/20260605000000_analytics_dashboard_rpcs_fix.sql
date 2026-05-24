-- =============================================================
-- MIGRATION: Analytics Dashboard — Bugfix RPCs
--
-- Memperbaiki dua bug yang menyebabkan dashboard analitik gagal:
--
--   Bug 1 — "structure of query does not match function result type"
--           Kolom seperti room_number, apartment_location, customer_name,
--           source_name berasal dari VARCHAR(255) tetapi RETURNS TABLE
--           mendeklarasikan TEXT. Postgres ketat soal VARCHAR vs TEXT,
--           jadi perlu CAST ::TEXT eksplisit.
--
--   Bug 2 — "column reference 'transaction_count' is ambiguous"
--           CTE `grand_total` menggunakan SUM(transaction_count) tanpa
--           kualifikasi alias. Karena `transaction_count` juga dideklarasikan
--           sebagai kolom OUT di RETURNS TABLE, plpgsql melihatnya ambigu.
--           Diperbaiki dengan menambahkan alias tabel pada referensi kolom.
--
-- CATATAN: Migrasi ini TIDAK mengubah/menghapus tabel, kolom, atau nilai.
-- Hanya recreate beberapa FUNCTION (CREATE OR REPLACE) — operasi idempotent.
-- =============================================================


-- =============================================================
-- 1) get_occupancy_per_unit (FIX: cast room_number & apartment_location ke TEXT)
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_occupancy_per_unit(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL,
  p_limit      INT  DEFAULT 10,
  p_offset     INT  DEFAULT 0
)
RETURNS TABLE (
  room_number        TEXT,
  apartment_location TEXT,
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
  WITH filtered AS (
    SELECT
      t.room_number::TEXT        AS room_number,
      t.apartment_location::TEXT AS apartment_location,
      t.checkin_at,
      t.cash_amount,
      t.transfer_amount
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
  ),
  aggregated AS (
    SELECT
      f.room_number,
      f.apartment_location,
      COUNT(*)                                                                AS total_transactions,
      ROUND(SUM(f.cash_amount + f.transfer_amount), 2)                       AS total_revenue,
      ROUND(
        COUNT(DISTINCT DATE(f.checkin_at AT TIME ZONE 'Asia/Jakarta'))::NUMERIC
        / NULLIF((p_end_date - p_start_date + 1), 0) * 100,
        2
      )                                                                       AS occupancy_rate
    FROM filtered f
    GROUP BY f.room_number, f.apartment_location
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM aggregated
  )
  SELECT
    a.room_number,
    a.apartment_location,
    a.total_transactions,
    a.total_revenue,
    a.occupancy_rate,
    c.cnt AS total_count
  FROM aggregated a, counted c
  ORDER BY a.total_transactions DESC, a.room_number
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_occupancy_per_unit(DATE, DATE, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_occupancy_per_unit(DATE, DATE, TEXT, INT, INT) TO authenticated;


-- =============================================================
-- 2) get_profit_per_location (FIX: cast apartment_location ke TEXT)
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_profit_per_location(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL
)
RETURNS TABLE (
  apartment_location          TEXT,
  total_revenue               NUMERIC,
  total_transactions          BIGINT,
  avg_revenue_per_transaction NUMERIC
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
  SELECT
    t.apartment_location::TEXT                                                AS apartment_location,
    ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                          AS total_revenue,
    COUNT(*)                                                                   AS total_transactions,
    ROUND(
      SUM(t.cash_amount + t.transfer_amount) / NULLIF(COUNT(*), 0),
      2
    )                                                                          AS avg_revenue_per_transaction
  FROM public.transactions t
  WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
    AND (p_location IS NULL OR t.apartment_location = p_location)
  GROUP BY t.apartment_location
  ORDER BY total_revenue DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_profit_per_location(DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profit_per_location(DATE, DATE, TEXT) TO authenticated;


-- =============================================================
-- 3) get_guest_source_summary
--    FIX:
--      - Cast source_name ke TEXT (sumber: VARCHAR(255))
--      - Kualifikasi SUM(a.transaction_count) di grand_total agar tidak
--        ambigu dengan kolom OUT `transaction_count`
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_guest_source_summary(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL,
  p_limit      INT  DEFAULT 10,
  p_offset     INT  DEFAULT 0
)
RETURNS TABLE (
  source_name       TEXT,
  transaction_count BIGINT,
  total_revenue     NUMERIC,
  percentage        NUMERIC,
  total_count       BIGINT
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
  WITH aggregated AS (
    SELECT
      COALESCE(NULLIF(TRIM(t.marketing_name), ''), 'Langsung (Tanpa Marketing)')::TEXT AS source_name,
      COUNT(*)                                                                         AS tx_count,
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                                AS revenue
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY COALESCE(NULLIF(TRIM(t.marketing_name), ''), 'Langsung (Tanpa Marketing)')
  ),
  grand_total AS (
    SELECT COALESCE(SUM(a.tx_count), 0) AS total FROM aggregated a
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM aggregated
  )
  SELECT
    a.source_name,
    a.tx_count                                                                         AS transaction_count,
    a.revenue                                                                          AS total_revenue,
    ROUND(
      a.tx_count::NUMERIC / NULLIF(g.total, 0) * 100,
      2
    )                                                                                  AS percentage,
    c.cnt                                                                              AS total_count
  FROM aggregated a, grand_total g, counted c
  ORDER BY a.tx_count DESC, a.source_name
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_guest_source_summary(DATE, DATE, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_guest_source_summary(DATE, DATE, TEXT, INT, INT) TO authenticated;


-- =============================================================
-- 4) get_repeat_guests
--    FIX: cast customer_name ke TEXT (sumber: VARCHAR(255))
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_repeat_guests(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL,
  p_limit      INT  DEFAULT 10,
  p_offset     INT  DEFAULT 0
)
RETURNS TABLE (
  customer_name TEXT,
  visit_count   BIGINT,
  total_revenue NUMERIC,
  first_visit   DATE,
  last_visit    DATE,
  total_count   BIGINT
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
  WITH normalized AS (
    SELECT
      LOWER(TRIM(t.customer_name))                                             AS name_key,
      t.customer_name::TEXT                                                    AS original_name,
      t.checkin_at,
      t.cash_amount,
      t.transfer_amount
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
      AND t.customer_name IS NOT NULL
      AND TRIM(t.customer_name) <> ''
  ),
  first_names AS (
    SELECT DISTINCT ON (name_key)
      name_key,
      original_name
    FROM normalized
    ORDER BY name_key, checkin_at ASC
  ),
  aggregated AS (
    SELECT
      n.name_key,
      COUNT(*)                                                                 AS visit_count,
      ROUND(SUM(n.cash_amount + n.transfer_amount), 2)                        AS total_revenue,
      MIN(DATE(n.checkin_at AT TIME ZONE 'Asia/Jakarta'))                     AS first_visit,
      MAX(DATE(n.checkin_at AT TIME ZONE 'Asia/Jakarta'))                     AS last_visit
    FROM normalized n
    GROUP BY n.name_key
    HAVING COUNT(*) >= 2
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM aggregated
  )
  SELECT
    fn.original_name                                                           AS customer_name,
    a.visit_count,
    a.total_revenue,
    a.first_visit,
    a.last_visit,
    c.cnt                                                                      AS total_count
  FROM aggregated a
  JOIN first_names fn ON fn.name_key = a.name_key
  CROSS JOIN counted c
  ORDER BY a.visit_count DESC, fn.original_name
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_repeat_guests(DATE, DATE, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_repeat_guests(DATE, DATE, TEXT, INT, INT) TO authenticated;


-- =============================================================
-- 5) get_location_fullness
--    FIX 1: cast apartment_location ke TEXT
--    FIX 2: derive total_rooms dari riwayat transaksi (COUNT DISTINCT
--           room_number) bila kolom lokasi_apartemen.total_rooms = 0/NULL.
--           Ini memastikan analitik dapat ditampilkan tanpa harus
--           mengubah/menulis ulang nilai pada tabel — sesuai instruksi
--           "ambil data yang sudah tersaji di database".
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
  -- Hitung jumlah kamar unik per lokasi dari seluruh riwayat transaksi.
  -- Dipakai sebagai fallback bila lokasi_apartemen.total_rooms = 0/NULL
  -- (kolom belum dikonfigurasi admin).
  inferred_rooms AS (
    SELECT
      t.apartment_location::TEXT                                               AS apartment_location,
      COUNT(DISTINCT t.room_number)::INT                                        AS rooms_count
    FROM public.transactions t
    GROUP BY t.apartment_location
  ),
  locations AS (
    SELECT
      la.name::TEXT                                                            AS apartment_location,
      -- Prioritas: nilai konfigurasi admin (>0) > inferensi dari transaksi > 0.
      COALESCE(
        NULLIF(la.total_rooms, 0),
        ir.rooms_count,
        0
      )                                                                        AS total_rooms
    FROM public.lokasi_apartemen la
    LEFT JOIN inferred_rooms ir ON ir.apartment_location = la.name
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
-- 6) get_stay_duration_summary
--    FIX: kualifikasi SUM(a.tx_count) untuk menghindari ambiguitas
--    dengan kolom OUT `transaction_count`. duration_category sudah
--    bertipe TEXT karena hasil CASE expression.
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_stay_duration_summary(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL
)
RETURNS TABLE (
  duration_category TEXT,
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
        WHEN t.rental_duration = 3                                    THEN 'Transit - 3 Jam'
        WHEN t.rental_duration BETWEEN 1 AND 11
             AND t.rental_duration <> 3                               THEN 'Transit - Lainnya'
        WHEN t.rental_duration BETWEEN 12 AND 23                      THEN 'Fullday'
        WHEN t.rental_duration BETWEEN 24 AND 47                      THEN 'Per Malam - 1 Malam'
        WHEN t.rental_duration >= 48                                  THEN 'Per Malam - 2+ Malam'
        ELSE                                                               'Lainnya'
      END::TEXT                                                                AS duration_category,
      t.cash_amount,
      t.transfer_amount
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
  ),
  aggregated AS (
    SELECT
      c.duration_category,
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
    a.tx_count                                                                 AS transaction_count,
    ROUND(
      a.tx_count::NUMERIC / NULLIF(g.total, 0) * 100,
      2
    )                                                                          AS percentage,
    a.revenue                                                                  AS total_revenue
  FROM aggregated a, grand_total g
  ORDER BY a.tx_count DESC, a.duration_category;
END;
$$;

REVOKE ALL ON FUNCTION public.get_stay_duration_summary(DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_stay_duration_summary(DATE, DATE, TEXT) TO authenticated;


-- =============================================================
-- 7) get_daily_revenue_trend (tidak ada bug, namun tetap recreate
--    agar konsisten — TANPA perubahan logika.
-- =============================================================
-- (tidak diubah; sudah bekerja dengan benar)
