import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';

/**
 * Hook for fetching deposit data with server-side pagination.
 * Wraps usePaginatedQuery for the 'transactions' table with deposit-specific config.
 *
 * @param {Record<string, { op: string, value: any, column?: string }>} supabaseFilters
 *        Filter object produced by useDepositFilters.getSupabaseFilters()
 * @returns {object} Deposits, pagination state, and actions
 */
export function useDepositData(supabaseFilters) {
  const {
    data: deposits,
    totalItems,
    totalPages,
    currentPage,
    setPage,
    isLoading,
    error,
    refresh,
  } = usePaginatedQuery({
    table: 'transactions',
    select:
      '*, guest_name, apartment_location, room_number, deposit_amount, deposit_type, deposit_returned, deposit_returned_at, deposit_returned_by, created_at',
    pageSize: 10,
    orderBy: 'created_at',
    ascending: false,
    filters: supabaseFilters,
  });

  return {
    deposits,
    totalItems,
    totalPages,
    currentPage,
    isLoading,
    error,
    setPage,
    refresh,
  };
}
