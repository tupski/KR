-- =============================================================
-- Migration 007: Analytics Dashboard RPCs
-- Versi FINAL (supersedes v1–v4 dari Supabase migrations)
-- Sumber: 20260601, 20260605_fix, 20260606_v2, 20260607_v3, 20260608_v4
-- Requires: 003_core_tables.sql, 005_finance_tables.sql
--
-- PERUBAHAN vs Supabase:
--   - Hapus SECURITY DEFINER, SET search_path, GRANT/REVOKE
--   - Tidak ada auth.uid() — fungsi analytics tidak butuh user context
--   - cash_amount / transfer_amount adalah nama kolom canonical
-- =============================================================


-- =============================================================
-- 1) get_category_summary
--    Agregasi pengeluaran per kategori untuk filter lokasi/kamar/tanggal
--    Sumber: 20260420_get_category_summary_rpc.sql
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_category_summary(
    p_lokasi     TEXT DEFAULT NULL,
    p_kamar      TEXT DEFAULT NULL,
    p_start_date DATE DEFAULT NULL,
    p_end_date   DATE DEFAULT NULL
)
RETURNS TABLE (
    category          TEXT,
    total_amount      NUMERIC,
    transaction_count BIGINT
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        COALESCE(NULLIF(TRIM(p.category), ''), 'Lainnya') AS category,
        SUM(p.jumlah)                                      AS total_amount,
        COUNT(*)                                           AS transaction_count
    FROM public.pengeluaran p
    WHERE
        (p_lokasi     IS NULL OR p.apartment_location = p_lokasi)
        AND (p_kamar  IS NULL OR p.room_number        = p_kamar)
        AND (p_start_date IS NULL OR p.tanggal >= p_start_date)
        AND (p_end_date   IS NULL OR p.tanggal <= p_end_date)
    GROUP BY COALESCE(NULLIF(TRIM(p.category), ''), 'Lainnya')
    ORDER BY total_amount DESC;
$$;


-- =============================================================
-- 2) get_occupancy_per_unit
--    Okupansi per kamar (paginated)
--    Versi FIX dari 20260605: cast VARCHAR → TEXT eksplisit
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
            COUNT(*)                                                                        AS total_transactions,
            ROUND(SUM(f.cash_amount + f.transfer_amount), 2)                               AS total_revenue,
            ROUND(
                COUNT(DISTINCT DATE(f.checkin_at AT TIME ZONE 'Asia/Jakarta'))::NUMERIC
                / NULLIF((p_end_date - p_start_date + 1), 0) * 100,
                2
            )                                                                              AS occupancy_rate
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


-- =============================================================
-- 3) get_profit_per_location
--    Revenue + total transaksi per lokasi
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
AS $$
BEGIN
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
    END IF;

    RETURN QUERY
    SELECT
        t.apartment_location::TEXT                                                         AS apartment_location,
        ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                                  AS total_revenue,
        COUNT(*)                                                                           AS total_transactions,
        ROUND(SUM(t.cash_amount + t.transfer_amount) / NULLIF(COUNT(*), 0), 2)            AS avg_revenue_per_transaction
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY t.apartment_location
    ORDER BY total_revenue DESC;
END;
$$;


