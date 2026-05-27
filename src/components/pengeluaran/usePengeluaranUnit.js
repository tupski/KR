import { useState, useMemo, useCallback } from 'react';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useCategorySummary } from '@/hooks/useCategorySummary';
import { DEFAULT_UNIT_FILTERS } from './pengeluaranTypes';

/**
 * Custom hook for per-unit expense (pengeluaran_unit) data management.
 *
 * Provides paginated expense list, category summary, and filter state.
 *
 * @param {{ onDataUpdate?: () => void }} [options]
 * @returns {object} Per-unit expense data and handlers
 */
export function usePengeluaranUnit({ onDataUpdate } = {}) {
  const [filters, setFiltersState] = useState(DEFAULT_UNIT_FILTERS);
  const [categoryDialog, setCategoryDialog] = useState({
    open: false,
    selected: null,
    totalAmount: 0,
  });

  // Memoized filters for usePaginatedQuery
  const unitFilters = useMemo(() => {
    const result = {};
    if (filters.lokasi) result.apartment_location = { op: 'eq', value: filters.lokasi, column: 'apartment_location' };
    if (filters.kamar) result.room_number = { op: 'eq', value: filters.kamar, column: 'room_number' };
    if (filters.startDate) result.tanggal_start = { op: 'gte', value: filters.startDate, column: 'tanggal' };
    if (filters.endDate) result.tanggal_end = { op: 'lte', value: filters.endDate, column: 'tanggal' };
    return result;
  }, [filters.lokasi, filters.kamar, filters.startDate, filters.endDate]);

  // Paginated expense list
  const {
    data: expenses,
    totalItems,
    totalPages,
    currentPage,
    isLoading,
    error,
    setPage,
    refresh,
  } = usePaginatedQuery({
    table: 'pengeluaran_unit',
    select: '*',
    pageSize: 10,
    orderBy: 'tanggal',
    ascending: false,
    filters: unitFilters,
  });

  // Category summary via RPC
  const {
    data: categorySummary,
    isLoading: summaryLoading,
    refresh: refreshSummary,
  } = useCategorySummary({
    lokasi: filters.lokasi,
    kamar: filters.kamar,
    startDate: filters.startDate,
    endDate: filters.endDate,
  });

  /**
   * Open the category detail dialog.
   *
   * @param {object} catSummary - Category summary item
   */
  const handleCategoryClick = useCallback((catSummary) => {
    setCategoryDialog({
      open: true,
      selected: catSummary.category,
      totalAmount: catSummary.total,
    });
  }, []);

  /**
   * Set a single filter value.
   *
   * @param {string} key - Filter key
   * @param {*} value - Filter value
   */
  const setFilter = useCallback((key, value) => {
    setFiltersState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFiltersState(DEFAULT_UNIT_FILTERS);
  }, []);

  return {
    // Data
    expenses,
    categorySummary,
    // Pagination
    totalItems,
    totalPages,
    currentPage,
    isLoading,
    error,
    setPage,
    refresh,
    refreshSummary,
    // Filters
    filters,
    setFilter,
    clearFilters,
    // Dialogs
    categoryDialog,
    setCategoryDialog,
    // Handlers
    handleCategoryClick,
  };
}
