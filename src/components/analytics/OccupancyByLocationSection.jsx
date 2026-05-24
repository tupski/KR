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

const BAR_COLOR = '#3b82f6';
const HIGHLIGHT_COLOR = '#10b981';

/**
 * OccupancyByLocationSection — Laporan Okupansi per Lokasi Apartemen
 *
 * Menampilkan bar chart horizontal dan tabel okupansi per lokasi
 * (bukan per kamar). total_rooms diambil dari tabel `nomor_kamar`.
 *
 * @param {{ filter: { startDate: string, endDate: string, location: string|null } }} props
 */
function OccupancyByLocationSection({ filter }) {
    const { startDate, endDate, location } = filter ?? {};
    const periodLabel = formatPeriodLabel(startDate, endDate);

    const { data, isLoading, error } = useRpcQuery({
        rpcName: 'get_occupancy_per_location',
        params: {
            p_start_date: startDate,
            p_end_date: endDate,
            p_location: location ?? null,
        },
        paginated: false,
    });

    const { sortedData, requestSort, getSortIcon } = useSortableData(data);

    if (isLoading) return <SectionSkeleton />;
    if (error) return <SectionError name="Okupansi per Lokasi Apartemen" message={error} />;
    if (!data.length) return <SectionEmpty message="Tidak ada data untuk periode ini" />;

    // Untuk chart, urutkan berdasarkan total_transactions desc & temukan max untuk highlight.
    const chartData = [...data].sort(
        (a, b) => Number(b.total_transactions || 0) - Number(a.total_transactions || 0)
    );
    const maxTx = chartData.reduce(
        (m, r) => Math.max(m, Number(r.total_transactions) || 0),
        0
    );

    return (
        <SectionCard
            title="Okupansi per Lokasi Apartemen"
            periodLabel={periodLabel}
            subtitle="Jumlah unit (dari nomor_kamar), transaksi, pendapatan, dan rata-rata occupancy harian."
        >
            {/* Bar chart horizontal — sumbu Y nama lokasi, sumbu X jumlah transaksi */}
            <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 36)}>
                <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <YAxis
                        dataKey="apartment_location"
                        type="category"
                        width={140}
                        tick={{ fontSize: 12 }}
                    />
                    <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip
                        formatter={(value) => [value, 'Jumlah Transaksi']}
                        labelFormatter={(label) => `Lokasi: ${label}`}
                    />
                    <Bar dataKey="total_transactions" radius={[0, 4, 4, 0]}>
                        {chartData.map((row, idx) => (
                            <Cell
                                key={`cell-${idx}`}
                                fill={
                                    maxTx > 0 && Number(row.total_transactions) === maxTx
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
                                label="Lokasi"
                                sortKey="apartment_location"
                                onSort={requestSort}
                                getSortIcon={getSortIcon}
                            />
                            <SortableHeader
                                label="Total Unit"
                                sortKey="total_rooms"
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
                                label="Total Pendapatan"
                                sortKey="total_revenue"
                                onSort={requestSort}
                                getSortIcon={getSortIcon}
                                align="right"
                            />
                            <SortableHeader
                                label="Occupancy Rate"
                                sortKey="occupancy_rate"
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
                                <td className="py-2 pr-4 font-medium text-gray-800">{row.apartment_location}</td>
                                <td className="py-2 pr-4 text-right text-gray-800">{row.total_rooms ?? 0}</td>
                                <td className="py-2 pr-4 text-right text-gray-800">{row.total_transactions}</td>
                                <td className="py-2 pr-4 text-right text-gray-800">
                                    {formatRupiah(row.total_revenue)}
                                </td>
                                <td className="py-2 text-right text-gray-800">
                                    {formatPersen(row.occupancy_rate)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </SectionCard>
    );
}

export default OccupancyByLocationSection;
