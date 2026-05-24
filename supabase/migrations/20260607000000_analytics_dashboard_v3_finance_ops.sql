-- =============================================================
-- MIGRATION: Analytics Dashboard v3 — Finance & Operations RPCs
--
-- Tujuh RPC baru untuk insight finansial dan operasional:
--
--   Tier 1 (Finance):
--     1. get_net_profit_per_location    — revenue − pengeluaran per lokasi
--     2. get_expense_breakdown_summary  — pengeluaran per kategori
--     3. get_payment_method_summary     — cash vs transfer per lokasi
--
--   Tier 2 (Operations):
--     4. get_performance_by_shift       — performa per shift (Pagi/Malam/Long)
--     5. get_performance_by_employee    — performa per karyawan (input_by)
--     6. get_marketing_performance      — performa per marketing
--     7. get_underperforming_rooms      — kamar dengan occupancy < threshold
--
-- Catatan: Migrasi ini TIDAK mengubah schema (tabel/kolom/value).
-- Hanya CREATE OR REPLACE FUNCTION (idempotent).
--
-- Konvensi:
--   - Revenue = SUM(cash_amount + transfer_amount) — TIDAK termasuk deposit.
--   - Pengeluaran filter pakai `pengeluaran.tanggal` (DATE, tanpa TZ conversion)
--     sedangkan transactions pakai DATE(checkin_at AT TIME ZONE 'Asia/Jakarta').
--   - Fungsi paginated punya signature (..., p_limit INT, p_offset INT).
-- =============================================================


-- =============================================================
-- 1) get_net_profit_per_location
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_net_profit_per_location(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL
)
RETURNS TABLE (
  apartment_location TEXT,
  total_revenue      NUMERIC,
  total_expense      NUMERIC,
  net_profit         NUMERIC,
  profit_margin      NUMERIC,
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
  WITH revenue AS (
    SELECT
      t.apartment_location::TEXT                                               AS loc_name,
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                        AS total_revenue
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY t.apartment_location
  ),
  expense AS (
    SELECT
      COALESCE(NULLIF(p.apartment_location, ''), '— Tanpa Lokasi —')::TEXT     AS loc_name,
      ROUND(SUM(p.jumlah), 2)                                                  AS total_expense
    FROM public.pengeluaran p
    WHERE p.tanggal BETWEEN p_start_date AND p_end_date
      AND (
        p_location IS NULL
        OR p.apartment_location = p_location
      )
    GROUP BY COALESCE(NULLIF(p.apartment_location, ''), '— Tanpa Lokasi —')
  ),
  -- Union dari revenue & expense agar lokasi tanpa transaksi tapi punya
  -- pengeluaran tetap muncul (dan sebaliknya).
  combined AS (
    SELECT loc_name FROM revenue
    UNION
    SELECT loc_name FROM expense
  ),
  joined AS (
    SELECT
      c.loc_name,
      COALESCE(r.total_revenue, 0)                                             AS total_revenue,
      COALESCE(e.total_expense, 0)                                             AS total_expense
    FROM combined c
    LEFT JOIN revenue r ON r.loc_name = c.loc_name
    LEFT JOIN expense e ON e.loc_name = c.loc_name
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM joined
  )
  SELECT
    j.loc_name                                                                 AS apartment_location,
    j.total_revenue,
    j.total_expense,
    ROUND(j.total_revenue - j.total_expense, 2)                                AS net_profit,
    ROUND(
      (j.total_revenue - j.total_expense) / NULLIF(j.total_revenue, 0) * 100,
      2
    )                                                                          AS profit_margin,
    c.cnt                                                                      AS total_count
  FROM joined j, counted c
  ORDER BY (j.total_revenue - j.total_expense) DESC, j.loc_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_net_profit_per_location(DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_net_profit_per_location(DATE, DATE, TEXT) TO authenticated;


-- =============================================================
-- 2) get_expense_breakdown_summary
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_expense_breakdown_summary(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL
)
RETURNS TABLE (
  category          TEXT,
  total_expense     NUMERIC,
  expense_count     BIGINT,
  percentage        NUMERIC
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
      COALESCE(NULLIF(TRIM(p.category), ''), 'Lain-lain')::TEXT                AS category,
      ROUND(SUM(p.jumlah), 2)                                                  AS total_expense,
      COUNT(*)                                                                 AS expense_count
    FROM public.pengeluaran p
    WHERE p.tanggal BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR p.apartment_location = p_location)
    GROUP BY COALESCE(NULLIF(TRIM(p.category), ''), 'Lain-lain')
  ),
  grand_total AS (
    SELECT COALESCE(SUM(a.total_expense), 0) AS total FROM aggregated a
  )
  SELECT
    a.category,
    a.total_expense,
    a.expense_count,
    ROUND(
      a.total_expense / NULLIF(g.total, 0) * 100,
      2
    )                                                                          AS percentage
  FROM aggregated a, grand_total g
  ORDER BY a.total_expense DESC, a.category;
