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
import { formatPersen } from '@/utils/analyticsFormatters';
import { formatPeriodLabel } from '@/utils/analyticsPeriodLabel';

/**
 * LocationFullnessSection — Laporan Lokasi Apartemen yang Sering Penuh
 *
 * Bar chart vertikal avg_occupancy_rate per lokasi + tabel sortable. Lokasi
 * tanpa total_rooms (0/NULL) menampilkan "-" pada kolom occupancy rate.
 *
 * @param {{ filter: { startDate: string, endDate: string, location: string|null } }} props
 */
function LocationFullnessSection({ filter }) {
  const { startDate, endDate, location } = filter ?? {};
  const periodLabel = formatPeriodLabel(startDate, endDate);

  const { data, isLoading, error, fetchAll } = useRpcQuery({
    rpcName: 'get_location_fullness',
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
    filename: `lokasi-sering-penuh_${startDate}_${endDate}`,
    columns: [
      { key: 'apartment_location', label: 'Lokasi' },
      { key: 'total_rooms', label: 'Total Kamar' },
      { key: 'avg_occupancy_rate', label: 'Rata-rata Occupancy (%)' },
      { key: 'peak_occupancy_rate', label: 'Peak Occupancy (%)' },
      { key: 'total_transactions', label: 'Total Transaksi' },
    ],
  });

  if (isLoading) return <SectionSkeleton />;
  if (error) return <SectionError name="Lokasi Sering Penuh" message={error} />;
  if (!data.length) return <SectionEmpty message="Tidak ada data untuk periode ini" />;

  const chartData = data.filter((row) => row.avg_occupancy_rate != null);

  return (
    <SectionCard
      title="Lokasi Sering Penuh"
      periodLabel={periodLabel}
      subtitle="Rata-rata occupancy harian dan persentase hari semua kamar terisi (peak)."
      onExport={exportCsv}
      isExporting={isExporting}
    >
      {chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 24, left: 8, bottom: 50 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="apartment_location"
              tick={{ fontSize: 11 }}
              angle={-30}
              textAnchor="end"
              interval={0}
              height={60}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(v) => `${v}%`}
              domain={[0, 'auto']}
            />
            <Tooltip
              formatter={(value) => [`${Number(value).toFixed(2)}%`, 'Rata-rata Occupancy Rate']}
              labelFormatter={(label) => `Lokasi: ${label}`}
            />
            <Bar dataKey="avg_occupancy_rate" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}

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
                label="Total Kamar"
                sortKey="total_rooms"
                onSort={requestSort}
                getSortIcon={getSortIcon}
                align="right"
              />
              <SortableHeader
                label="Rata-rata Occupancy Rate"
                sortKey="avg_occupancy_rate"
                onSort={requestSort}
                getSortIcon={getSortIcon}
                align="right"
              />
              <SortableHeader
                label="Peak Occupancy Rate"
                sortKey="peak_occupancy_rate"
                onSort={requestSort}
                getSortIcon={getSortIcon}
                align="right"
              />
              <SortableHeader
                label="Total Transaksi"
                sortKey="total_transactions"
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
                  {row.total_rooms ?? 0}
                </td>
                <td className="py-2 pr-4 text-right text-gray-800">
                  {formatPersen(row.avg_occupancy_rate)}
                </td>
                <td className="py-2 pr-4 text-right text-gray-800">
                  {formatPersen(row.peak_occupancy_rate)}
                </td>
                <td className="py-2 text-right text-gray-800">
                  {row.total_transactions}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

export default LocationFullnessSection;
