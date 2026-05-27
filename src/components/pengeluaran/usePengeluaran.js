import { useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useCategorySummary } from '@/hooks/useCategorySummary';
import { DEFAULT_EXPENSE_FILTERS } from './pengeluaranTypes';

/**
 * Custom hook for general expense (pengeluaran) data management.
 *
 * Provides paginated expense list, category summary, CRUD operations,
 * and export functionality.
 *
 * @param {{ onDataUpdate?: () => void }} [options]
 * @returns {object} Expense data and handlers
 */
export function usePengeluaran({ onDataUpdate } = {}) {
  const [filters, setFiltersState] = useState(DEFAULT_EXPENSE_FILTERS);
  const [categories, setCategories] = useState([]);
  const [categoryDialog, setCategoryDialog] = useState({
    open: false,
    selected: null,
    totalAmount: 0,
  });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  // Memoized filters for usePaginatedQuery
  const expenseFilters = useMemo(() => {
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
    refresh: refreshExpenses,
  } = usePaginatedQuery({
    table: 'pengeluaran',
    select: '*',
    pageSize: 10,
    orderBy: 'tanggal',
    ascending: false,
    filters: expenseFilters,
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
   * Fetch categories list from the pengeluaran_category table.
   */
  const fetchCategories = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('pengeluaran_category')
        .select('*')
        .order('nama');
      if (fetchError) throw fetchError;
      setCategories(data || []);
    } catch {
      // Silently fail — categories are non-critical
    }
  }, []);

  /**
   * Add a new expense record.
   *
   * @param {object} expenseData - The expense data to insert
   * @param {string} userId - The creating user's ID
   */
  const handleAddExpense = useCallback(
    async (expenseData, userId) => {
      const { error: insertError } = await supabase.from('pengeluaran').insert({
        nama_pengeluaran: expenseData.nama_pengeluaran,
        jumlah: Number(expenseData.jumlah),
        kategori: expenseData.kategori,
        tanggal: expenseData.tanggal,
        keterangan: expenseData.keterangan || null,
        apartment_location: expenseData.lokasi || null,
        room_number: expenseData.kamar || null,
        created_by: userId,
      });

      if (insertError) throw insertError;

      refreshExpenses();
      refreshSummary();
      onDataUpdate?.();
    },
    [refreshExpenses, refreshSummary, onDataUpdate]
  );

  /**
   * Delete an expense by ID.
   *
   * @param {string} id - Expense ID to delete
   */
  const handleDelete = useCallback(
    async (id) => {
      const { error: deleteError } = await supabase
        .from('pengeluaran')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      refreshExpenses();
      refreshSummary();
      onDataUpdate?.();
    },
    [refreshExpenses, refreshSummary, onDataUpdate]
  );

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

  /**
   * Export filtered expenses to XLSX.
   *
   * @param {import('xlsx')} XLSX - The xlsx library instance
   * @param {object} filterParams - Export filter parameters
   */
  const handleExport = useCallback(
    async (XLSX, filterParams) => {
      const { categories: catFilter, locations: locFilter, dateStart, dateEnd } = filterParams;

      let query = supabase.from('pengeluaran').select('*').order('tanggal', { ascending: false });

      if (locFilter?.length) {
        query = query.in('apartment_location', locFilter);
      }
      if (catFilter?.length) {
        query = query.in('kategori', catFilter);
      }
      if (dateStart) {
        query = query.gte('tanggal', dateStart);
      }
      if (dateEnd) {
        query = query.lte('tanggal', dateEnd);
      }

      const { data: exportData, error: exportError } = await query;

      if (exportError) throw exportError;

      const rows = (exportData || []).map((e) => ({
        Tanggal: e.tanggal,
        Nama: e.nama_pengeluaran,
        Kategori: e.kategori || '-',
        Jumlah: e.jumlah,
        Keterangan: e.keterangan || '-',
        Lokasi: e.apartment_location || '-',
        Kamar: e.room_number || '-',
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Pengeluaran');
      XLSX.writeFile(wb, `Pengeluaran_${Date.now()}.xlsx`);
    },
    []
  );

  const clearFilters = useCallback(() => {
    setFiltersState(DEFAULT_EXPENSE_FILTERS);
  }, []);

  return {
    // Data
    expenses,
    categorySummary,
    categories,
    // Pagination
    totalItems,
    totalPages,
    currentPage,
    isLoading,
    error,
    setPage,
    refreshExpenses,
    refreshSummary,
    // Filters
    filters,
    setFilter,
    clearFilters,
    showFilters,
    setShowFilters,
    // Dialogs
    categoryDialog,
    setCategoryDialog,
    deleteTarget,
    setDeleteTarget,
    // Handlers
    handleAddExpense,
    handleDelete,
    handleCategoryClick,
    handleExport,
    fetchCategories,
  };
}
