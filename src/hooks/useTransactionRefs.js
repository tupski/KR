import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { calcEndAt } from '@/lib/roomUtils';

/**
 * Fetch reference data needed by the transaction form: locations, rooms,
 * marketing, karyawan, active transactions, and current user assignments.
 *
 * @param {string} apartment_location - Currently selected location for filtering rooms
 * @returns {object} Reference data, filtered rooms, occupied keys, loading state
 */
export function useTransactionRefs(apartment_location) {
  const [refs, setRefs] = useState({
    lokasi: [],
    kamar: [],
    marketing: [],
    karyawan: [],
    roomTransactions: [],
    assignments: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRefs = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const results = await Promise.all([
        supabase.from('lokasi').select('*').order('name'),
        supabase.from('kamar').select('*').order('nomor_kamar'),
        supabase.from('marketing').select('*').order('name'),
        supabase.from('karyawan').select('*').order('nama'),
        supabase
          .from('transactions')
          .select('*')
          .is('checkout_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('karyawan_assignments')
          .select('*')
          .eq('user_id', (await supabase.auth.getSession())?.data?.session?.user?.id)
          .single(),
      ]);

      setRefs({
        lokasi: results[0].data || [],
        kamar: results[1].data || [],
        marketing: results[2].data || [],
        karyawan: results[3].data || [],
        roomTransactions: results[4].data || [],
        assignments: results[5].data || null,
      });
    } catch (err) {
      setError(err.message || 'Gagal memuat data referensi');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRefs();
  }, [fetchRefs]);

  // ─── Filtered Kamar ────────────────────────────────────────
  const filteredKamar = useMemo(() => {
    if (!apartment_location) return refs.kamar;
    return refs.kamar.filter((k) => k.apartment_location === apartment_location);
  }, [apartment_location, refs.kamar]);

  // ─── Occupied Rooms Set ────────────────────────────────────
  const occupiedRoomKeys = useMemo(() => {
    const now = new Date();
    return new Set(
      refs.roomTransactions
        .filter((tx) => {
          const end = calcEndAt(tx);
          return now < end;
        })
        .map((tx) => `${tx.apartment_location}::${tx.room_number}`),
    );
  }, [refs.roomTransactions]);

  return { refs, filteredKamar, occupiedRoomKeys, isLoading, error, fetchRefs };
}
