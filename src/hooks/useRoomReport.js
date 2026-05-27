import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

const PAGE_SIZE = 10;

/**
 * Hook for fetching room report data (checked-out transactions) with
 * search, date, location filters, and server-side pagination.
 *
 * @returns {object} Transactions, pagination state, filters, and actions
 */
export function useRoomReport() {
  const [transactions, setTransactions] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    bulan: null,          // 'YYYY-MM'
    startDate: null,
    endDate: null,
    searchQuery: '',
    selectedLocation: null,
  });

  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('transactions')
        .select('*, marketing(name)', { count: 'exact' })
        .not('checkout_at', 'is', null) // only checked-out
        .order('checkout_at', { ascending: false });

      // Date filter by bulan
      if (filters.bulan) {
        query = query
          .gte('checkout_at', `${filters.bulan}-01`)
          .lte('checkout_at', `${filters.bulan}-31`);
      }

      // Custom date range
      if (filters.startDate) {
        query = query.gte('checkout_at', filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte('checkout_at', filters.endDate);
      }

      // Search by guest name or room number
      if (filters.searchQuery?.trim()) {
        const term = `%${filters.searchQuery.trim()}%`;
        query = query.or(
          `guest_name.ilike.${term},room_number.ilike.${term}`,
        );
      }

      // Location filter
      if (filters.selectedLocation) {
        query = query.eq('apartment_location', filters.selectedLocation);
      }

      // Server-side pagination
      const offset = (currentPage - 1) * PAGE_SIZE;
      query = query.range(offset, offset + PAGE_SIZE - 1);

      const { data, count, error: queryError } = await query;

      if (queryError) throw queryError;

      setTransactions(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      setError(err.message || 'Gagal memuat laporan kamar');
    } finally {
      setIsLoading(false);
    }
  }, [filters, currentPage]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  /**
   * Update a single filter field and reset to page 1.
   * @param {string} field - Filter field name
   * @param {*}      value - New value
   */
  const updateFilter = useCallback((field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setCurrentPage(1);
  }, []);

  /**
   * Set multiple filters at once and reset to page 1.
   * @param {object} updates - Partial filter object
   */
  const setMultipleFilters = useCallback((updates) => {
    setFilters((prev) => ({ ...prev, ...updates }));
    setCurrentPage(1);
  }, []);

  return {
    transactions,
    totalCount,
    currentPage,
    totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    isLoading,
    error,
    filters,
    setFilters: updateFilter,
    setMultipleFilters,
    setPage: setCurrentPage,
    refresh: fetchReport,
  };
}
