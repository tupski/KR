import React, { useMemo } from 'react';
import { Wallet, Banknote, Landmark } from 'lucide-react';
import { formatRupiah } from '@/lib/formatRupiah';
import { formatDateDisplay } from '@/lib/dateUtils';

/**
 * DepositSummaryCard — Summary stats: total deposit amount, count, returned vs pending.
 *
 * @param {object}   props
 * @param {Array}    props.deposits          - Filtered deposit array
 * @param {string}   props.activeTab         - 'belum' | 'sudah'
 * @param {string}   props.dateFrom          - Start date string (YYYY-MM-DD)
 * @param {string}   props.dateTo            - End date string (YYYY-MM-DD)
 */
export function DepositSummaryCard({ deposits, activeTab, dateFrom, dateTo }) {
  const summary = useMemo(() => {
    let totalCash = 0;
    let totalTransfer = 0;
    (deposits || []).forEach((t) => {
      totalCash += Number(t.deposit_cash) || 0;
      totalTransfer += Number(t.deposit_transfer) || 0;
    });
    return {
      totalCash,
      totalTransfer,
      totalAll: totalCash + totalTransfer,
      count: deposits?.length || 0,
    };
  }, [deposits]);

  const summaryTitle = useMemo(() => {
    if (!dateFrom && !dateTo) return '';
    const from = formatDateDisplay(dateFrom);
    const to = formatDateDisplay(dateTo);
    if (dateFrom === dateTo) return `Tanggal: ${from}`;
    return `Tanggal: ${from} - ${to}`;
  }, [dateFrom, dateTo]);

  const label =
    activeTab === 'belum'
      ? `Ringkasan Total Deposit (${summary.count} cs)`
      : `Total Deposit Dikembalikan (${summary.count} cs)`;

  return (
    <div
      className={`rounded-2xl border overflow-hidden ${
        activeTab === 'belum' ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
      }`}
    >
      <div className="p-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
          {label}
        </h3>
        {summaryTitle && (
          <p className="text-[10px] text-slate-500 mb-3">{summaryTitle}</p>
        )}

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-white p-2 text-center border border-slate-200 overflow-hidden">
            <Wallet className="h-4 w-4 mx-auto mb-1 text-slate-500" />
            <p className="text-[10px] text-slate-400 truncate">Total</p>
            <p
              className={`text-xs font-extrabold leading-tight ${
                activeTab === 'belum' ? 'text-amber-700' : 'text-green-700'
              }`}
            >
              {formatRupiah(summary.totalAll)}
            </p>
          </div>
          <div className="rounded-xl bg-green-50 p-2 text-center border border-green-100 overflow-hidden">
            <Banknote className="h-4 w-4 mx-auto mb-1 text-green-500" />
            <p className="text-[10px] text-green-600 truncate">Tunai</p>
            <p className="text-xs font-extrabold text-green-700 leading-tight truncate">
              {formatRupiah(summary.totalCash)}
            </p>
          </div>
          <div className="rounded-xl bg-blue-50 p-2 text-center border border-blue-100 overflow-hidden">
            <Landmark className="h-4 w-4 mx-auto mb-1 text-blue-500" />
            <p className="text-[10px] text-blue-600 truncate">Transfer</p>
            <p className="text-xs font-extrabold text-blue-700 leading-tight truncate">
              {formatRupiah(summary.totalTransfer)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
