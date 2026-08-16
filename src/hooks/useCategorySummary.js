import { useState, useEffect, useCallback, useRef } from 'react';
import { analyticsApi } from '@/api/analytics.api';

/**
 * Hook untuk mengambil ringkasan kategori pengeluaran via REST API.
 * Interface identik dengan versi lama (Supabase RPC).
 *
 * @param {Object} options
 * @param {string} [options.lokasi]
 * @param {string} [options.kamar]
 * @param {string} [options.startDate]
 * @param {string} [options.endDate]
 * @param {boolean} [options.enabled=true]
 * @returns {{ data: Array, isLoading: boolean, error: string|null, refresh: () => void }}
 */
export function useCategorySummary(options = {}) {
  const { lokasi, kamar, startDate, endDate, enabled = true } = options;

  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const mountedRef = useRef(true);

  const fetchCategorySummary = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await analyticsApi.getCategorySummary({
        lokasi: lokasi || undefined,
        kamar: kamar || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      if (!mountedRef.current) return;

      // Server returns { data: [...] } or bare array
      const rows = result?.data ?? (Array.isArray(result) ? result : []);
      setData(rows);
    } catch {
      if (!mountedRef.current) return;
      setError('Gagal memuat ringkasan kategori. Silakan coba lagi.');
      // Retain previous data on error
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [lokasi, kamar, startDate, endDate, enabled]);

  useEffect(() => {
    fetchCategorySummary();
  }, [fetchCategorySummary]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(() => {
    fetchCategorySummary();
  }, [fetchCategorySummary]);

  return { data, isLoading, error, refresh };
}

export default useCategorySummary;