-- =============================================================
-- 4) get_checkin_heatmap
--    Distribusi jam check-in (selalu 24 baris, jam 0–23)
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_checkin_heatmap(
    p_start_date DATE,
    p_end_date   DATE,
    p_location   TEXT DEFAULT NULL
)
RETURNS TABLE (
    hour              INT,
    transaction_count BIGINT,
    percentage        NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
    END IF;

    RETURN QUERY
    WITH hours AS (
        SELECT generate_series(0, 23) AS h
    ),
    checkins AS (
        SELECT
            EXTRACT(HOUR FROM (t.checkin_at AT TIME ZONE 'Asia/Jakarta'))::INT AS h,
            COUNT(*)                                                            AS cnt
        FROM public.transactions t
        WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
          AND (p_location IS NULL OR t.apartment_location = p_location)
        GROUP BY EXTRACT(HOUR FROM (t.checkin_at AT TIME ZONE 'Asia/Jakarta'))
    ),
    total AS (
        SELECT COALESCE(SUM(cnt), 0) AS grand_total FROM checkins
    )
    SELECT
        hours.h                                                                 AS hour,
        COALESCE(checkins.cnt, 0)                                               AS transaction_count,
        ROUND(
            COALESCE(checkins.cnt, 0)::NUMERIC / NULLIF(total.grand_total, 0) * 100,
            2
        )                                                                       AS percentage
    FROM hours
    LEFT JOIN checkins ON checkins.h = hours.h
    CROSS JOIN total
    ORDER BY hours.h;
END;
$$;


-- =============================================================
-- 5) get_guest_source_summary
--    Sumber tamu / marketing (paginated)
--    Versi FIX dari 20260605: alias CTE untuk hindari ambiguitas
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
AS $$
BEGIN
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
    END IF;

    RETURN QUERY
    WITH aggregated AS (
        SELECT
            COALESCE(NULLIF(TRIM(t.marketing_name), ''), 'Langsung (Tanpa Marketing)') AS source_name,
            COUNT(*)                                                                    AS tx_count,
            ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                           AS revenue
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
        a.tx_count                                                                     AS transaction_count,
        a.revenue                                                                      AS total_revenue,
        ROUND(a.tx_count::NUMERIC / NULLIF(g.total, 0) * 100, 2)                      AS percentage,
        c.cnt                                                                          AS total_count
    FROM aggregated a, grand_total g, counted c
    ORDER BY a.tx_count DESC, a.source_name
    LIMIT p_limit OFFSET p_offset;
END;
$$;


-- =============================================================
-- 6) get_repeat_guests
--    Tamu dengan kunjungan >= 2; normalisasi nama (LOWER TRIM)
--    Versi FIX dari 20260605: cast customer_name → TEXT
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
AS $$
BEGIN
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
    END IF;

    RETURN QUERY
    WITH normalized AS (
        SELECT
            LOWER(TRIM(t.customer_name))  AS name_key,
            t.customer_name::TEXT         AS original_name,
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
            COUNT(*)                                                              AS visit_count,
            ROUND(SUM(n.cash_amount + n.transfer_amount), 2)                     AS total_revenue,
            MIN(DATE(n.checkin_at AT TIME ZONE 'Asia/Jakarta'))                  AS first_visit,
            MAX(DATE(n.checkin_at AT TIME ZONE 'Asia/Jakarta'))                  AS last_visit
        FROM normalized n
        GROUP BY n.name_key
        HAVING COUNT(*) >= 2
    ),
    counted AS (
        SELECT COUNT(*) AS cnt FROM aggregated
    )
    SELECT
        fn.original_name                                                         AS customer_name,
        a.visit_count,
        a.total_revenue,
        a.first_visit,
        a.last_visit,
        c.cnt                                                                    AS total_count
    FROM aggregated a
    JOIN first_names fn ON fn.name_key = a.name_key
    CROSS JOIN counted c
    ORDER BY a.visit_count DESC, a.total_revenue DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;


