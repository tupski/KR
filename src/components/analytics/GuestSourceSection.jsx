import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useRpcQuery } from '@/hooks/useRpcQuery';
import { useSortableData } from '@/hooks/useSortableData';
import { useSectionCsvExport } from '@/hooks/useSectionCsvExport';
import { SectionCard, SectionSkeleton, SectionError, SectionEmpty, SortableHeader } from './shared';
import { formatRupiah, formatPersen } from '@/utils/analyticsFormatters';
import { formatPeriodLabel } from '@/utils/analyticsPeriodLabel';
import PaginationControls from '@/components/PaginationControls';

const BAR_COLOR = '#8b5cf6'; // violet-500
const HIGHLIGHT_COLOR = '#f59e0b'; // amber-500

/**
 * GuestSourceSection — Laporan Sumber Tamu
 *
 * Bar chart horizontal distribusi tamu per sumber (marketing internal vs OTA
 * vs "Langsung (Tanpa Marketing)") + tabel sortable dengan pagination
 * server-side. Pie chart diganti karena tampilan jelek saat sumber banyak.
 *
 * @param {{ filter: { startDate: string, endDate: string, location: string|null } }} props
 */
function GuestSourceSection({ filter }) {
  const { startDate, endDate, location } = filter ?? {};
  const periodLabel = formatPeriodLabel(startDate, endDate);

  const { data, totalCount, totalPages, currentPage, isLoading, error, setPage, fetchAll } = useRpcQuery({
    rpcName: 'get_guest_source_summary',
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
    filename: `sumber-tamu_${startDate}_${endDate}`,
    columns: [
      { key: 'source_name', label: 'Sumber' },
      { key: 'transaction_count', label: 'Jumlah Transaksi' },
      { key: 'total_revenue', label: 'Total Pendapatan' },
      { key: 'percentage', label: 'Persentase (%)' },
    ],
  });

  if (isLoading) return <SectionSkeleton />;
  if (error) return <SectionError name="Sumber Tamu" message={error} />;
  if (!data.length) return <SectionEmpty message="Tidak ada data untuk periode ini" />;

  // Chart: 10 teratas pada halaman aktif, urut transaction_count desc.
  const chartData = [...data].sort(
    (a, b) => Number(b.transaction_count || 0) - Number(a.transaction_count || 0)
  );
  const maxCount = chartData.reduce(
    (m, r) => Math.max(m, Number(r.transaction_count) || 0),
    0
  );

  return (
    <SectionCard
      title="Sumber Tamu"
      periodLabel={periodLabel}
      subtitle="Distribusi tamu berdasarkan marketing/OTA. 10 sumber per halaman."
      onExport={exportCsv}
      isExporting={isExporting}
    >
      {/* Bar chart horizontal */}
      <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 32)}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <YAxis
            dataKey="source_name"
            type="category"
            width={140}
            tick={{ fontSize: 12 }}
          />
          <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip
            formatter={(value) => [value, 'Jumlah Transaksi']}
            labelFormatter={(label) => `Sumber: ${label}`}
          />
          <Bar dataKey="transaction_count" radius={[0, 4, 4, 0]}>
            {chartData.map((row, idx) => (
              <Cell
                key={`cell-${idx}`}
                fill={
                  maxCount > 0 && Number(row.transaction_count) === maxCount
                    ? HIGHLIGHT_COLOR
                    : BAR_COLOR
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Tabel sortable */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wide">
              <SortableHeader
                label="Sumber"
                sortKey="source_name"
                onSort={requestSort}
                getSortIcon={getSortIcon}
              />
              <SortableHeader
                label="Jumlah Transaksi"
                sortKey="transaction_count"
                onSort={requestSort}
                getSortIcon={getSortIcon}
                align="right"
              />
              <SortableHeader
                label="Total Pendapatan"
                sortKey="total_revenue"
                onSort={requestSort}
                getSortIcon={getSortIcon}
                align="right"
              />
              <SortableHeader
                label="Persentase"
                sortKey="percentage"
                onSort={requestSort}
                getSortIcon={getSortIcon}
                align="right"
              />
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, idx) => (
              <tr
                key={`${row.source_name}-${idx}`}
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
              >
                <td className="py-2 pr-4 font-medium text-gray-800">{row.source_name}</td>
                <td className="py-2 pr-4 text-right text-gray-800">
                  {row.transaction_count}
                </td>
                <td className="py-2 pr-4 text-right text-gray-800">
                  {formatRupiah(row.total_revenue)}
                </td>
                <td className="py-2 text-right text-gray-800">
                  {formatPersen(row.percentage)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
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

export default GuestSourceSection;
