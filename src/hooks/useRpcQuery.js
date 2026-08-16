import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

// ---------------------------------------------------------------------------
// In-memory cache (stale-while-revalidate semantics)
// ---------------------------------------------------------------------------
//
// Key: deterministic JSON dari (rpcName, params, currentPage, pageSize, paginated)
// Value: { data, totalCount, fetchedAt (ms) }
//
// Default TTL: 60_000 ms. Cache hit: tampilkan instan, lalu refetch latar
// (revalidate) bila usia > staleTimeMs (default 30_000 ms).
//
const _cache = new Map();
const DEFAULT_STALE_MS = 5 * 60_000;   // 5 menit (revalidate latar)
const DEFAULT_TTL_MS = 15 * 60_000;    // 15 menit (cache valid)

function makeCacheKey(rpcName, rpcParams) {
  return `${rpcName}::${JSON.stringify(rpcParams)}`;
}

/**
 * Generic hook untuk semua pemanggilan RPC analytics dengan dukungan
 * pagination server-side, in-memory cache (stale-while-revalidate), dan
 * `lastUpdated` timestamp untuk indikator freshness.
 *
 * @param {object} options
 * @param {string} options.rpcName
 * @param {object} options.params
 * @param {number} [options.pageSize=10]
 * @param {boolean} [options.paginated=true]
 * @param {boolean} [options.enabled=true]
 * @param {number} [options.staleTimeMs=30000] - Setelah usia cache ini, refetch latar
 * @param {number} [options.ttlMs=300000]      - Setelah usia ini, anggap miss
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

  // Stable JSON of params for useEffect dependency
  const paramsJson = JSON.stringify(params);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Reset to page 1 when params change
  const prevParamsJsonRef = useRef(paramsJson);
  useEffect(() => {
    if (prevParamsJsonRef.current !== paramsJson) {
      prevParamsJsonRef.current = paramsJson;
      setCurrentPage(1);
    }
  }, [paramsJson]);

  useEffect(() => {
    if (!enabled || !rpcName) return;

    const paramsSnapshot = JSON.parse(paramsJson);

    const rpcParams = {
      ...paramsSnapshot,
      ...(paginated
        ? {
            p_limit: pageSize,
            p_offset: (currentPage - 1) * pageSize,
          }
        : {}),
    };

    const cacheKey = makeCacheKey(rpcName, rpcParams);
    const cached = _cache.get(cacheKey);
    const now = Date.now();

    const isCacheUsable = cached && now - cached.fetchedAt < ttlMs;
    const isCacheFresh = cached && now - cached.fetchedAt < staleTimeMs;

    // Forced refresh (refreshTick changed) overrides cache.
    const forced = refreshTick > 0 && cached?.refreshAt !== refreshTick;

    if (isCacheUsable && !forced) {
      // Cache hit — tampilkan instan
      setData(cached.data);
      setTotalCount(cached.totalCount);
      setLastUpdated(cached.fetchedAt);
      setIsLoading(false);
      setError(null);

      if (isCacheFresh) return; // tidak perlu refetch
      // Stale → refetch background
      setIsRefetching(true);
    } else {
      // Cache miss / TTL expired / forced
      setIsLoading(true);
      setError(null);
    }

    const fetchData = async () => {
      const { data: result, error: rpcError } = await supabase.rpc(rpcName, rpcParams);

      if (!isMountedRef.current) return;

      if (rpcError) {
        setError(`Gagal memuat data. ${rpcError.message}`);
        // Jangan kosongkan data lama bila ini refetch background; kalau cache miss → kosongkan.
        if (!isCacheUsable) {
          setData([]);
          setTotalCount(0);
        }
      } else {
        const rows = result || [];
        const tc = rows[0]?.total_count ?? rows.length ?? 0;
        setData(rows);
        setTotalCount(tc);
        setLastUpdated(Date.now());

        _cache.set(cacheKey, {
          data: rows,
          totalCount: tc,
          fetchedAt: Date.now(),
          refreshAt: refreshTick,
        });
      }

      setIsLoading(false);
      setIsRefetching(false);
    };

    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpcName, paramsJson, pageSize, paginated, currentPage, enabled, refreshTick, ttlMs, staleTimeMs]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const setPage = useCallback(
    (page) => {
      const clamped = Math.max(1, Math.min(page, totalPages));
      setCurrentPage(clamped);
    },
    [totalPages]
  );

  // Force refresh: invalidate cache + bump tick
  const refresh = useCallback(() => {
    setRefreshTick((tick) => tick + 1);
  }, []);

  /**
   * Fetch ALL rows (tanpa pagination) sekali dengan p_limit besar.
   * Berguna untuk export CSV. Tidak men-cache hasilnya, dan tidak mengubah
   * state hook (tidak menggangu paginated UI).
   *
   * Catatan: untuk RPC yang pagination wajib (misal `get_repeat_guests`),
   * memakai p_limit=1000, p_offset=0 — sesuai pola server-side pagination.
   * Untuk dataset super besar di masa depan (>1000 rows), bisa diloop.
   *
   * @returns {Promise<{ data: Array, error: string|null }>}
   */
  const fetchAll = useCallback(async () => {
    if (!rpcName) return { data: [], error: 'rpcName tidak diset' };

    const paramsSnapshot = JSON.parse(paramsJson);
    const rpcParams = {
      ...paramsSnapshot,
      ...(paginated ? { p_limit: 1000, p_offset: 0 } : {}),
    };
    const { data: result, error: rpcError } = await supabase.rpc(rpcName, rpcParams);
    if (rpcError) return { data: [], error: rpcError.message };
    return { data: result ?? [], error: null };
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
 * Invalidasi seluruh in-memory cache. Berguna untuk tombol "Refresh"
 * global di header dashboard.
 */
export function clearRpcCache() {
  _cache.clear();
}

export default useRpcQuery;
