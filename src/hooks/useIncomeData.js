import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { isToday } from 'date-fns';

const PAGE_SIZE = 10;

/**
 * Hook for fetching income dashboard transaction data with filtering,
 * server-side pagination, realtime subscription, and polling fallback.
 *
 * @param {{ dateFrom: string|null, dateTo: string|null, location: string|null, shift: string|null, search: string|null }} queryParams
 * @returns {object} Transaction list, pagination, stats, and actions
 */
export function useIncomeData(queryParams) {
  const [transaksiList, setTransaksiList] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    todayCount: 0,
    cashTotal: 0,
    transferTotal: 0,
    total: 0,
  });

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('transactions')
        .select('*, marketing(name)', { count: 'exact' })
        .order('created_at', { ascending: false });

      // Date filtering with OR condition for checkin_at OR created_at
      if (queryParams.dateFrom && queryParams.dateTo) {
        query = query.or(
          `and(checkin_at.gte.${queryParams.dateFrom},checkin_at.lte.${queryParams.dateTo}),` +
          `and(created_at.gte.${queryParams.dateFrom},created_at.lte.${queryParams.dateTo})`,
        );
      }

      // Location filter
      if (queryParams.location) {
        query = query.eq('apartment_location', queryParams.location);
      }

      // Shift filter
      if (queryParams.shift) {
        query = query.eq('shift', queryParams.shift);
      }

      // Search by guest name
      if (queryParams.search) {
        query = query.ilike('guest_name', `%${queryParams.search}%`);
      }

      // Server-side pagination
      const offset = (currentPage - 1) * PAGE_SIZE;
      query = query.range(offset, offset + PAGE_SIZE - 1);

      const { data, count, error: queryError } = await query;

      if (!isMountedRef.current) return;

      if (queryError) throw queryError;

      const txns = data || [];
      setTransaksiList(txns);
      setTotalCount(count || 0);

      // Compute stats from today's transactions
      const todayTxns = txns.filter((t) => isToday(new Date(t.created_at)));
      const cashTotal = todayTxns.reduce((sum, t) => sum + (Number(t.cash_amount) || 0), 0);
      const transferTotal = todayTxns.reduce((sum, t) => sum + (Number(t.transfer_amount) || 0), 0);

      setStats({
        todayCount: todayTxns.length,
        cashTotal,
        transferTotal,
        total: cashTotal + transferTotal,
      });
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err.message || 'Gagal memuat data pemasukan');
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [queryParams.dateFrom, queryParams.dateTo, queryParams.location, queryParams.shift, queryParams.search, currentPage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Realtime subscription ──────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('income-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        () => {
          fetchData();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  // ─── Fallback polling (15s) when page is visible ────────────
  useEffect(() => {
    let interval;

    const handleVisibility = () => {
      if (document.hidden) {
        clearInterval(interval);
      } else {
        interval = setInterval(fetchData, 15000);
      }
    };

    interval = setInterval(fetchData, 15000);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchData]);

  return {
    transaksiList,
    totalCount,
    currentPage,
    totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    isLoading,
    error,
    stats,
    setPage: setCurrentPage,
    refresh: fetchData,
  };
}