-- =============================================================
-- 7) get_location_fullness
--    Tingkat kepenuhan per lokasi (v2: nomor_kamar sebagai sumber otoritatif)
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
            nk.lokasi::TEXT AS apartment_location,
            COUNT(*)::INT   AS rooms_count
        FROM public.nomor_kamar nk
        WHERE (p_location IS NULL OR nk.lokasi = p_location)
        GROUP BY nk.lokasi
    ),
    locations AS (
        SELECT
            la.name::TEXT                                                         AS apartment_location,
            COALESCE(rc.rooms_count,
                NULLIF(la.total_rooms, 0),
                0
            )                                                                     AS total_rooms
        FROM public.lokasi_apartemen la
        LEFT JOIN rooms_count rc ON rc.apartment_location = la.name::TEXT
        WHERE (p_location IS NULL OR la.name = p_location)
    ),
    tx_stats AS (
        SELECT
            t.apartment_location::TEXT  AS apartment_location,
            COUNT(*)                    AS total_transactions
        FROM public.transactions t
        WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
          AND (p_location IS NULL OR t.apartment_location = p_location)
        GROUP BY t.apartment_location
    ),
    daily_occupancy AS (
        SELECT
            t.apartment_location::TEXT                     AS apartment_location,
            DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') AS checkin_date,
            COUNT(DISTINCT t.room_number)                  AS rooms_occupied
        FROM public.transactions t
        WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
          AND (p_location IS NULL OR t.apartment_location = p_location)
        GROUP BY t.apartment_location, DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta')
    ),
    occupancy_stats AS (
        SELECT
            do_data.apartment_location,
            MAX(
                ROUND(do_data.rooms_occupied::NUMERIC / NULLIF(loc.total_rooms, 0) * 100, 2)
            )                                                                     AS peak_occupancy_rate,
            ROUND(
                SUM(do_data.rooms_occupied::NUMERIC / NULLIF(loc.total_rooms, 0) * 100)
                / NULLIF(pd.total_days, 0),
                2
            )                                                                     AS avg_occupancy_rate
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
        COALESCE(os.peak_occupancy_rate, 0)                                      AS peak_occupancy_rate,
        COALESCE(os.avg_occupancy_rate, 0)                                       AS avg_occupancy_rate,
        COALESCE(ts.total_transactions, 0)                                       AS total_transactions,
        c.cnt                                                                    AS total_count
    FROM locations loc
    LEFT JOIN tx_stats ts ON ts.apartment_location = loc.apartment_location
    LEFT JOIN occupancy_stats os ON os.apartment_location = loc.apartment_location
    CROSS JOIN counted c
    ORDER BY COALESCE(ts.total_transactions, 0) DESC, loc.apartment_location;
END;
$$;


-- =============================================================
-- 8) get_occupancy_per_location
--    Agregasi okupansi per LOKASI (bukan per kamar)
--    Sumber: 20260606_v2
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
            nk.lokasi::TEXT AS apartment_location,
            COUNT(*)::INT   AS rooms_count
        FROM public.nomor_kamar nk
        WHERE (p_location IS NULL OR nk.lokasi = p_location)
        GROUP BY nk.lokasi
    ),
    locations AS (
        SELECT
            la.name::TEXT                                                         AS apartment_location,
            COALESCE(rc.rooms_count, NULLIF(la.total_rooms, 0), 0)               AS total_rooms
        FROM public.lokasi_apartemen la
        LEFT JOIN rooms_count rc ON rc.apartment_location = la.name::TEXT
        WHERE (p_location IS NULL OR la.name = p_location)
    ),
    tx_stats AS (
        SELECT
            t.apartment_location::TEXT                                            AS apartment_location,
            COUNT(*)                                                              AS total_transactions,
            ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                     AS total_revenue
        FROM public.transactions t
        WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
          AND (p_location IS NULL OR t.apartment_location = p_location)
        GROUP BY t.apartment_location
    ),
    daily_occupancy AS (
        SELECT
            t.apartment_location::TEXT                                            AS apartment_location,
            DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta')                        AS checkin_date,
            COUNT(DISTINCT t.room_number)                                         AS rooms_occupied
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
            )                                                                     AS occupancy_rate
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
        COALESCE(ts.total_transactions, 0)                                        AS total_transactions,
        COALESCE(ts.total_revenue, 0)                                             AS total_revenue,
        CASE WHEN loc.total_rooms IS NULL OR loc.total_rooms = 0
            THEN NULL
            ELSE os.occupancy_rate
        END                                                                       AS occupancy_rate,
        c.cnt                                                                     AS total_count
    FROM locations loc
    LEFT JOIN tx_stats ts ON ts.apartment_location = loc.apartment_location
    LEFT JOIN occupancy_stats os ON os.apartment_location = loc.apartment_location
    CROSS JOIN counted c
    ORDER BY COALESCE(ts.total_transactions, 0) DESC, loc.apartment_location;
END;
$$;


-- =============================================================
-- 9) get_stay_duration_summary
--    Distribusi durasi menginap (v2: tiap jam transit 1–11 tersendiri)
--    DROP dulu karena signature RETURNS TABLE berubah dari v1
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
                WHEN t.rental_duration BETWEEN 12 AND 23 THEN 'Fullday'
                WHEN t.rental_duration BETWEEN 24 AND 47 THEN 'Per Malam - 1 Malam'
                WHEN t.rental_duration >= 48             THEN 'Per Malam - 2+ Malam'
                ELSE                                         'Lainnya'
            END::TEXT                                                             AS duration_category,
            CASE
                WHEN t.rental_duration BETWEEN 1 AND 11  THEN t.rental_duration
                WHEN t.rental_duration BETWEEN 12 AND 23 THEN 100
                WHEN t.rental_duration BETWEEN 24 AND 47 THEN 200
                WHEN t.rental_duration >= 48             THEN 300
                ELSE                                         999
            END                                                                   AS duration_sort_key,
            t.cash_amount,
            t.transfer_amount
        FROM public.transactions t
        WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
          AND (p_location IS NULL OR t.apartment_location = p_location)
    ),
    aggregated AS (
        SELECT
            c.duration_category,
            MIN(c.duration_sort_key)                                              AS sort_key,
            COUNT(*)                                                              AS tx_count,
            ROUND(SUM(c.cash_amount + c.transfer_amount), 2)                     AS revenue
        FROM categorized c
        GROUP BY c.duration_category
    ),
    grand_total AS (
        SELECT COALESCE(SUM(a.tx_count), 0) AS total FROM aggregated a
    )
    SELECT
        a.duration_category,
        a.sort_key                                                                AS duration_sort_key,
        a.tx_count                                                                AS transaction_count,
        ROUND(a.tx_count::NUMERIC / NULLIF(g.total, 0) * 100, 2)                 AS percentage,
        a.revenue                                                                 AS total_revenue
    FROM aggregated a, grand_total g
    ORDER BY a.sort_key, a.duration_category;
