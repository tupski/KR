import { useState, useCallback } from 'react';
import { getLocalDate, subDays } from '@/lib/dateUtils';

/**
 * Hook for managing deposit filter state and constructing Supabase filter objects.
 *
 * @returns {object} Filters, active tab, and action functions
 */
export function useDepositFilters() {
  const [filters, setFilters] = useState({
    searchName: '',
    depositType: 'semua',         // 'semua' | 'deposit_kamar' | 'deposit_booking'
    selectedLocations: [],        // multi-select values
    selectedRooms: [],            // multi-select values
    quickDateFilter: null,        // 'today' | 'yesterday' | '7days' | '30days' | null
    dateFrom: null,
    dateTo: null,
  });
  const [activeTab, setActiveTab] = useState('belum'); // 'belum' | 'sudah'

  /**
   * Set a single filter field.
   * @param {string} field - Filter field name
   * @param {*}      value - New value
   */
  const setFilter = useCallback((field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }, []);

  /**
   * Apply a quick date preset and populate dateFrom/dateTo accordingly.
   * @param {'today'|'yesterday'|'7days'|'30days'|null} preset
   */
  const handleQuickDateFilter = useCallback((preset) => {
    const today = new Date();

    let dateFrom = null;
    let dateTo = null;

    switch (preset) {
      case 'today':
        dateFrom = getLocalDate();
        dateTo = getLocalDate();
        break;
      case 'yesterday': {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        dateFrom = yesterday.toISOString().slice(0, 10);
        dateTo = dateFrom;
        break;
      }
      case '7days': {
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        dateFrom = sevenDaysAgo.toISOString().slice(0, 10);
        dateTo = getLocalDate();
        break;
      }
      case '30days': {
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        dateFrom = thirtyDaysAgo.toISOString().slice(0, 10);
        dateTo = getLocalDate();
        break;
      }
      default:
        break;
    }

    setFilters((prev) => ({
      ...prev,
      quickDateFilter: preset,
      dateFrom,
      dateTo,
    }));
  }, []);

  /**
   * Reset all filters to defaults.
   */
  const clearFilters = useCallback(() => {
    setFilters({
      searchName: '',
      depositType: 'semua',
      selectedLocations: [],
      selectedRooms: [],
      quickDateFilter: null,
      dateFrom: null,
      dateTo: null,
    });
  }, []);

  /**
   * Build a filter object compatible with usePaginatedQuery.
   * @returns {Record<string, { op: string, value: any, column?: string }>}
   */
  const getSupabaseFilters = useCallback(() => {
    const result = {};

    if (filters.searchName?.trim()) {
      result.guest_name = { op: 'ilike', value: `%${filters.searchName.trim()}%` };
    }

    if (filters.depositType !== 'semua') {
      result.deposit_type = { op: 'eq', value: filters.depositType };
    }

    if (filters.selectedLocations.length > 0) {
      result.apartment_location = { op: 'in', value: filters.selectedLocations };
    }

    if (filters.selectedRooms.length > 0) {
      result.room_number = { op: 'in', value: filters.selectedRooms };
    }

    if (filters.dateFrom) {
      result.created_at_from = {
        op: 'gte',
        value: filters.dateFrom,
        column: 'created_at',
      };
    }

    if (filters.dateTo) {
      result.created_at_to = {
        op: 'lte',
        value: `${filters.dateTo}T23:59:59`,
        column: 'created_at',
      };
    }

    // Tab filter: belum / sudah dikembalikan
    if (activeTab === 'belum') {
      result.deposit_returned = { op: 'is', value: null };
    } else {
      result.deposit_returned = { op: 'not_is_null' };
    }

    return result;
  }, [filters, activeTab]);

  return {
    filters,
    activeTab,
    setFilter,
    handleQuickDateFilter,
    clearFilters,
    getSupabaseFilters,
    setActiveTab,
  };
}
