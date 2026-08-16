import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/api/client';

/**
 * Custom hook for server-side pagination using the REST API.
 *
 * @param {object} options
 * @param {string} options.table      - REST endpoint path (e.g. '/api/transactions').
 *                                      Also accepted as `endpoint` (alias).
 * @param {string} [options.endpoint] - Alias for `table` — preferred name for new callers.
 * @param {string} [options.select]   - Ignored (kept for backward-compat with old Supabase callers).
 * @param {number} [options.pageSize=10]
 * @param {string} options.orderBy
 * @param {boolean} [options.ascending=false]
 * @param {Record<string, { op: 'eq'|'gte'|'lte'|'is'|'not_is_null', value: any, column?: string }>} [options.filters]
 * @param {boolean} [options.enabled=true]
 * @returns {object} Paginated query result
 */
export function usePaginatedQuery({
  table,
  endpoint,
  select,            // kept for compat — not sent to REST API
  pageSize: initialPageSize = 10,
  orderBy,
  ascending = false,
  filters: externalFilters,
  enabled = true,
}) {
  // `endpoint` takes precedence; fall back to `table` for backward compat
  const resolvedEndpoint = endpoint || table;

  const [data, setData] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [internalFilters, setInternalFilters] = useState(externalFilters || {});

  const isMountedRef = useRef(true);

  // Use external filters when provided; fall back to internal
  const activeFilters = externalFilters !== undefined ? externalFilters : internalFilters;

  // Stable JSON string to avoid infinite re-fetch on object identity changes
  const activeFiltersJson = JSON.stringify(activeFilters || {});
  const activeFiltersJsonRef = useRef(activeFiltersJson);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Reset to page 1 when filter content changes
  useEffect(() => {
    if (activeFiltersJsonRef.current !== activeFiltersJson) {
      activeFiltersJsonRef.current = activeFiltersJson;
      setCurrentPage(1);
    }
  }, [activeFiltersJson]);

  /**
   * Convert the filters object into flat query params understood by the REST API.
   * e.g. { status: { op: 'eq', value: 'active' } } → { status: 'active' }
   * Operators gte/lte map to status_gte / status_lte conventions.
   */
  function filtersToParams(filtersSnapshot) {
    const params = {};
    if (!filtersSnapshot || typeof filtersSnapshot !== 'object') return params;

    Object.entries(filtersSnapshot).forEach(([key, condition]) => {
      if (!condition || typeof condition !== 'object' || !('op' in condition)) return;
      const { op, value, column: col } = condition;
      const column = col || key;

      if (value === undefined) return;
      if (value === null && op !== 'is' && op !== 'not_is_null') return;

      switch (op) {
        case 'eq':
          params[column] = value;
          break;
        case 'gte':
          params[`${column}_gte`] = value;
          break;
        case 'lte':
          params[`${column}_lte`] = value;
          break;
        case 'is':
          params[column] = value === null ? 'null' : value;
          break;
        case 'not_is_null':
          params[`${column}_not_null`] = 'true';
          break;
        default:
          break;
      }
    });

    return params;
  }

  const fetchPage = useCallback(async () => {
    if (!enabled || !resolvedEndpoint || !orderBy) return;

    setIsLoading(true);
    setError(null);

    const filtersSnapshot = JSON.parse(activeFiltersJsonRef.current || '{}');

    try {
      const params = {
        page: currentPage,
        limit: pageSize,
        orderBy,
        ascending,
        ...filtersToParams(filtersSnapshot),
      };

      const result = await api.get(resolvedEndpoint, params);

      if (!isMountedRef.current) return;

      // Server must return { data: [...], total: number }
      const fetchedData = result?.data ?? result ?? [];
      const total = result?.total ?? result?.count ?? fetchedData.length;

      setData(fetchedData);
      setTotalItems(total);

      // Empty page fallback
      if (fetchedData.length === 0 && currentPage > 1) {
        setCurrentPage((prev) => prev - 1);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setError('Gagal memuat data. Silakan coba lagi.');
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedEndpoint, pageSize, orderBy, ascending, activeFiltersJson, currentPage, enabled]);

  // Trigger fetch on dependency changes
  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const setPageSize = useCallback((size) => {
    setPageSizeState(size);
    setCurrentPage(1);
  }, []);

  const setPage = useCallback(
    (page) => {
      const clamped = Math.max(1, Math.min(page, totalPages));
      setCurrentPage(clamped);
    },
    [totalPages]
  );

  const refresh = useCallback(() => {
    fetchPage();
  }, [fetchPage]);

  const setFilters = useCallback((newFilters) => {
    setInternalFilters(newFilters || {});
  }, []);

  return {
    data,
    totalItems,
    totalPages,
    currentPage,
    pageSize,
    isLoading,
    error,
    setPage,
    setPageSize,
    refresh,
    setFilters,
  };
}

export default usePaginatedQuery;
