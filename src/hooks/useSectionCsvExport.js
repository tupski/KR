import { useCallback, useState } from 'react';
import { exportToCSV } from '@/utils/csvExport';

/**
 * useSectionCsvExport
 *
 * Helper hook untuk tombol "Export CSV" di SectionCard analytics.
 * Memanggil fetchAll() dari useRpcQuery (yang fetch tanpa pagination) lalu
 * trigger download CSV menggunakan kolom yang didefinisikan caller.
 *
 * @param {object} options
 * @param {() => Promise<{ data: Array, error: string|null }>} options.fetchAll
 * @param {string} options.filename - Nama file (tanpa .csv) — biasanya menyertakan periode
 * @param {Array<{ key: string, label: string, format?: (v:any, row:object) => any }>} options.columns
 *
 * @returns {{ exportCsv: () => Promise<void>, isExporting: boolean, error: string|null }}
 */
export function useSectionCsvExport({ fetchAll, filename, columns }) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);

  const exportCsv = useCallback(async () => {
    setIsExporting(true);
    setError(null);
    try {
      const { data, error: fetchError } = await fetchAll();
      if (fetchError) {
        setError(fetchError);
        return;
      }
      exportToCSV(filename, data, columns);
    } catch (e) {
      setError(e?.message ?? 'Gagal export CSV');
    } finally {
      setIsExporting(false);
    }
  }, [fetchAll, filename, columns]);

  return { exportCsv, isExporting, error };
}

export default useSectionCsvExport;