END;
$$;


-- =============================================================
-- 10) get_daily_revenue_trend
--     Tren pendapatan harian (paginated)
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_daily_revenue_trend(
    p_start_date DATE,
    p_end_date   DATE,
    p_location   TEXT DEFAULT NULL,
    p_limit      INT  DEFAULT 31,
    p_offset     INT  DEFAULT 0
)
RETURNS TABLE (
    transaction_date            DATE,
    total_revenue               NUMERIC,
    transaction_count           BIGINT,
    avg_revenue_per_transaction NUMERIC,
    total_count                 BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
    END IF;

    RETURN QUERY
    WITH aggregated AS (
        SELECT
            DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta')   AS transaction_date,
            ROUND(SUM(t.cash_amount + t.transfer_amount), 2) AS total_revenue,
            COUNT(*)                                         AS transaction_count
        FROM public.transactions t
        WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
          AND (p_location IS NULL OR t.apartment_location = p_location)
        GROUP BY DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta')
    ),
    counted AS (
        SELECT COUNT(*) AS cnt FROM aggregated
    )
    SELECT
        a.transaction_date,
        a.total_revenue,
        a.transaction_count,
        ROUND(a.total_revenue / NULLIF(a.transaction_count, 0), 2)               AS avg_revenue_per_transaction,
        c.cnt                                                                    AS total_count
    FROM aggregated a, counted c
    ORDER BY a.transaction_date DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;


-- =============================================================
-- 11) get_monthly_revenue_trend
--     Agregat bulanan (DATE_TRUNC)
--     Sumber: 20260608_v4
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
AS $$
BEGIN
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
    END IF;

    RETURN QUERY
    WITH aggregated AS (
        SELECT
            DATE_TRUNC('month', t.checkin_at AT TIME ZONE 'Asia/Jakarta')::DATE  AS month_start,
            ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                     AS total_revenue,
            COUNT(*)                                                              AS transaction_count
        FROM public.transactions t
        WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
          AND (p_location IS NULL OR t.apartment_location = p_location)
        GROUP BY DATE_TRUNC('month', t.checkin_at AT TIME ZONE 'Asia/Jakarta')
    )
    SELECT
        a.month_start,
        TO_CHAR(a.month_start, 'Mon YYYY')::TEXT                                 AS month_label,
        a.total_revenue,
        a.transaction_count,
        ROUND(a.total_revenue / NULLIF(a.transaction_count, 0), 2)               AS avg_revenue_per_transaction
    FROM aggregated a
    ORDER BY a.month_start ASC;
END;
$$;


-- =============================================================
-- 12) get_revenue_yoy_comparison
--     YoY: periode saat ini vs periode sama 1 tahun lalu
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_revenue_yoy_comparison(
    p_start_date DATE,
    p_end_date   DATE,
    p_location   TEXT DEFAULT NULL
)
RETURNS TABLE (
    current_revenue         NUMERIC,
    current_transactions    BIGINT,
    previous_revenue        NUMERIC,
    previous_transactions   BIGINT,
    revenue_change_pct      NUMERIC,
    transactions_change_pct NUMERIC,
    current_period_label    TEXT,
    previous_period_label   TEXT
)
LANGUAGE plpgsql
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
            ROUND(SUM(t.cash_amount + t.transfer_amount), 2) AS revenue,
            COUNT(*)                                         AS tx_count
        FROM public.transactions t
        WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
          AND (p_location IS NULL OR t.apartment_location = p_location)
    ),
    prev AS (
        SELECT
            ROUND(SUM(t.cash_amount + t.transfer_amount), 2) AS revenue,
            COUNT(*)                                         AS tx_count
        FROM public.transactions t
        WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN v_prev_start AND v_prev_end
          AND (p_location IS NULL OR t.apartment_location = p_location)
    )
    SELECT
        COALESCE(c.revenue, 0)                                                   AS current_revenue,
        COALESCE(c.tx_count, 0)                                                  AS current_transactions,
        COALESCE(p.revenue, 0)                                                   AS previous_revenue,
        COALESCE(p.tx_count, 0)                                                  AS previous_transactions,
        ROUND((COALESCE(c.revenue, 0) - COALESCE(p.revenue, 0))::NUMERIC
            / NULLIF(p.revenue, 0) * 100, 2)                                     AS revenue_change_pct,
        ROUND((COALESCE(c.tx_count, 0) - COALESCE(p.tx_count, 0))::NUMERIC
            / NULLIF(p.tx_count, 0) * 100, 2)                                    AS transactions_change_pct,
        (TO_CHAR(p_start_date, 'DD Mon YYYY') || ' – ' || TO_CHAR(p_end_date, 'DD Mon YYYY'))::TEXT
                                                                                 AS current_period_label,
        (TO_CHAR(v_prev_start, 'DD Mon YYYY') || ' – ' || TO_CHAR(v_prev_end, 'DD Mon YYYY'))::TEXT
                                                                                 AS previous_period_label
    FROM cur c, prev p;
