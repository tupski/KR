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
import { SectionCard, SectionSkeleton, SectionError, SectionEmpty, SortableHeader } from './shared';
import { formatRupiah, formatPersen } from '@/utils/analyticsFormatters';
import { formatPeriodLabel } from '@/utils/analyticsPeriodLabel';

const TRANSIT_COLOR = '#3b82f6'; // blue-500
const FULLDAY_COLOR = '#10b981'; // emerald-500
const NIGHT_COLOR = '#f59e0b'; // amber-500
const NIGHT_PLUS_COLOR = '#ef4444'; // red-500
const OTHER_COLOR = '#9ca3af'; // gray-400

/**
 * Pilih warna bar berdasarkan kategori durasi.
 * @param {string} category
 * @returns {string}
 */
function colorForCategory(category) {
  if (typeof category !== 'string') return OTHER_COLOR;
  if (category.startsWith('Transit')) return TRANSIT_COLOR;
  if (category === 'Fullday') return FULLDAY_COLOR;
  if (category === 'Per Malam - 1 Malam') return NIGHT_COLOR;
  if (category === 'Per Malam - 2+ Malam') return NIGHT_PLUS_COLOR;
  return OTHER_COLOR;
}

/**
 * StayDurationSection — Laporan Durasi Menginap
 *
 * Bar chart vertikal jumlah transaksi per kategori durasi (transit per-jam,
 * fullday, per malam) + tabel sortable. Pie chart diganti karena dengan 11
 * kategori transit + 3 kategori lain, pie chart sulit dibaca.
 *
 * @param {{ filter: { startDate: string, endDate: string, location: string|null } }} props
 */
function StayDurationSection({ filter }) {
  const { startDate, endDate, location } = filter ?? {};
  const periodLabel = formatPeriodLabel(startDate, endDate);

  const { data, isLoading, error } = useRpcQuery({
    rpcName: 'get_stay_duration_summary',
    params: {
      p_start_date: startDate,
      p_end_date: endDate,
      p_location: location ?? null,
    },
    paginated: false,
  });

  const { sortedData, requestSort, getSortIcon } = useSortableData(data);

  if (isLoading) return <SectionSkeleton />;
  if (error) return <SectionError name="Durasi Menginap" message={error} />;
  if (!data.length) return <SectionEmpty message="Tidak ada data untuk periode ini" />;

  // RPC sudah mengurutkan ASC by sort_key (1 jam .. 11 jam .. fullday .. malam).
  const chartData = data;

  return (
    <SectionCard
      title="Durasi Menginap"
      periodLabel={periodLabel}
      subtitle="Setiap durasi transit (1–11 jam) dipaparkan terpisah, lalu fullday dan per malam."
    >
      {/* Bar chart vertikal */}
      <ResponsiveContainer width="100%" height={320}>
        <BarChart
          data={chartData}
          margin={{ top: 4, right: 24, left: 8, bottom: 60 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="duration_category"
            tick={{ fontSize: 11 }}
            angle={-35}
            textAnchor="end"
            interval={0}
            height={70}
          />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip
            formatter={(value, name, props) => {
              if (name === 'transaction_count') return [value, 'Jumlah Transaksi'];
              return [value, name];
            }}
            labelFormatter={(label) => `Kategori: ${label}`}
          />
          <Bar dataKey="transaction_count" radius={[4, 4, 0, 0]}>
            {chartData.map((row, idx) => (
              <Cell key={`cell-${idx}`} fill={colorForCategory(row.duration_category)} />
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
                label="Kategori"
                sortKey="duration_sort_key"
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
                label="Persentase"
                sortKey="percentage"
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
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, idx) => (
              <tr
                key={`${row.duration_category}-${idx}`}
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
              >
                <td className="py-2 pr-4 font-medium text-gray-800">
                  {row.duration_category}
                </td>
                <td className="py-2 pr-4 text-right text-gray-800">
                  {row.transaction_count}
                </td>
                <td className="py-2 pr-4 text-right text-gray-800">
                  {formatPersen(row.percentage)}
                </td>
                <td className="py-2 text-right text-gray-800">
                  {formatRupiah(row.total_revenue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

export default StayDurationSection;
