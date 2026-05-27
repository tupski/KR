import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

/**
 * Fetch room availability data: rooms, active transactions, unpaid fees,
 * and karyawan assignments. Optionally filters rooms by karyawan assignment.
 *
 * @param {object} session   - Current auth session (contains user.id)
 * @param {string} userRole  - Current user role ('karyawan', 'admin', 'super_admin')
 * @returns {object} Rooms, transactions, paidFees, assignments, loading state
 */
export function useRoomAvailability(session, userRole) {
  const [rooms, setRooms] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [paidFees, setPaidFees] = useState([]);
  const [assignments, setAssignments] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [roomsRes, txRes, feesRes, assignRes] = await Promise.all([
        supabase
          .from('nomor_kamar')
          .select('*, locations(*)')
          .order('apartment_location')
          .order('nomor_kamar'),
        supabase
          .from('transactions')
          .select('*, marketing(name)')
          .is('checkout_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('fee_items')
          .select('*, marketing(name)')
          .is('paid_at', null),
        supabase
          .from('karyawan_assignments')
          .select('*')
          .eq('user_id', session?.user?.id)
          .single(),
      ]);

      let fetchedRooms = roomsRes.data || [];
      const fetchedTx = txRes.data || [];
      const fetchedFees = feesRes.data || [];
      const fetchedAssign = assignRes.data || null;

      // Apply role-based filtering for karyawan
      if (userRole === 'karyawan' && fetchedAssign) {
        fetchedRooms = fetchedRooms.filter(
          (r) => r.apartment_location === fetchedAssign.lokasi,
        );
      }

      setRooms(fetchedRooms);
      setTransactions(fetchedTx);
      setPaidFees(fetchedFees);
      setAssignments(fetchedAssign);
    } catch (err) {
      setError(err.message || 'Gagal memuat data ketersediaan kamar');
    } finally {
      setIsLoading(false);
    }
  }, [session?.user?.id, userRole]);

  useEffect(() => {
    if (session?.user?.id) {
      fetchData();
    }
  }, [session?.user?.id, fetchData]);

  return { rooms, transactions, paidFees, assignments, isLoading, error, refresh: fetchData };
}
