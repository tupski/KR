-- =============================================================
-- MIGRATION: Analytics Dashboard v4 — Trend, YoY, Outstanding Bills, KPIs
--
-- Empat RPC baru:
--
--   Tier 3:
--     1. get_monthly_revenue_trend       — agregat bulanan (DATE_TRUNC)
--     2. get_revenue_yoy_comparison      — YoY current vs same period 1 tahun lalu
--     3. get_outstanding_bills_summary   — tagihan unpaid dengan aging buckets
--
--   Tier 4 (KPI Cards):
--     4. get_dashboard_kpis              — KPI ringkas + delta vs periode sebelumnya
--
-- Catatan: TIDAK mengubah schema/tabel/kolom. Hanya CREATE OR REPLACE FUNCTION.
-- =============================================================


-- =============================================================
-- 1) get_monthly_revenue_trend
--    Agregat bulanan untuk periode panjang. month_start = DATE_TRUNC('month', checkin_at).
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_monthly_revenue_trend(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL
)
RETURNS TABLE (
  month_start                 DATE,
  month_label                 TEXT,
  total_revenue               NUMERIC,
  transaction_count           BIGINT,
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
  WITH aggregated AS (
    SELECT
      DATE_TRUNC('month', t.checkin_at AT TIME ZONE 'Asia/Jakarta')::DATE       AS month_start,
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                         AS total_revenue,
      COUNT(*)                                                                  AS transaction_count
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY DATE_TRUNC('month', t.checkin_at AT TIME ZONE 'Asia/Jakarta')
  )
  SELECT
    a.month_start,
    TO_CHAR(a.month_start, 'Mon YYYY')::TEXT                                   AS month_label,
    a.total_revenue,
    a.transaction_count,
    ROUND(a.total_revenue / NULLIF(a.transaction_count, 0), 2)                 AS avg_revenue_per_transaction
  FROM aggregated a
  ORDER BY a.month_start ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_monthly_revenue_trend(DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_monthly_revenue_trend(DATE, DATE, TEXT) TO authenticated;


-- =============================================================
-- 2) get_revenue_yoy_comparison
--    Bandingkan revenue & transaction_count untuk periode yang dipilih VS
--    periode yang sama persis pada tahun sebelumnya (tanggal yang sama,
--    1 tahun ke belakang).
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_revenue_yoy_comparison(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL
)
RETURNS TABLE (
  current_revenue              NUMERIC,
  current_transactions         BIGINT,
  previous_revenue             NUMERIC,
  previous_transactions        BIGINT,
  revenue_change_pct           NUMERIC,
  transactions_change_pct      NUMERIC,
  current_period_label         TEXT,
  previous_period_label        TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_start DATE := (p_start_date - INTERVAL '1 year')::DATE;
  v_prev_end   DATE := (p_end_date   - INTERVAL '1 year')::DATE;
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH cur AS (
    SELECT
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                         AS revenue,
      COUNT(*)                                                                 AS tx_count
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
  ),
  prev AS (
    SELECT
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                         AS revenue,
      COUNT(*)                                                                 AS tx_count
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN v_prev_start AND v_prev_end
      AND (p_location IS NULL OR t.apartment_location = p_location)
  )
  SELECT
    COALESCE(c.revenue, 0)                                                     AS current_revenue,
    COALESCE(c.tx_count, 0)                                                    AS current_transactions,
    COALESCE(p.revenue, 0)                                                     AS previous_revenue,
    COALESCE(p.tx_count, 0)                                                    AS previous_transactions,
    ROUND(
      (COALESCE(c.revenue, 0) - COALESCE(p.revenue, 0))
        / NULLIF(p.revenue, 0) * 100,
      2
    )                                                                          AS revenue_change_pct,
    ROUND(
      (COALESCE(c.tx_count, 0) - COALESCE(p.tx_count, 0))::NUMERIC
        / NULLIF(p.tx_count, 0) * 100,
      2
    )                                                                          AS transactions_change_pct,
    (TO_CHAR(p_start_date, 'DD Mon YYYY') || ' – ' || TO_CHAR(p_end_date, 'DD Mon YYYY'))::TEXT
                                                                                AS current_period_label,
    (TO_CHAR(v_prev_start, 'DD Mon YYYY') || ' – ' || TO_CHAR(v_prev_end, 'DD Mon YYYY'))::TEXT
                                                                                AS previous_period_label
  FROM cur c, prev p;
END;
$$;

REVOKE ALL ON FUNCTION public.get_revenue_yoy_comparison(DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_yoy_comparison(DATE, DATE, TEXT) TO authenticated;


-- =============================================================
-- 3) get_outstanding_bills_summary
--    Tagihan dengan status='unpaid', dipecah per aging bucket berdasarkan
--    selisih hari antara CURRENT_DATE (Asia/Jakarta) dan due_date.
--      - Belum jatuh tempo  : days_overdue < 0  (due_date di masa depan)
--      - 0–30 hari          : 0 <= days_overdue <= 30
--      - 31–60 hari         : 31..60
--      - 61–90 hari         : 61..90
--      - >90 hari           : > 90
--
--    p_location filter opsional (NULL = semua lokasi).
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_outstanding_bills_summary(
  p_location TEXT DEFAULT NULL
)
RETURNS TABLE (
  aging_bucket   TEXT,
  bucket_order   INT,
  bill_count     BIGINT,
  total_amount   NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Jakarta')::DATE;
BEGIN
  RETURN QUERY
  WITH bills AS (
    SELECT
      tb.amount,
      (v_today - tb.due_date) AS days_overdue
    FROM public.tagihan_bulanan tb
    WHERE tb.status = 'unpaid'
      AND (p_location IS NULL OR tb.apartment_location = p_location)
  ),
  bucketed AS (
    SELECT
      CASE
        WHEN days_overdue < 0                       THEN 'Belum Jatuh Tempo'
        WHEN days_overdue BETWEEN 0 AND 30          THEN '0–30 hari'
        WHEN days_overdue BETWEEN 31 AND 60         THEN '31–60 hari'
        WHEN days_overdue BETWEEN 61 AND 90         THEN '61–90 hari'
        ELSE                                              '>90 hari'
      END                                                                      AS aging_bucket,
      CASE
        WHEN days_overdue < 0                       THEN 1
        WHEN days_overdue BETWEEN 0 AND 30          THEN 2
        WHEN days_overdue BETWEEN 31 AND 60         THEN 3
        WHEN days_overdue BETWEEN 61 AND 90         THEN 4
        ELSE                                              5
      END                                                                      AS bucket_order,
      amount
    FROM bills
  ),
  aggregated AS (
    SELECT
      b.aging_bucket,
      MIN(b.bucket_order)                                                      AS bucket_order,
      COUNT(*)                                                                 AS bill_count,
      ROUND(SUM(b.amount), 2)                                                  AS total_amount
    FROM bucketed b
    GROUP BY b.aging_bucket
  )
  SELECT
    a.aging_bucket::TEXT,
    a.bucket_order,
    a.bill_count,
    a.total_amount
  FROM aggregated a
  ORDER BY a.bucket_order;
END;
$$;

REVOKE ALL ON FUNCTION public.get_outstanding_bills_summary(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_outstanding_bills_summary(TEXT) TO authenticated;


-- =============================================================
-- 4) get_dashboard_kpis
--    KPI ringkas untuk header dashboard. Mengembalikan satu baris dengan:
--      - total_revenue
--      - total_expense
--      - net_profit
--      - total_transactions
--      - unique_customers
--      - avg_occupancy_rate         (rata-rata harian seluruh lokasi)
--    Plus delta % vs periode sebelumnya yang panjangnya sama persis.
--
--    Periode previous = (start - len, end - len) di mana
--    len = (end - start + 1) hari.
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_revenue                 NUMERIC,
  total_expense                 NUMERIC,
  net_profit                    NUMERIC,
  total_transactions            BIGINT,
  unique_customers              BIGINT,
  avg_occupancy_rate            NUMERIC,
  prev_total_revenue            NUMERIC,
  prev_total_expense            NUMERIC,
  prev_net_profit               NUMERIC,
  prev_total_transactions       BIGINT,
  prev_unique_customers         BIGINT,
  revenue_change_pct            NUMERIC,
  expense_change_pct            NUMERIC,
  net_profit_change_pct         NUMERIC,
  transactions_change_pct       NUMERIC,
  customers_change_pct          NUMERIC,
  current_period_label          TEXT,
  previous_period_label         TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_days INT  := (p_end_date - p_start_date + 1);
  v_prev_start  DATE := (p_start_date - v_period_days);
  v_prev_end    DATE := (p_start_date - 1);
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH
  cur_tx AS (
    SELECT
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                         AS revenue,
      COUNT(*)                                                                  AS tx_count,
      COUNT(DISTINCT LOWER(TRIM(t.customer_name))) FILTER (
        WHERE t.customer_name IS NOT NULL AND TRIM(t.customer_name) <> ''
      )                                                                         AS uniq_cust
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
  ),
  prev_tx AS (
    SELECT
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                         AS revenue,
      COUNT(*)                                                                  AS tx_count,
      COUNT(DISTINCT LOWER(TRIM(t.customer_name))) FILTER (
        WHERE t.customer_name IS NOT NULL AND TRIM(t.customer_name) <> ''
      )                                                                         AS uniq_cust
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN v_prev_start AND v_prev_end
      AND (p_location IS NULL OR t.apartment_location = p_location)
  ),
  cur_exp AS (
    SELECT ROUND(SUM(p.jumlah), 2) AS expense
    FROM public.pengeluaran p
    WHERE p.tanggal BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR p.apartment_location = p_location)
  ),
  prev_exp AS (
    SELECT ROUND(SUM(p.jumlah), 2) AS expense
    FROM public.pengeluaran p
    WHERE p.tanggal BETWEEN v_prev_start AND v_prev_end
      AND (p_location IS NULL OR p.apartment_location = p_location)
  ),
  -- Avg occupancy: total kamar dari nomor_kamar (filter lokasi),
  -- dipakai sebagai pembagi untuk seluruh hari periode.
  rooms_count AS (
    SELECT COALESCE(SUM(rc), 0) AS total_rooms
    FROM (
      SELECT COUNT(*) AS rc
      FROM public.nomor_kamar nk
      WHERE (p_location IS NULL OR nk.lokasi = p_location)
    ) sub
  ),
  daily_occupancy AS (
    SELECT
      DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') AS d,
      COUNT(DISTINCT (t.apartment_location || '|' || t.room_number)) AS rooms_used
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta')
  ),
  occ AS (
    SELECT
      ROUND(
        SUM(do_d.rooms_used::NUMERIC / NULLIF(rc.total_rooms, 0) * 100)
        / NULLIF(v_period_days, 0),
        2
      ) AS avg_occ
    FROM daily_occupancy do_d
    CROSS JOIN rooms_count rc
  )
  SELECT
    COALESCE(ct.revenue, 0)                                                    AS total_revenue,
    COALESCE(ce.expense, 0)                                                    AS total_expense,
    ROUND(COALESCE(ct.revenue, 0) - COALESCE(ce.expense, 0), 2)               AS net_profit,
    COALESCE(ct.tx_count, 0)                                                   AS total_transactions,
    COALESCE(ct.uniq_cust, 0)                                                  AS unique_customers,
    COALESCE(o.avg_occ, 0)                                                     AS avg_occupancy_rate,
    COALESCE(pt.revenue, 0)                                                    AS prev_total_revenue,
    COALESCE(pe.expense, 0)                                                    AS prev_total_expense,
    ROUND(COALESCE(pt.revenue, 0) - COALESCE(pe.expense, 0), 2)               AS prev_net_profit,
    COALESCE(pt.tx_count, 0)                                                   AS prev_total_transactions,
    COALESCE(pt.uniq_cust, 0)                                                  AS prev_unique_customers,
    ROUND(
      (COALESCE(ct.revenue, 0) - COALESCE(pt.revenue, 0))
        / NULLIF(pt.revenue, 0) * 100,
      2
    )                                                                          AS revenue_change_pct,
    ROUND(
      (COALESCE(ce.expense, 0) - COALESCE(pe.expense, 0))
        / NULLIF(pe.expense, 0) * 100,
      2
    )                                                                          AS expense_change_pct,
    ROUND(
      (
        (COALESCE(ct.revenue, 0) - COALESCE(ce.expense, 0))
        - (COALESCE(pt.revenue, 0) - COALESCE(pe.expense, 0))
      )
      / NULLIF(COALESCE(pt.revenue, 0) - COALESCE(pe.expense, 0), 0) * 100,
      2
    )                                                                          AS net_profit_change_pct,
    ROUND(
      (COALESCE(ct.tx_count, 0) - COALESCE(pt.tx_count, 0))::NUMERIC
        / NULLIF(pt.tx_count, 0) * 100,
      2
    )                                                                          AS transactions_change_pct,
    ROUND(
      (COALESCE(ct.uniq_cust, 0) - COALESCE(pt.uniq_cust, 0))::NUMERIC
        / NULLIF(pt.uniq_cust, 0) * 100,
      2
    )                                                                          AS customers_change_pct,
    (TO_CHAR(p_start_date, 'DD Mon YYYY') || ' – ' || TO_CHAR(p_end_date, 'DD Mon YYYY'))::TEXT
                                                                                AS current_period_label,
    (TO_CHAR(v_prev_start, 'DD Mon YYYY') || ' – ' || TO_CHAR(v_prev_end, 'DD Mon YYYY'))::TEXT
                                                                                AS previous_period_label
  FROM cur_tx ct, prev_tx pt, cur_exp ce, prev_exp pe, occ o;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_kpis(DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis(DATE, DATE, TEXT) TO authenticated;
