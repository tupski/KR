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
import { SectionCard, SectionSkeleton, SectionError, SectionEmpty, SortableHeader } from './shared';
import { formatRupiah, formatTanggal } from '@/utils/analyticsFormatters';
import { formatPeriodLabel } from '@/utils/analyticsPeriodLabel';
import PaginationControls from '@/components/PaginationControls';

/**
 * RepeatGuestSection — Laporan Repeat Guest
 *
 * Bar chart horizontal repeat guest (halaman aktif) + tabel sortable.
 *
 * @param {{ filter: { startDate: string, endDate: string, location: string|null } }} props
 */
function RepeatGuestSection({ filter }) {
  const { startDate, endDate, location } = filter ?? {};
  const periodLabel = formatPeriodLabel(startDate, endDate);

  const { data, totalCount, totalPages, currentPage, isLoading, error, setPage } = useRpcQuery({
    rpcName: 'get_repeat_guests',
    params: {
      p_start_date: startDate,
      p_end_date: endDate,
      p_location: location ?? null,
    },
    pageSize: 10,
    paginated: true,
  });

  const { sortedData, requestSort, getSortIcon } = useSortableData(data);

  if (isLoading) return <SectionSkeleton />;
  if (error) return <SectionError name="Repeat Guest" message={error} />;
  if (!data.length) return <SectionEmpty message="Tidak ada repeat guest untuk periode ini" />;

  const chartData = [...data].sort((a, b) => b.visit_count - a.visit_count);

  return (
    <SectionCard
      title="Repeat Guest"
      periodLabel={periodLabel}
      subtitle="Tamu dengan ≥ 2 kunjungan dalam periode ini. 10 per halaman."
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
            dataKey="customer_name"
            type="category"
            width={130}
            tick={{ fontSize: 12 }}
          />
          <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip
            formatter={(value) => [value, 'Jumlah Kunjungan']}
            labelFormatter={(label) => `Tamu: ${label}`}
          />
          <Bar dataKey="visit_count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* Tabel sortable */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wide">
              <SortableHeader
                label="Nama Tamu"
                sortKey="customer_name"
                onSort={requestSort}
                getSortIcon={getSortIcon}
              />
              <SortableHeader
                label="Jumlah Kunjungan"
                sortKey="visit_count"
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
                label="Kunjungan Pertama"
                sortKey="first_visit"
                onSort={requestSort}
                getSortIcon={getSortIcon}
              />
              <SortableHeader
                label="Kunjungan Terakhir"
                sortKey="last_visit"
                onSort={requestSort}
                getSortIcon={getSortIcon}
              />
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, idx) => (
              <tr
                key={`${row.customer_name}-${idx}`}
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
              >
                <td className="py-2 pr-4 font-medium text-gray-800">{row.customer_name}</td>
                <td className="py-2 pr-4 text-right text-gray-800">{row.visit_count}</td>
                <td className="py-2 pr-4 text-right text-gray-800">
                  {formatRupiah(row.total_revenue)}
                </td>
                <td className="py-2 pr-4 text-gray-800">{formatTanggal(row.first_visit)}</td>
                <td className="py-2 text-gray-800">{formatTanggal(row.last_visit)}</td>
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

export default RepeatGuestSection;