END;
$$;


-- =============================================================
-- 13) get_outstanding_bills_summary
--     Tagihan unpaid dipecah per aging bucket
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_outstanding_bills_summary(
    p_location TEXT DEFAULT NULL
)
RETURNS TABLE (
    aging_bucket TEXT,
    bucket_order INT,
    bill_count   BIGINT,
    total_amount NUMERIC
)
LANGUAGE plpgsql
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
                WHEN days_overdue < 0              THEN 'Belum Jatuh Tempo'
                WHEN days_overdue BETWEEN 0 AND 30 THEN '0–30 hari'
                WHEN days_overdue BETWEEN 31 AND 60 THEN '31–60 hari'
                WHEN days_overdue BETWEEN 61 AND 90 THEN '61–90 hari'
                ELSE                                    '>90 hari'
            END AS aging_bucket,
            CASE
                WHEN days_overdue < 0              THEN 1
                WHEN days_overdue BETWEEN 0 AND 30 THEN 2
                WHEN days_overdue BETWEEN 31 AND 60 THEN 3
                WHEN days_overdue BETWEEN 61 AND 90 THEN 4
                ELSE                                    5
            END AS bucket_order,
            amount
        FROM bills
    ),
    aggregated AS (
        SELECT
            b.aging_bucket,
            MIN(b.bucket_order)       AS bucket_order,
            COUNT(*)                  AS bill_count,
            ROUND(SUM(b.amount), 2)   AS total_amount
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


-- =============================================================
-- 14) get_dashboard_kpis
--     KPI ringkas + delta vs periode sebelumnya
--     Sumber: 20260608_v4
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(
    p_start_date DATE,
    p_end_date   DATE,
    p_location   TEXT DEFAULT NULL
)
RETURNS TABLE (
    total_revenue            NUMERIC,
    total_expense            NUMERIC,
    net_profit               NUMERIC,
    total_transactions       BIGINT,
    unique_customers         BIGINT,
    avg_occupancy_rate       NUMERIC,
    prev_total_revenue       NUMERIC,
    prev_total_expense       NUMERIC,
    prev_net_profit          NUMERIC,
    prev_total_transactions  BIGINT,
    prev_unique_customers    BIGINT,
    revenue_change_pct       NUMERIC,
    expense_change_pct       NUMERIC,
    profit_change_pct        NUMERIC,
    transactions_change_pct  NUMERIC,
    customers_change_pct     NUMERIC,
    current_period_label     TEXT,
    previous_period_label    TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_period_days int  := (p_end_date - p_start_date + 1);
    v_prev_start  DATE := (p_start_date - (v_period_days || ' days')::INTERVAL)::DATE;
    v_prev_end    DATE := (p_start_date - INTERVAL '1 day')::DATE;
BEGIN
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
    END IF;

    RETURN QUERY
    WITH cur_tx AS (
        SELECT
            ROUND(SUM(t.cash_amount + t.transfer_amount), 2) AS revenue,
            COUNT(*)                                         AS tx_count,
            COUNT(DISTINCT LOWER(TRIM(t.customer_name))) FILTER (
                WHERE t.customer_name IS NOT NULL AND TRIM(t.customer_name) <> ''
            )                                                AS uniq_cust
        FROM public.transactions t
        WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
          AND (p_location IS NULL OR t.apartment_location = p_location)
    ),
    prev_tx AS (
        SELECT
            ROUND(SUM(t.cash_amount + t.transfer_amount), 2) AS revenue,
            COUNT(*)                                         AS tx_count,
            COUNT(DISTINCT LOWER(TRIM(t.customer_name))) FILTER (
                WHERE t.customer_name IS NOT NULL AND TRIM(t.customer_name) <> ''
            )                                                AS uniq_cust
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
        COALESCE(ct.revenue, 0)                                                  AS total_revenue,
        COALESCE(ce.expense, 0)                                                  AS total_expense,
        ROUND(COALESCE(ct.revenue, 0) - COALESCE(ce.expense, 0), 2)             AS net_profit,
        COALESCE(ct.tx_count, 0)                                                 AS total_transactions,
        COALESCE(ct.uniq_cust, 0)                                                AS unique_customers,
        COALESCE(o.avg_occ, 0)                                                   AS avg_occupancy_rate,
        COALESCE(pt.revenue, 0)                                                  AS prev_total_revenue,
        COALESCE(pe.expense, 0)                                                  AS prev_total_expense,
        ROUND(COALESCE(pt.revenue, 0) - COALESCE(pe.expense, 0), 2)             AS prev_net_profit,
        COALESCE(pt.tx_count, 0)                                                 AS prev_total_transactions,
        COALESCE(pt.uniq_cust, 0)                                                AS prev_unique_customers,
        ROUND((COALESCE(ct.revenue, 0) - COALESCE(pt.revenue, 0))::NUMERIC
            / NULLIF(pt.revenue, 0) * 100, 2)                                    AS revenue_change_pct,
        ROUND((COALESCE(ce.expense, 0) - COALESCE(pe.expense, 0))::NUMERIC
            / NULLIF(pe.expense, 0) * 100, 2)                                    AS expense_change_pct,
        ROUND(
            (ROUND(COALESCE(ct.revenue, 0) - COALESCE(ce.expense, 0), 2)
             - ROUND(COALESCE(pt.revenue, 0) - COALESCE(pe.expense, 0), 2))::NUMERIC
            / NULLIF(ABS(ROUND(COALESCE(pt.revenue, 0) - COALESCE(pe.expense, 0), 2)), 0) * 100,
            2
        )                                                                        AS profit_change_pct,
        ROUND((COALESCE(ct.tx_count, 0) - COALESCE(pt.tx_count, 0))::NUMERIC
            / NULLIF(pt.tx_count, 0) * 100, 2)                                   AS transactions_change_pct,
        ROUND((COALESCE(ct.uniq_cust, 0) - COALESCE(pt.uniq_cust, 0))::NUMERIC
            / NULLIF(pt.uniq_cust, 0) * 100, 2)                                  AS customers_change_pct,
        (TO_CHAR(p_start_date, 'DD Mon YYYY') || ' – ' || TO_CHAR(p_end_date, 'DD Mon YYYY'))::TEXT
                                                                                 AS current_period_label,
        (TO_CHAR(v_prev_start, 'DD Mon YYYY') || ' – ' || TO_CHAR(v_prev_end, 'DD Mon YYYY'))::TEXT
                                                                                 AS previous_period_label
    FROM cur_tx ct, prev_tx pt, cur_exp ce, prev_exp pe, occ o;
END;
$$;


-- =============================================================
-- 15) get_net_profit_per_location
--     Revenue − pengeluaran per lokasi
--     Sumber: 20260607_v3
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
AS $$
BEGIN
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
    END IF;

    RETURN QUERY
    WITH revenue AS (
        SELECT
            t.apartment_location::TEXT                                            AS loc_name,
            ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                     AS rev
        FROM public.transactions t
        WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
          AND (p_location IS NULL OR t.apartment_location = p_location)
        GROUP BY t.apartment_location
    ),
    expense AS (
        SELECT
            p.apartment_location::TEXT                                            AS loc_name,
            ROUND(SUM(p.jumlah), 2)                                              AS exp
        FROM public.pengeluaran p
        WHERE p.tanggal BETWEEN p_start_date AND p_end_date
          AND (p_location IS NULL OR p.apartment_location = p_location)
        GROUP BY p.apartment_location
    ),
    combined AS (
        SELECT
            COALESCE(r.loc_name, e.loc_name)                                     AS apartment_location,
            COALESCE(r.rev, 0)                                                   AS total_revenue,
            COALESCE(e.exp, 0)                                                   AS total_expense
        FROM revenue r
        FULL OUTER JOIN expense e ON e.loc_name = r.loc_name
    ),
    counted AS (
        SELECT COUNT(*) AS cnt FROM combined
    )
    SELECT
        c.apartment_location,
        c.total_revenue,
        c.total_expense,
        ROUND(c.total_revenue - c.total_expense, 2)                              AS net_profit,
        ROUND((c.total_revenue - c.total_expense) / NULLIF(c.total_revenue, 0) * 100, 2)
                                                                                 AS profit_margin,
        ct.cnt                                                                   AS total_count
    FROM combined c, counted ct
    ORDER BY (c.total_revenue - c.total_expense) DESC, c.apartment_location;
END;
$$;


-- =============================================================
-- 16) get_expense_breakdown_summary
--     Pengeluaran per kategori
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_expense_breakdown_summary(
    p_start_date DATE,
    p_end_date   DATE,
    p_location   TEXT DEFAULT NULL
)
RETURNS TABLE (
    category          TEXT,
    total_expense     NUMERIC,
    transaction_count BIGINT,
    percentage        NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
    END IF;

    RETURN QUERY
    WITH aggregated AS (
        SELECT
            COALESCE(NULLIF(TRIM(p.category), ''), 'Lainnya')::TEXT              AS category,
            ROUND(SUM(p.jumlah), 2)                                              AS total_expense,
            COUNT(*)                                                              AS tx_count
        FROM public.pengeluaran p
        WHERE p.tanggal BETWEEN p_start_date AND p_end_date
          AND (p_location IS NULL OR p.apartment_location = p_location)
        GROUP BY COALESCE(NULLIF(TRIM(p.category), ''), 'Lainnya')
    ),
    grand_total AS (
        SELECT COALESCE(SUM(a.total_expense), 0) AS total FROM aggregated a
    )
    SELECT
        a.category,
        a.total_expense,
        a.tx_count                                                               AS transaction_count,
        ROUND(a.total_expense / NULLIF(g.total, 0) * 100, 2)                    AS percentage
    FROM aggregated a, grand_total g
    ORDER BY a.total_expense DESC;
END;
$$;


-- =============================================================
-- 17) get_payment_method_summary
--     Cash vs transfer per lokasi
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_payment_method_summary(
    p_start_date DATE,
    p_end_date   DATE,
    p_location   TEXT DEFAULT NULL
)
RETURNS TABLE (
    apartment_location  TEXT,
    total_cash          NUMERIC,
    total_transfer      NUMERIC,
    total_revenue       NUMERIC,
    cash_percentage     NUMERIC,
    transfer_percentage NUMERIC,
    total_count         BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
    END IF;

    RETURN QUERY
    WITH aggregated AS (
        SELECT
            t.apartment_location::TEXT                                            AS apartment_location,
            ROUND(SUM(t.cash_amount), 2)                                         AS total_cash,
            ROUND(SUM(t.transfer_amount), 2)                                     AS total_transfer,
            ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                     AS total_revenue
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
        ROUND(a.total_cash     / NULLIF(a.total_revenue, 0) * 100, 2)            AS cash_percentage,
        ROUND(a.total_transfer / NULLIF(a.total_revenue, 0) * 100, 2)            AS transfer_percentage,
        c.cnt                                                                    AS total_count
    FROM aggregated a, counted c
    ORDER BY a.total_revenue DESC, a.apartment_location;
END;
$$;


-- =============================================================
-- 18) get_performance_by_shift
--     Performa per shift (Pagi/Malam/Long)
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
AS $$
BEGIN
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
    END IF;

    RETURN QUERY
    WITH aggregated AS (
        SELECT
            COALESCE(NULLIF(TRIM(t.shift), ''), 'Tidak Diisi')::TEXT             AS shift,
            COUNT(*)                                                              AS tx_count,
            ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                     AS revenue
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
        a.tx_count                                                               AS total_transactions,
        a.revenue                                                                AS total_revenue,
        ROUND(a.revenue / NULLIF(a.tx_count, 0), 2)                              AS avg_revenue_per_transaction,
        ROUND(a.tx_count::NUMERIC / NULLIF(g.total, 0) * 100, 2)                 AS percentage
    FROM aggregated a, grand_total g
    ORDER BY a.tx_count DESC, a.shift;
END;
$$;


-- =============================================================
-- 19) get_performance_by_employee
--     Performa per karyawan (input_by), paginated
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
AS $$
BEGIN
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
    END IF;

    RETURN QUERY
    WITH aggregated AS (
        SELECT
            COALESCE(NULLIF(TRIM(t.input_by), ''), 'Tidak Diketahui')::TEXT      AS employee_name,
            COUNT(*)                                                              AS tx_count,
            ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                     AS revenue
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
        a.tx_count                                                               AS total_transactions,
        a.revenue                                                                AS total_revenue,
        ROUND(a.revenue / NULLIF(a.tx_count, 0), 2)                              AS avg_revenue_per_transaction,
        c.cnt                                                                    AS total_count
    FROM aggregated a, counted c
    ORDER BY a.tx_count DESC, a.employee_name
    LIMIT p_limit OFFSET p_offset;
END;
$$;


-- =============================================================
-- 20) get_marketing_performance
--     Performa per marketing (revenue brought, fee, ratio), paginated
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_marketing_performance(
    p_start_date DATE,
    p_end_date   DATE,
    p_location   TEXT DEFAULT NULL,
    p_limit      INT  DEFAULT 10,
    p_offset     INT  DEFAULT 0
)
RETURNS TABLE (
    marketing_name      TEXT,
    total_transactions  BIGINT,
    revenue_brought     NUMERIC,
    total_fee           NUMERIC,
    fee_to_revenue_ratio NUMERIC,
    total_count         BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
    END IF;

    RETURN QUERY
    WITH aggregated AS (
        SELECT
            COALESCE(NULLIF(TRIM(t.marketing_name), ''), 'Langsung')::TEXT       AS marketing_name,
            COUNT(*)                                                              AS tx_count,
            ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                     AS revenue_brought,
            ROUND(SUM(COALESCE(t.marketing_fee, 0)), 2)                          AS total_fee
        FROM public.transactions t
        WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
          AND (p_location IS NULL OR t.apartment_location = p_location)
        GROUP BY COALESCE(NULLIF(TRIM(t.marketing_name), ''), 'Langsung')
    ),
    counted AS (
        SELECT COUNT(*) AS cnt FROM aggregated
    )
    SELECT
        a.marketing_name,
        a.tx_count                                                               AS total_transactions,
        a.revenue_brought,
        a.total_fee,
        ROUND(a.total_fee / NULLIF(a.revenue_brought, 0) * 100, 2)               AS fee_to_revenue_ratio,
        c.cnt                                                                    AS total_count
    FROM aggregated a, counted c
    ORDER BY a.revenue_brought DESC, a.marketing_name
    LIMIT p_limit OFFSET p_offset;
END;
$$;


-- =============================================================
-- 21) get_underperforming_rooms
--     Kamar dari nomor_kamar dengan occupancy < threshold (default 30%)
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_underperforming_rooms(
    p_start_date    DATE,
    p_end_date      DATE,
    p_location      TEXT    DEFAULT NULL,
    p_threshold_pct NUMERIC DEFAULT 30,
    p_limit         INT     DEFAULT 10,
    p_offset        INT     DEFAULT 0
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
AS $$
BEGIN
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
    END IF;

    RETURN QUERY
    WITH period_days AS (
        SELECT (p_end_date - p_start_date + 1) AS total_days
    ),
    rooms AS (
        SELECT
            nk.name::TEXT   AS room_number,
            nk.lokasi::TEXT AS apartment_location
        FROM public.nomor_kamar nk
        WHERE (p_location IS NULL OR nk.lokasi = p_location)
    ),
    stats AS (
        SELECT
            t.room_number::TEXT                                                  AS room_number,
            t.apartment_location::TEXT                                           AS apartment_location,
            COUNT(*)                                                             AS total_transactions,
            ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                    AS total_revenue,
            COUNT(DISTINCT DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta'))       AS days_used
        FROM public.transactions t
        WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
          AND (p_location IS NULL OR t.apartment_location = p_location)
        GROUP BY t.room_number, t.apartment_location
    ),
    joined AS (
        SELECT
            r.room_number,
            r.apartment_location,
            COALESCE(s.total_transactions, 0)                                    AS total_transactions,
            COALESCE(s.total_revenue, 0)                                         AS total_revenue,
            ROUND(COALESCE(s.days_used, 0)::NUMERIC / NULLIF(pd.total_days, 0) * 100, 2)
                                                                                 AS occupancy_rate
        FROM rooms r
        LEFT JOIN stats s
            ON s.room_number = r.room_number
           AND s.apartment_location = r.apartment_location
        CROSS JOIN period_days pd
    ),
    filtered AS (
        SELECT * FROM joined j WHERE j.occupancy_rate < p_threshold_pct
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
        c.cnt AS total_count
    FROM filtered f, counted c
    ORDER BY f.occupancy_rate ASC, f.apartment_location, f.room_number
    LIMIT p_limit OFFSET p_offset;
END;
$$;
