import React, { useState } from 'react';
import { Download } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatRupiah } from '@/lib/formatRupiah';
import * as XLSX from 'xlsx';

const FORMAT_OPTIONS = [
  { value: 'xlsx', label: 'Excel (.xlsx)' },
  { value: 'csv', label: 'CSV (.csv)' },
];

/**
 * IncomeExportDialog — Export dialog with date range and format options.
 *
 * Generates an XLSX/CSV export of the current transaction list.
 *
 * @param {object} props
 * @param {boolean} props.open - Dialog visibility
 * @param {(open: boolean) => void} props.onOpenChange - Dialog setter
 * @param {object[]} props.transactions - Transaction list to export
 * @param {string} [props.startDate] - Start date label for filename
 * @param {string} [props.endDate] - End date label for filename
 */
export function IncomeExportDialog({
  open,
  onOpenChange,
  transactions = [],
  startDate = '',
  endDate = '',
}) {
  const [format, setFormat] = useState('xlsx');

  const formatDateTime = (iso) =>
    iso ? new Date(iso).toLocaleString('id-ID') : '-';

  const formatRentalDuration = (hours) => {
    if (!hours) return '1 JAM';
    const durationMap = { 3: '3 JAM', 6: '6 JAM', 9: '9 JAM', 12: '12 JAM', 24: '24 JAM' };
    return durationMap[hours] || `${hours} JAM`;
  };

  const handleExport = () => {
    const dataToExport = transactions.map((t) => ({
      'Waktu Check-in': formatDateTime(t.checkin_at || t.created_at),
      'Nama Customer': t.customer_name,
      'Nama Marketing': t.marketing_name,
      Lokasi: t.apartment_location,
      Kamar: t.room_number,
      'Lama Sewa': formatRentalDuration(t.rental_duration),
      Shift: t.shift,
      Tunai: t.cash_amount,
      Transfer: t.transfer_amount,
      Total: (t.cash_amount || 0) + (t.transfer_amount || 0),
      'Fee Marketing': t.marketing_fee,
      'Diinput Oleh': t.input_by,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transaksi');

    const dateLabel = startDate && endDate ? `${startDate}_${endDate}` : 'export';
    const filename = `Laporan_Transaksi_${dateLabel}.${format}`;

    if (format === 'csv') {
      XLSX.writeFile(workbook, filename, { bookType: 'csv' });
    } else {
      XLSX.writeFile(workbook, filename);
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-green-500" />
            Ekspor Transaksi
          </DialogTitle>
          <DialogDescription>
            Pilih format dan unduh laporan transaksi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Format selection */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              Format File
            </label>
            <div className="flex gap-2">
              {FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFormat(opt.value)}
                  className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                    format === opt.value
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            <p>
              Mengekspor <strong>{transactions.length}</strong> transaksi
              {startDate && ` sejak ${startDate}`}
              {endDate && ` hingga ${endDate}`}.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button
              onClick={handleExport}
              className="flex-1 bg-green-500 text-white hover:bg-green-600"
            >
              <Download className="mr-2 h-4 w-4" />
              Ekspor
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
