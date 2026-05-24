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
import { formatRupiah } from '@/utils/analyticsFormatters';
import { formatPeriodLabel } from '@/utils/analyticsPeriodLabel';

const compactRupiah = (value) =>
    new Intl.NumberFormat('id-ID', {
        notation: 'compact',
        compactDisplay: 'short',
        maximumFractionDigits: 1,
    }).format(value ?? 0);

/**
 * MonthlyRevenueTrendSection — Tren Pendapatan Bulanan
 *
 * Bar chart vertikal pendapatan per bulan + tabel sortable. Cocok untuk
 * periode panjang (3, 6, 12 bulan) di mana agregasi harian terlalu noise.
 *
 * @param {{ filter: { startDate: string, endDate: string, location: string|null } }} props
 */
function MonthlyRevenueTrendSection({ filter }) {
    const { startDate, endDate, location } = filter ?? {};
    const periodLabel = formatPeriodLabel(startDate, endDate);

    const { data, isLoading, error, fetchAll } = useRpcQuery({
        rpcName: 'get_monthly_revenue_trend',
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
        filename: `tren-pendapatan-bulanan_${startDate}_${endDate}`,
        columns: [
            { key: 'month_start', label: 'Bulan' },
            { key: 'total_revenue', label: 'Total Pendapatan' },
            { key: 'transaction_count', label: 'Jumlah Transaksi' },
            { key: 'avg_revenue_per_transaction', label: 'Rata-rata per Transaksi' },
        ],
    });

    if (isLoading) return <SectionSkeleton />;
    if (error) return <SectionError name="Tren Pendapatan Bulanan" message={error} />;
    if (!data.length) return <SectionEmpty message="Tidak ada data untuk periode ini" />;

    return (
        <SectionCard
            title="Tren Pendapatan Bulanan"
            periodLabel={periodLabel}
            subtitle="Agregat per bulan. Cocok untuk periode panjang (3, 6, 12 bulan)."
            onExport={exportCsv}
            isExporting={isExporting}
        >
            <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data} margin={{ top: 4, right: 24, left: 8, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                        dataKey="month_label"
                        tick={{ fontSize: 12 }}
                        angle={-25}
                        textAnchor="end"
                        interval={0}
                        height={50}
                    />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={compactRupiah} />
                    <Tooltip
                        formatter={(value) => [formatRupiah(value), 'Total Pendapatan']}
                        labelFormatter={(label) => `Bulan: ${label}`}
                    />
                    <Bar dataKey="total_revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead>
                        <tr className="border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wide">
                            <SortableHeader
                                label="Bulan"
                                sortKey="month_start"
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
                                key={`${row.month_start}-${idx}`}
                                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                            >
                                <td className="py-2 pr-4 font-medium text-gray-800">{row.month_label}</td>
                                <td className="py-2 pr-4 text-right text-gray-800">
                                    {formatRupiah(row.total_revenue)}
                                </td>
                                <td className="py-2 pr-4 text-right text-gray-800">
                                    {row.transaction_count}
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

export default MonthlyRevenueTrendSection;
