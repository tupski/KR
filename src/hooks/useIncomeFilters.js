import { useState, useEffect, useCallback, useMemo } from 'react';
import { getLocalDate, getDateRangeToday, getDateRangeLast7Days } from '@/lib/dateUtils';

/**
 * Hook for managing income dashboard filter state.
 * Provides debounced search and query parameter construction.
 *
 * @returns {object} Filters, debounced search, setter, and query builder
 */
export function useIncomeFilters() {
  const [filters, setFilters] = useState({
    filterType: 'harian',         // 'harian' | 'bulanan' | 'rentang'
    date: getLocalDate(),         // for 'harian'
    month: '',                    // for 'bulanan' — 'YYYY-MM'
    dateStart: null,              // for 'rentang'
    dateEnd: null,                // for 'rentang'
    location: '',
    shift: '',
    searchQuery: '',
  });
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // ─── Debounce search query (300ms) ──────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters.searchQuery]);

  /**
   * Set a single filter field.
   * @param {string} field - Filter field name
   * @param {*}      value - New value
   */
  const setFilter = useCallback((field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }, []);

  /**
   * Build query parameters from the current filter state,
   * computing dateFrom and dateTo based on filterType.
   * @returns {{ dateFrom: string|null, dateTo: string|null, location: string|null, shift: string|null, search: string|null }}
   */
  const getQueryParams = useCallback(() => {
    let dateFrom = null;
    let dateTo = null;

    switch (filters.filterType) {
      case 'harian':
        dateFrom = `${filters.date} 00:00:00`;
        dateTo = `${filters.date} 23:59:59`;
        break;

      case 'bulanan':
        if (filters.month) {
          dateFrom = `${filters.month}-01 00:00:00`;
          // End of month — compute last day
          const [year, month] = filters.month.split('-').map(Number);
          const lastDay = new Date(year, month, 0).getDate();
          dateTo = `${filters.month}-${String(lastDay).padStart(2, '0')} 23:59:59`;
        }
        break;

      case 'rentang':
        if (filters.dateStart) {
          dateFrom = `${filters.dateStart} 00:00:00`;
        }
        if (filters.dateEnd) {
          dateTo = `${filters.dateEnd} 23:59:59`;
        }
        break;

      default:
        break;
    }

    return {
      dateFrom,
      dateTo,
      location: filters.location || null,
      shift: filters.shift || null,
      search: debouncedSearch || null,
    };
  }, [filters, debouncedSearch]);

  return {
    filters,
    debouncedSearch,
    setFilter,
    getQueryParams,
  };
}
