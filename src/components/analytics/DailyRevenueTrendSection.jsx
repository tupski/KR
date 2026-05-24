import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useRpcQuery } from '@/hooks/useRpcQuery';
import { useSortableData } from '@/hooks/useSortableData';
import { useSectionCsvExport } from '@/hooks/useSectionCsvExport';
import { SectionCard, SectionSkeleton, SectionError, SectionEmpty, SortableHeader } from './shared';
import { formatRupiah, formatTanggal } from '@/utils/analyticsFormatters';
import { formatPeriodLabel } from '@/utils/analyticsPeriodLabel';
import PaginationControls from '@/components/PaginationControls';

const compactRupiah = (value) =>
  new Intl.NumberFormat('id-ID', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(value ?? 0);

/**
 * Tooltip kustom untuk bar chart Tren Pendapatan Harian.
 */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;

  const point = payload[0]?.payload ?? {};
  return (
    <div className="rounded-lg border border-gray-200 bg-white/95 px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-gray-800">{formatTanggal(label)}</p>
      <p className="mt-1 text-gray-600">
        Pendapatan:{' '}
        <span className="font-semibold text-gray-800">
          {formatRupiah(point.total_revenue)}
        </span>
      </p>
      <p className="text-gray-600">
        Transaksi:{' '}
        <span className="font-semibold text-gray-800">
          {point.transaction_count ?? 0}
        </span>
      </p>
    </div>
  );
}

/**
 * DailyRevenueTrendSection — Laporan Tren Pendapatan Harian
 *
 * Bar chart pendapatan harian + tabel sortable. Line chart diganti dengan
 * batang sesuai permintaan.
 *
 * @param {{ filter: { startDate: string, endDate: string, location: string|null } }} props
 */
function DailyRevenueTrendSection({ filter }) {
  const { startDate, endDate, location } = filter ?? {};
  const periodLabel = formatPeriodLabel(startDate, endDate);

  const { data, totalCount, totalPages, currentPage, isLoading, error, setPage, fetchAll } = useRpcQuery({
    rpcName: 'get_daily_revenue_trend',
    params: {
      p_start_date: startDate,
      p_end_date: endDate,
      p_location: location ?? null,
    },
    pageSize: 10,
    paginated: true,
  });

  const { sortedData, requestSort, getSortIcon } = useSortableData(data);

  const { exportCsv, isExporting } = useSectionCsvExport({
    fetchAll,
    filename: `tren-pendapatan-harian_${startDate}_${endDate}`,
    columns: [
      { key: 'transaction_date', label: 'Tanggal' },
      { key: 'total_revenue', label: 'Total Pendapatan' },
      { key: 'transaction_count', label: 'Jumlah Transaksi' },
      { key: 'avg_revenue_per_transaction', label: 'Rata-rata per Transaksi' },
    ],
  });

  if (isLoading) return <SectionSkeleton />;
  if (error) return <SectionError name="Tren Pendapatan Harian" message={error} />;
  if (!data.length) return <SectionEmpty message="Tidak ada data untuk periode ini" />;

  // RPC mengurutkan DESC (terbaru → terlama). Untuk chart, balik ASC supaya
  // sumbu X kiri = lebih lama dan kanan = lebih baru (intuitif untuk tren).
  const chartData = [...data].reverse();

  return (
    <SectionCard
      title="Tren Pendapatan Harian"
      periodLabel={periodLabel}
      subtitle="Pendapatan harian (10 hari per halaman tabel)."
      onExport={exportCsv}
      isExporting={isExporting}
    >
      {/* Bar chart vertikal */}
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 24, left: 8, bottom: 40 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="transaction_date"
            tick={{ fontSize: 11 }}
            tickFormatter={(value) => formatTanggal(value)}
            angle={-35}
            textAnchor="end"
            interval={chartData.length > 14 ? 'preserveStartEnd' : 0}
            height={50}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            tickFormatter={compactRupiah}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="total_revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* Tabel sortable */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wide">
              <SortableHeader
                label="Tanggal"
                sortKey="transaction_date"
                onSort={requestSort}
                getSortIcon={getSortIcon}
              />
              <SortableHeader
                label="Total Pendapatan"
                sortKey="total_revenue"
                onSort={requestSort}
                getSortIcon={getSortIcon}
                align="right"
              />
              <SortableHeader
                label="Jumlah Transaksi"
                sortKey="transaction_count"
                onSort={requestSort}
                getSortIcon={getSortIcon}
                align="right"
              />
              <SortableHeader
                label="Rata-rata per Transaksi"
                sortKey="avg_revenue_per_transaction"
                onSort={requestSort}
                getSortIcon={getSortIcon}
                align="right"
              />
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, idx) => (
              <tr
                key={`${row.transaction_date}-${idx}`}
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
              >
                <td className="py-2 pr-4 font-medium text-gray-800">
                  {formatTanggal(row.transaction_date)}
                </td>
                <td className="py-2 pr-4 text-right text-gray-800">
                  {formatRupiah(row.total_revenue)}
                </td>
                <td className="py-2 pr-4 text-right text-gray-800">
                  {row.transaction_count ?? 0}
                </td>
                <td className="py-2 text-right text-gray-800">
                  {formatRupiah(row.avg_revenue_per_transaction)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
        itemsPerPage={10}
        totalItems={totalCount}
      />
    </SectionCard>
  );
}

export default DailyRevenueTrendSection;
