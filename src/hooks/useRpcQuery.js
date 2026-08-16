import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/api/client';

// ---------------------------------------------------------------------------
// RPC name → REST analytics endpoint mapping
// ---------------------------------------------------------------------------
const RPC_TO_ENDPOINT = {
  get_dashboard_kpis:          '/api/analytics/kpis',
  get_occupancy_per_unit:      '/api/analytics/occupancy',
  get_location_fullness:       '/api/analytics/location-fullness',
  get_stay_duration:           '/api/analytics/stay-duration',
  get_marketing_performance:   '/api/analytics/marketing',
  get_payment_methods:         '/api/analytics/payment-methods',
  get_guest_sources:           '/api/analytics/guest-sources',
  get_repeat_guests:           '/api/analytics/repeat-guests',
  get_employee_performance:    '/api/analytics/employee-performance',
  get_shift_performance:       '/api/analytics/shift-performance',
  get_checkin_heatmap:         '/api/analytics/checkin-heatmap',
  get_daily_revenue:           '/api/analytics/daily-revenue',
  get_monthly_revenue:         '/api/analytics/monthly-revenue',
  get_net_profit:              '/api/analytics/net-profit',
  get_yoy_comparison:          '/api/analytics/yoy-comparison',
  get_underperforming_rooms:   '/api/analytics/underperforming-rooms',
  get_outstanding_bills:       '/api/analytics/outstanding-bills',
  get_category_summary:        '/api/analytics/category-summary',
  get_occupancy_by_location:   '/api/analytics/occupancy-by-location',
  get_profit_per_location:     '/api/analytics/profit-per-location',
  get_expense_breakdown:       '/api/analytics/expense-breakdown',
};

/**
 * Derive REST endpoint from rpcName.
 * Priority: explicit mapping → auto-convert (strip get_, replace _ with -)
 */
function rpcToEndpoint(rpcName) {
  if (RPC_TO_ENDPOINT[rpcName]) return RPC_TO_ENDPOINT[rpcName];
  // Fallback: get_foo_bar → /api/analytics/foo-bar
  const slug = rpcName.replace(/^get_/, '').replace(/_/g, '-');
  return `/api/analytics/${slug}`;
}

/**
 * Convert Supabase-style p_* RPC params to flat REST query params.
 * e.g. { p_lokasi: 'A', p_start_date: '2024-01-01' } → { lokasi: 'A', startDate: '2024-01-01' }
 * Also strips pagination params (p_limit, p_offset) — hook adds page/limit itself.
 */
