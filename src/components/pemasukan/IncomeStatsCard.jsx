import React from 'react';
import { formatRupiah } from '@/lib/formatRupiah';

/**
 * IncomeStatsCard — Today's income statistics summary.
 *
 * Displays total transactions today, cash total, transfer total,
 * and grand total in a grid of glassmorphic cards.
 *
 * @param {object} props
 * @param {object} props.stats - Statistics object from useIncomeData
 * @param {number} props.stats.todayCount - Number of transactions today
 * @param {number} props.stats.cashTotal - Total cash amount
 * @param {number} props.stats.transferTotal - Total transfer amount
 * @param {number} props.stats.total - Grand total (cash + transfer)
 */
export function IncomeStatsCard({ stats }) {
  const { todayCount = 0, cashTotal = 0, transferTotal = 0, total = 0 } = stats;

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Today's transaction count */}
      <div className="glassmorphic-card col-span-2 p-5">
        <h3 className="text-base font-bold text-blue-900">
          Total Transaksi Hari Ini
        </h3>
        <p className="text-2xl font-extrabold leading-tight text-blue-700 sm:text-3xl">
          {todayCount}{' '}
          <span className="text-base">transaksi</span>
        </p>
      </div>

      {/* Cash total */}
      <div className="glassmorphic-card p-4">
        <h3 className="text-base font-bold text-green-900">Tunai (Filter)</h3>
        <p className="break-all text-xl font-extrabold leading-tight text-green-700 sm:text-2xl">
          {formatRupiah(cashTotal)}
        </p>
      </div>

      {/* Transfer total */}
      <div className="glassmorphic-card p-4">
        <h3 className="text-base font-bold text-cyan-900">
          Transfer (Filter)
        </h3>
        <p className="break-all text-xl font-extrabold leading-tight text-cyan-700 sm:text-2xl">
          {formatRupiah(transferTotal)}
        </p>
      </div>
    </div>
  );
}
