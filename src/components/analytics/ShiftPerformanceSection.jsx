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

const SHIFT_COLORS = {
    Pagi: '#f59e0b', // amber
    Malam: '#6366f1', // indigo
    'Long Shift': '#10b981', // emerald
    'Tidak Diisi': '#9ca3af', // gray
};
const DEFAULT_COLOR = '#3b82f6';

/**
 * ShiftPerformanceSection — Performa per Shift
 *
 * Bar chart vertikal jumlah transaksi per shift (Pagi / Malam / Long Shift)
 * + tabel sortable. Berguna untuk staffing dan analisa produktivitas.
 *
 * @param {{ filter: { startDate: string, endDate: string, location: string|null } }} props
 */
function ShiftPerformanceSection({ filter }) {
    const { startDate, endDate, location } = filter ?? {};
    const periodLabel = formatPeriodLabel(startDate, endDate);

    const { data, isLoading, error, fetchAll } = useRpcQuery({
        rpcName: 'get_performance_by_shift',
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
      filename: `performa-shift_${startDate}_${endDate}`,
      columns: [
        { key: 'shift', label: 'Shift' },
        { key: 'total_transactions', label: 'Jumlah Transaksi' },
        { key: 'total_revenue', label: 'Total Pendapatan' },
        { key: 'avg_revenue_per_transaction', label: 'Rata-rata per Transaksi' },
        { key: 'percentage', label: 'Persentase (%)' },
      ],
    });

    if (isLoading) return <SectionSkeleton />;
    if (error) return <SectionError name="Performa per Shift" message={error} />;
    if (!data.length) return <SectionEmpty message="Tidak ada data untuk periode ini" />;

    return (
        <SectionCard
            title="Performa per Shift"
            periodLabel={periodLabel}
            subtitle="Jumlah transaksi dan pendapatan per shift kerja."
            onExport={exportCsv}
            isExporting={isExporting}
    >
            <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data} margin={{ top: 4, right: 24, left: 8, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="shift" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip
                        formatter={(value) => [value, 'Jumlah Transaksi']}
                        labelFormatter={(label) => `Shift: ${label}`}
                    />
                    <Bar dataKey="total_transactions" radius={[4, 4, 0, 0]}>
                        {data.map((row, idx) => (
                            <Cell
                                key={`cell-${idx}`}
                                fill={SHIFT_COLORS[row.shift] ?? DEFAULT_COLOR}
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
                                label="Shift"
                                sortKey="shift"
                                onSort={requestSort}
                                getSortIcon={getSortIcon}
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
                                label="Rata-rata per Transaksi"
                                sortKey="avg_revenue_per_transaction"
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
                                key={`${row.shift}-${idx}`}
                                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                            >
                                <td className="py-2 pr-4 font-medium text-gray-800">{row.shift}</td>
                                <td className="py-2 pr-4 text-right text-gray-800">
                                    {row.total_transactions}
                                </td>
                                <td className="py-2 pr-4 text-right text-gray-800">
                                    {formatRupiah(row.total_revenue)}
                                </td>
                                <td className="py-2 pr-4 text-right text-gray-800">
                                    {formatRupiah(row.avg_revenue_per_transaction)}
                                </td>
                                <td className="py-2 text-right text-gray-800">
                                    {formatPersen(row.percentage)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </SectionCard>
    );
}

export default ShiftPerformanceSection;
