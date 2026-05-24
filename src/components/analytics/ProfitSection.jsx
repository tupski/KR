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
import { formatRupiah } from '@/utils/analyticsFormatters';
import { formatPeriodLabel } from '@/utils/analyticsPeriodLabel';

const BAR_COLOR = '#10b981'; // emerald-500
const HIGHLIGHT_COLOR = '#0ea5e9'; // sky-500

const compactRupiah = (value) =>
  new Intl.NumberFormat('id-ID', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(value ?? 0);

/**
 * ProfitSection — Laporan Profit per Lokasi
 *
 * Menampilkan bar chart horizontal total pendapatan per lokasi, ringkasan
 * total keseluruhan, dan tabel sortable. Menggantikan pie chart yang sulit
 * dibaca ketika jumlah lokasi banyak.
 *
 * @param {{ filter: { startDate: string, endDate: string, location: string|null } }} props
 */
function ProfitSection({ filter }) {
  const { startDate, endDate, location } = filter ?? {};
  const periodLabel = formatPeriodLabel(startDate, endDate);

  const { data, isLoading, error, fetchAll } = useRpcQuery({
    rpcName: 'get_profit_per_location',
    params: {
      p_start_date: startDate,
      p_end_date: endDate,
      p_location: location ?? null,
    },
    paginated: false,
  });

  const { sortedData, requestSort, getSortIcon } = useSortableData(data);

  const { exportCsv, isExporting } = useSectionCsvExport({
    fetchAll,
    filename: `profit-per-lokasi_${startDate}_${endDate}`,
    columns: [
      { key: 'apartment_location', label: 'Lokasi' },
      { key: 'total_revenue', label: 'Total Pendapatan' },
      { key: 'total_transactions', label: 'Jumlah Transaksi' },
      { key: 'avg_revenue_per_transaction', label: 'Rata-rata per Transaksi' },
    ],
  });

  if (isLoading) return <SectionSkeleton />;
  if (error) return <SectionError name="Profit per Lokasi" message={error} />;
  if (!data.length) return <SectionEmpty message="Tidak ada data untuk periode ini" />;

  // Chart: urutan revenue desc, highlight top.
  const chartData = [...data].sort(
    (a, b) => Number(b.total_revenue || 0) - Number(a.total_revenue || 0)
  );
  const maxRevenue = chartData.reduce(
    (m, r) => Math.max(m, Number(r.total_revenue) || 0),
    0
  );

  // Total keseluruhan dari result set yang sudah teragregasi (1 row/lokasi).
  const grandTotalRevenue = chartData.reduce(
    (sum, d) => sum + Number(d.total_revenue || 0),
    0
  );

  return (
    <SectionCard
      title="Profit per Lokasi"
      periodLabel={periodLabel}
      subtitle="Total pendapatan dan rata-rata per transaksi setiap lokasi."
      onExport={exportCsv}
      isExporting={isExporting}
    >
      {/* Bar chart horizontal */}
      <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 36)}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 32, left: 8, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <YAxis
            dataKey="apartment_location"
            type="category"
            width={140}
            tick={{ fontSize: 12 }}
          />
          <XAxis
            type="number"
            tick={{ fontSize: 12 }}
            tickFormatter={compactRupiah}
          />
          <Tooltip
            formatter={(value) => [formatRupiah(value), 'Total Pendapatan']}
            labelFormatter={(label) => `Lokasi: ${label}`}
          />
          <Bar dataKey="total_revenue" radius={[0, 4, 4, 0]}>
            {chartData.map((row, idx) => (
              <Cell
                key={`cell-${idx}`}
                fill={
                  maxRevenue > 0 && Number(row.total_revenue) === maxRevenue
                    ? HIGHLIGHT_COLOR
                    : BAR_COLOR
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Ringkasan total */}
      <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-medium text-blue-900">
          Total Pendapatan Keseluruhan
        </span>
        <span className="text-base font-bold text-blue-900">
          {formatRupiah(grandTotalRevenue)}
        </span>
      </div>

      {/* Tabel sortable */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wide">
              <SortableHeader
                label="Lokasi"
                sortKey="apartment_location"
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
                sortKey="total_transactions"
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
                key={`${row.apartment_location}-${idx}`}
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
              >
                <td className="py-2 pr-4 font-medium text-gray-800">
                  {row.apartment_location}
                </td>
                <td className="py-2 pr-4 text-right text-gray-800">
                  {formatRupiah(row.total_revenue)}
                </td>
                <td className="py-2 pr-4 text-right text-gray-800">
                  {row.total_transactions}
                </td>
                <td className="py-2 text-right text-gray-800">
                  {formatRupiah(row.avg_revenue_per_transaction)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

export default ProfitSection;
