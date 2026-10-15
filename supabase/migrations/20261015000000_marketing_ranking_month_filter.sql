-- Server-side monthly marketing ranking.
-- The frontend sends one selected month only, so historical data is not read until requested.
CREATE OR REPLACE FUNCTION public.get_marketing_ranking(
  p_start_date DATE,
  p_end_date   DATE,
  p_limit      INT DEFAULT 10,
  p_offset     INT DEFAULT 0
)
RETURNS TABLE (
  marketing_name     TEXT,
  total_transactions BIGINT,
  total_revenue      NUMERIC,
  total_count        BIGINT,
  total_cs           BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  IF p_end_date <= p_start_date THEN
    RAISE EXCEPTION 'p_end_date harus lebih besar dari p_start_date';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'p_limit harus berada di antara 1 dan 100';
  END IF;

  IF p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'p_offset tidak boleh negatif';
  END IF;

  RETURN QUERY
  WITH aggregated AS (
    SELECT
      TRIM(t.marketing_name)::TEXT AS marketing_name,
      COUNT(*)::BIGINT AS total_transactions,
      COALESCE(SUM(COALESCE(t.cash_amount, 0) + COALESCE(t.transfer_amount, 0)), 0)::NUMERIC AS total_revenue
    FROM public.transactions t
    WHERE NULLIF(TRIM(t.marketing_name), '') IS NOT NULL
      AND (
        (
          t.checkin_at IS NOT NULL
          AND DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') >= p_start_date
          AND DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') < p_end_date
        )
        OR (
          t.checkin_at IS NULL
          AND DATE(t.created_at AT TIME ZONE 'Asia/Jakarta') >= p_start_date
          AND DATE(t.created_at AT TIME ZONE 'Asia/Jakarta') < p_end_date
        )
      )
    GROUP BY TRIM(t.marketing_name)
  ),
  counted AS (
    SELECT
      COUNT(*)::BIGINT AS total_count,
      COALESCE(SUM(aggregated.total_transactions), 0)::BIGINT AS total_cs
    FROM aggregated
  )
  SELECT
    a.marketing_name,
    a.total_transactions,
    a.total_revenue,
    c.total_count,
    c.total_cs
  FROM aggregated a
  CROSS JOIN counted c
  ORDER BY a.total_transactions DESC, a.total_revenue DESC, a.marketing_name
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_marketing_ranking(DATE, DATE, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketing_ranking(DATE, DATE, INT, INT) TO authenticated;
