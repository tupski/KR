import { useMemo, useState, useCallback } from 'react';

/**
 * useSortableData — Client-side sort untuk DATA YANG SUDAH AGREGAT.
 *
 * Hook ini DIRANCANG untuk hasil RPC analytics yang ukurannya kecil (jumlah
 * baris terbatas oleh `p_limit` server-side, biasanya 10–24 baris). Tidak
 * digunakan untuk mengurutkan tabel transaksi mentah (lihat AGENTS.md:
 * "Avoid frontend-side aggregation for large datasets").
 *
 * Contract:
 *   - Bila tidak ada sortConfig, urutan asli dari server dipertahankan.
 *   - sortConfig: { key: string, direction: 'asc' | 'desc' }
 *   - Mengembalikan { sortedData, sortConfig, requestSort, getSortIcon }
 *
 * @template T
 * @param {Array<T>} data - Array data yang akan diurutkan
 * @param {{ key: string, direction: 'asc' | 'desc' }|null} initialConfig
 * @returns {{
 *   sortedData: Array<T>,
 *   sortConfig: { key: string, direction: 'asc' | 'desc' }|null,
 *   requestSort: (key: string) => void,
 *   getSortIcon: (key: string) => '↑' | '↓' | '↕'
 * }}
 */
export function useSortableData(data, initialConfig = null) {
  const [sortConfig, setSortConfig] = useState(initialConfig);

  const sortedData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return data ?? [];
    if (!sortConfig || !sortConfig.key) return data;

    const { key, direction } = sortConfig;
    const sorted = [...data].sort((a, b) => {
      const av = a?.[key];
      const bv = b?.[key];

      // null / undefined selalu di akhir, terlepas dari direction
      const aNull = av === null || av === undefined;
      const bNull = bv === null || bv === undefined;
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;

      // Numerik: bila keduanya bisa diparse sebagai angka
      const aNum = typeof av === 'number' ? av : Number(av);
      const bNum = typeof bv === 'number' ? bv : Number(bv);
      const bothNumeric =
        !Number.isNaN(aNum) && !Number.isNaN(bNum) &&
        // Pastikan bukan tanggal yang kebetulan parse-able sebagai angka
        !(typeof av === 'string' && av.includes('-'));

      let cmp;
      if (bothNumeric) {
        cmp = aNum - bNum;
      } else {
        // String compare locale-aware (id-ID), case-insensitive
        cmp = String(av).localeCompare(String(bv), 'id-ID', {
          sensitivity: 'base',
          numeric: true,
        });
      }
      return direction === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [data, sortConfig]);

  const requestSort = useCallback((key) => {
    setSortConfig((prev) => {
      // Toggle sequence: asc → desc → null (kembali ke urutan server)
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  }, []);

  const getSortIcon = useCallback(
    (key) => {
      if (!sortConfig || sortConfig.key !== key) return '↕';
      return sortConfig.direction === 'asc' ? '↑' : '↓';
    },
    [sortConfig]
  );

  return { sortedData, sortConfig, requestSort, getSortIcon };
}

export default useSortableData;