END;
$$;

REVOKE ALL ON FUNCTION public.get_expense_breakdown_summary(DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_expense_breakdown_summary(DATE, DATE, TEXT) TO authenticated;


-- =============================================================
-- 3) get_payment_method_summary
--    Cash vs Transfer breakdown per lokasi.
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_payment_method_summary(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL
)
RETURNS TABLE (
  apartment_location TEXT,
  total_cash         NUMERIC,
  total_transfer     NUMERIC,
  total_revenue      NUMERIC,
  cash_percentage    NUMERIC,
  transfer_percentage NUMERIC,
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
  WITH aggregated AS (
    SELECT
      t.apartment_location::TEXT                                               AS apartment_location,
      ROUND(SUM(t.cash_amount), 2)                                             AS total_cash,
      ROUND(SUM(t.transfer_amount), 2)                                         AS total_transfer,
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                        AS total_revenue
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY t.apartment_location
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM aggregated
  )
  SELECT
    a.apartment_location,
    a.total_cash,
    a.total_transfer,
    a.total_revenue,
    ROUND(a.total_cash / NULLIF(a.total_revenue, 0) * 100, 2)                  AS cash_percentage,
    ROUND(a.total_transfer / NULLIF(a.total_revenue, 0) * 100, 2)              AS transfer_percentage,
    c.cnt                                                                      AS total_count
  FROM aggregated a, counted c
  ORDER BY a.total_revenue DESC, a.apartment_location;
END;
$$;

REVOKE ALL ON FUNCTION public.get_payment_method_summary(DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_payment_method_summary(DATE, DATE, TEXT) TO authenticated;


-- =============================================================
-- 4) get_performance_by_shift
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_performance_by_shift(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL
)
RETURNS TABLE (
  shift                       TEXT,
  total_transactions          BIGINT,
  total_revenue               NUMERIC,
  avg_revenue_per_transaction NUMERIC,
  percentage                  NUMERIC
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
      COALESCE(NULLIF(TRIM(t.shift), ''), 'Tidak Diisi')::TEXT                  AS shift,
      COUNT(*)                                                                  AS tx_count,
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                         AS revenue
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY COALESCE(NULLIF(TRIM(t.shift), ''), 'Tidak Diisi')
  ),
  grand_total AS (
    SELECT COALESCE(SUM(a.tx_count), 0) AS total FROM aggregated a
  )
  SELECT
    a.shift,
    a.tx_count                                                                 AS total_transactions,
    a.revenue                                                                  AS total_revenue,
    ROUND(a.revenue / NULLIF(a.tx_count, 0), 2)                                AS avg_revenue_per_transaction,
    ROUND(a.tx_count::NUMERIC / NULLIF(g.total, 0) * 100, 2)                   AS percentage
  FROM aggregated a, grand_total g
  ORDER BY a.tx_count DESC, a.shift;
END;
$$;

REVOKE ALL ON FUNCTION public.get_performance_by_shift(DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_performance_by_shift(DATE, DATE, TEXT) TO authenticated;


-- =============================================================
-- 5) get_performance_by_employee
--    Server-side paginated, satu baris per `input_by`.
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_performance_by_employee(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL,
  p_limit      INT  DEFAULT 10,
  p_offset     INT  DEFAULT 0
)
RETURNS TABLE (
  employee_name               TEXT,
  total_transactions          BIGINT,
  total_revenue               NUMERIC,
  avg_revenue_per_transaction NUMERIC,
  total_count                 BIGINT
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
      COALESCE(NULLIF(TRIM(t.input_by), ''), 'Tidak Diketahui')::TEXT          AS employee_name,
      COUNT(*)                                                                 AS tx_count,
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                        AS revenue
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY COALESCE(NULLIF(TRIM(t.input_by), ''), 'Tidak Diketahui')
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM aggregated
  )
  SELECT
    a.employee_name,
    a.tx_count                                                                 AS total_transactions,
    a.revenue                                                                  AS total_revenue,
    ROUND(a.revenue / NULLIF(a.tx_count, 0), 2)                                AS avg_revenue_per_transaction,
    c.cnt                                                                      AS total_count
  FROM aggregated a, counted c
  ORDER BY a.tx_count DESC, a.employee_name
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_performance_by_employee(DATE, DATE, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_performance_by_employee(DATE, DATE, TEXT, INT, INT) TO authenticated;


-- =============================================================
-- 6) get_marketing_performance
--    Server-side paginated. Skip 'Langsung (Tanpa Marketing)' bucket bila
--    marketing_name kosong → masuk 'Langsung (Tanpa Marketing)' agar konsisten
--    dengan get_guest_source_summary.
--    Metrik:
--      - revenue_brought         : SUM(cash_amount + transfer_amount)
--      - total_fee               : SUM(marketing_fee) — kewajiban fee
--      - fee_to_revenue_ratio    : total_fee / revenue × 100
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_marketing_performance(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL,
  p_limit      INT  DEFAULT 10,
  p_offset     INT  DEFAULT 0
)
RETURNS TABLE (
  marketing_name        TEXT,
  total_transactions    BIGINT,
  revenue_brought       NUMERIC,
  total_fee             NUMERIC,
  fee_to_revenue_ratio  NUMERIC,
  total_count           BIGINT
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
      COALESCE(NULLIF(TRIM(t.marketing_name), ''), 'Langsung (Tanpa Marketing)')::TEXT AS marketing_name,
      COUNT(*)                                                                          AS tx_count,
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                                 AS revenue_brought,
      ROUND(COALESCE(SUM(t.marketing_fee), 0), 2)                                       AS total_fee
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY COALESCE(NULLIF(TRIM(t.marketing_name), ''), 'Langsung (Tanpa Marketing)')
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM aggregated
  )
  SELECT
    a.marketing_name,
    a.tx_count                                                                 AS total_transactions,
    a.revenue_brought,
    a.total_fee,
    ROUND(
      a.total_fee / NULLIF(a.revenue_brought, 0) * 100,
      2
    )                                                                          AS fee_to_revenue_ratio,
    c.cnt                                                                      AS total_count
  FROM aggregated a, counted c
  ORDER BY a.revenue_brought DESC, a.marketing_name
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_marketing_performance(DATE, DATE, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketing_performance(DATE, DATE, TEXT, INT, INT) TO authenticated;


-- =============================================================
-- 7) get_underperforming_rooms
--    Kamar dari nomor_kamar dengan occupancy_rate < threshold (default 30%).
--    Lokasi tanpa total_rooms juga ikut diperhitungkan (per kamar individual,
--    sehingga tidak bergantung pada kolom lokasi.total_rooms).
--    occupancy_rate = COUNT(DISTINCT DATE(checkin_at)) / total_days × 100.
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_underperforming_rooms(
  p_start_date     DATE,
  p_end_date       DATE,
  p_location       TEXT    DEFAULT NULL,
  p_threshold_pct  NUMERIC DEFAULT 30,
  p_limit          INT     DEFAULT 10,
  p_offset         INT     DEFAULT 0
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
  WITH period_days AS (
    SELECT (p_end_date - p_start_date + 1) AS total_days
  ),
  -- Master daftar kamar dari tabel nomor_kamar
  rooms AS (
    SELECT
      nk.name::TEXT                                                            AS room_number,
      nk.lokasi::TEXT                                                          AS apartment_location
    FROM public.nomor_kamar nk
    WHERE (p_location IS NULL OR nk.lokasi = p_location)
  ),
  -- Statistik per kamar dalam periode
  stats AS (
    SELECT
      t.room_number::TEXT                                                      AS room_number,
      t.apartment_location::TEXT                                               AS apartment_location,
      COUNT(*)                                                                 AS total_transactions,
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                        AS total_revenue,
      COUNT(DISTINCT DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta'))           AS days_used
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY t.room_number, t.apartment_location
  ),
  joined AS (
    SELECT
      r.room_number,
      r.apartment_location,
      COALESCE(s.total_transactions, 0)                                        AS total_transactions,
      COALESCE(s.total_revenue, 0)                                             AS total_revenue,
      ROUND(
        COALESCE(s.days_used, 0)::NUMERIC / NULLIF(pd.total_days, 0) * 100,
        2
      )                                                                        AS occupancy_rate
    FROM rooms r
    LEFT JOIN stats s
      ON s.room_number = r.room_number
     AND s.apartment_location = r.apartment_location
    CROSS JOIN period_days pd
  ),
  filtered AS (
    SELECT *
    FROM joined j
    WHERE j.occupancy_rate < p_threshold_pct
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM filtered
  )
  SELECT
    f.room_number,
    f.apartment_location,
    f.total_transactions,
    f.total_revenue,
    f.occupancy_rate,
    c.cnt                                                                      AS total_count
  FROM filtered f, counted c
  ORDER BY f.occupancy_rate ASC, f.apartment_location, f.room_number
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_underperforming_rooms(DATE, DATE, TEXT, NUMERIC, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_underperforming_rooms(DATE, DATE, TEXT, NUMERIC, INT, INT) TO authenticated;