function normalizeParams(rawParams) {
  if (!rawParams || typeof rawParams !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(rawParams)) {
    if (k === 'p_limit' || k === 'p_offset') continue; // handled by pagination
    if (v === undefined || v === null) continue;

    // Strip p_ prefix and convert snake_case → camelCase
    const clean = k.startsWith('p_') ? k.slice(2) : k;
    const camel = clean.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// In-memory cache (stale-while-revalidate)
// ---------------------------------------------------------------------------
const _cache = new Map();
const DEFAULT_STALE_MS = 5 * 60_000;   // 5 minutes
const DEFAULT_TTL_MS   = 15 * 60_000;  // 15 minutes

function makeCacheKey(rpcName, rpcParams) {
  return `${rpcName}::${JSON.stringify(rpcParams)}`;
}

/**
 * Generic hook for all analytics RPC calls, now backed by REST endpoints.
 * Interface is identical to the old Supabase-based version.
 *
 * @param {object} options
 * @param {string} options.rpcName
 * @param {object} options.params
 * @param {number} [options.pageSize=10]
 * @param {boolean} [options.paginated=true]
 * @param {boolean} [options.enabled=true]
 * @param {number} [options.staleTimeMs]
 * @param {number} [options.ttlMs]
 * @returns {{
 *   data: Array,
 *   totalCount: number,
 *   totalPages: number,
 *   currentPage: number,
 *   isLoading: boolean,
 *   isRefetching: boolean,
 *   error: string|null,
 *   lastUpdated: number|null,
 *   setPage: (page: number) => void,
 *   refresh: () => void,
 *   fetchAll: () => Promise<{ data: Array, error: string|null }>,
 * }}
 */
export function useRpcQuery({
  rpcName,
  params,
  pageSize = 10,
  paginated = true,
  enabled = true,
  staleTimeMs = DEFAULT_STALE_MS,
  ttlMs = DEFAULT_TTL_MS,
}) {
  const [data, setData] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const isMountedRef = useRef(true);

  // Stable JSON for useEffect dependency — prevents infinite loops
  const paramsJson = JSON.stringify(params);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Reset page when params change
  const prevParamsJsonRef = useRef(paramsJson);
  useEffect(() => {
    if (prevParamsJsonRef.current !== paramsJson) {
      prevParamsJsonRef.current = paramsJson;
      setCurrentPage(1);
    }
  }, [paramsJson]);

  useEffect(() => {
    if (!enabled || !rpcName) return;

    const endpoint = rpcToEndpoint(rpcName);
    const baseParams = normalizeParams(JSON.parse(paramsJson));
    const queryParams = {
      ...baseParams,
      ...(paginated ? { page: currentPage, limit: pageSize } : {}),
    };

    const cacheKey = makeCacheKey(rpcName, queryParams);
    const cached = _cache.get(cacheKey);
    const now = Date.now();

    const isCacheUsable = cached && now - cached.fetchedAt < ttlMs;
    const isCacheFresh  = cached && now - cached.fetchedAt < staleTimeMs;
    const forced = refreshTick > 0 && cached?.refreshAt !== refreshTick;

    if (isCacheUsable && !forced) {
      setData(cached.data);
      setTotalCount(cached.totalCount);
      setLastUpdated(cached.fetchedAt);
      setIsLoading(false);
      setError(null);
      if (isCacheFresh) return;
      setIsRefetching(true);
    } else {
      setIsLoading(true);
      setError(null);
    }

    const fetchData = async () => {
      try {
        const result = await api.get(endpoint, queryParams);

        if (!isMountedRef.current) return;

        // Normalise server response shapes:
        //   { data: [...], total: N }  — paginated list
        //   { data: [...] }            — unpaginated list
        //   [...]                      — bare array
        const rows = result?.data ?? (Array.isArray(result) ? result : []);
        const tc   = result?.total ?? result?.count ?? rows.length;

        setData(rows);
        setTotalCount(tc);
        setLastUpdated(Date.now());
        setError(null);

        _cache.set(cacheKey, {
          data: rows,
          totalCount: tc,
          fetchedAt: Date.now(),
          refreshAt: refreshTick,
        });
      } catch (err) {
        if (!isMountedRef.current) return;
        setError(err.message || 'Gagal memuat data. Silakan coba lagi.');
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsRefetching(false);
        }
      }
    };

    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpcName, paramsJson, pageSize, paginated, currentPage, enabled, refreshTick, ttlMs, staleTimeMs]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const setPage = useCallback(
    (page) => {
      const clamped = Math.max(1, Math.min(page, totalPages));
      setCurrentPage(clamped);
    },
    [totalPages]
  );

  // Force refresh: invalidate cache entry + bump tick
  const refresh = useCallback(() => {
    const endpoint = rpcToEndpoint(rpcName);
    const baseParams = normalizeParams(JSON.parse(paramsJson));
    const queryParams = {
      ...baseParams,
      ...(paginated ? { page: currentPage, limit: pageSize } : {}),
    };
    const cacheKey = makeCacheKey(rpcName, queryParams);
    _cache.delete(cacheKey);
    setRefreshTick((tick) => tick + 1);
  }, [rpcName, paramsJson, paginated, currentPage, pageSize]);

  /**
   * Fetch ALL rows (no pagination) — for CSV export.
   * Does not affect hook state.
   *
   * @returns {Promise<{ data: Array, error: string|null }>}
   */
  const fetchAll = useCallback(async () => {
    if (!rpcName) return { data: [], error: 'rpcName tidak diset' };

    const endpoint = rpcToEndpoint(rpcName);
    const baseParams = normalizeParams(JSON.parse(paramsJson));
    const queryParams = paginated
      ? { ...baseParams, page: 1, limit: 1000 }
      : baseParams;

    try {
      const result = await api.get(endpoint, queryParams);
      const rows = result?.data ?? (Array.isArray(result) ? result : []);
      return { data: rows, error: null };
    } catch (err) {
      return { data: [], error: err.message || 'Fetch all failed' };
    }
  }, [rpcName, paramsJson, paginated]);

  return {
    data,
    totalCount,
    totalPages,
    currentPage,
    isLoading,
    isRefetching,
    error,
    lastUpdated,
    setPage,
    refresh,
    fetchAll,
  };
}

/**
 * Invalidate the entire in-memory cache.
 * Call from a global "Refresh" button to force all analytics to refetch.
 */
export function clearRpcCache() {
  _cache.clear();
}

export default useRpcQuery;
