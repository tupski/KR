import React from 'react';
import {
  Pencil,
  Trash2,
  CheckCircle,
  Repeat,
  Eye,
  Calendar,
} from 'lucide-react';
import { formatRupiah } from '@/lib/formatRupiah';
import { formatDateDisplay } from '@/lib/dateUtils';

/**
 * getDueStatus — Returns label/color based on how many days until due_date.
 * @param {string|null} dueDate - ISO date string
 * @returns {{ label: string, color: string }|null}
 */
function getDueStatus(dueDate) {
  if (!dueDate) return null;
  const now = new Date();
  const due = new Date(dueDate);
  const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { label: 'Terlambat', color: 'text-red-600 bg-red-50' };
  if (diffDays === 0) return { label: 'Jatuh Tempo Hari Ini', color: 'text-orange-600 bg-orange-50' };
  if (diffDays <= 3) return { label: `${diffDays} Hari Lagi`, color: 'text-yellow-600 bg-yellow-50' };
  return null;
}

/**
 * TagihanBillCard — Single monthly bill card with actions.
 *
 * @param {object} props
 * @param {object} props.bill - Tagihan bulanan row
 * @param {boolean} props.paidTab - Whether showing paid tab
 * @param {(bill: object) => void} props.onEdit - Open edit dialog
 * @param {(billId: number) => void} props.onPay - Open pay dialog
 * @param {(bill: object) => void} props.onToggleRecurring - Toggle recurring
 * @param {(billId: number) => void} props.onDeleteClick - Trigger delete confirmation
 * @param {(url: string) => void} props.onViewProof - View bukti_bayar image
 */
export function TagihanBillCard({
  bill,
  paidTab,
  onEdit,
  onPay,
  onToggleRecurring,
  onDeleteClick,
  onViewProof,
}) {
  const dueStatus = getDueStatus(bill.due_date);

  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-800">{bill.nama}</p>
            {bill.is_recurring && (
              <span className="flex items-center gap-0.5 rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                <Repeat className="h-3 w-3" />
                Recurring
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            <Calendar className="mr-1 inline-block h-3 w-3" />
            {formatDateDisplay(bill.due_date)}
          </p>
          {dueStatus && (
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${dueStatus.color}`}>
              {dueStatus.label}
            </span>
          )}
          {paidTab && bill.paid_at && (
            <p className="mt-1 text-xs text-green-600">
              Lunas: {formatDateDisplay(bill.paid_at)}
            </p>
          )}
          {bill.bukti_bayar && (
            <button
              type="button"
              onClick={() => onViewProof(bill.bukti_bayar)}
              className="mt-1 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700"
            >
              <Eye className="h-3 w-3" />
              Lihat Bukti Bayar
            </button>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <p className="text-sm font-bold text-gray-800">
            {formatRupiah(bill.jumlah)}
          </p>
          <div className="flex gap-1">
            {!paidTab && (
              <>
                <button
                  type="button"
                  onClick={() => onEdit(bill)}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-500"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onPay(bill.id)}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-green-500"
                  title="Bayar"
                >
                  <CheckCircle className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onToggleRecurring(bill)}
                  className={`rounded p-1 ${
                    bill.is_recurring
                      ? 'text-purple-500 hover:bg-purple-50'
                      : 'text-gray-400 hover:bg-gray-100'
                  }`}
                  title={bill.is_recurring ? 'Nonaktifkan recurring' : 'Aktifkan recurring'}
                >
                  <Repeat className="h-4 w-4" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => onDeleteClick(bill.id)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500"
              title="Hapus"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
