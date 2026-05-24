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
import { formatRupiah, formatPersen } from '@/utils/analyticsFormatters';
import { formatPeriodLabel } from '@/utils/analyticsPeriodLabel';

const compactRupiah = (value) =>
    new Intl.NumberFormat('id-ID', {
        notation: 'compact',
        compactDisplay: 'short',
        maximumFractionDigits: 1,
    }).format(value ?? 0);

/**
 * ExpenseBreakdownSection — Laporan Pengeluaran per Kategori
 *
 * Bar chart horizontal pengeluaran per kategori + tabel sortable.
 *
 * @param {{ filter: { startDate: string, endDate: string, location: string|null } }} props
 */
function ExpenseBreakdownSection({ filter }) {
    const { startDate, endDate, location } = filter ?? {};
    const periodLabel = formatPeriodLabel(startDate, endDate);

    const { data, isLoading, error, fetchAll } = useRpcQuery({
        rpcName: 'get_expense_breakdown_summary',
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
      filename: `pengeluaran-per-kategori_${startDate}_${endDate}`,
      columns: [
        { key: 'category', label: 'Kategori' },
        { key: 'total_expense', label: 'Total Pengeluaran' },
        { key: 'expense_count', label: 'Jumlah Transaksi' },
        { key: 'percentage', label: 'Persentase (%)' },
      ],
    });

    if (isLoading) return <SectionSkeleton />;
    if (error) return <SectionError name="Pengeluaran per Kategori" message={error} />;
    if (!data.length) return <SectionEmpty message="Tidak ada pengeluaran untuk periode ini" />;

    // Sudah desc by total_expense dari RPC. Untuk chart, batasi 12 teratas
    // agar tetap rapi (kategori bisa banyak).
    const chartData = data.slice(0, 12);

    const totalExpense = data.reduce(
        (sum, d) => sum + Number(d.total_expense || 0),
        0
    );

    return (
        <SectionCard
            title="Pengeluaran per Kategori"
            periodLabel={periodLabel}
            subtitle="Top 12 kategori ditampilkan di chart. Tabel berisi semua kategori."
            onExport={exportCsv}
            isExporting={isExporting}
    >
            {/* Ringkasan total */}
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-medium text-red-900">Total Pengeluaran</span>
                <span className="text-base font-bold text-red-900">
                    {formatRupiah(totalExpense)}
                </span>
            </div>

            {/* Bar chart horizontal */}
            <ResponsiveContainer width="100%" height={Math.max(240, chartData.length * 32)}>
                <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 4, right: 32, left: 8, bottom: 4 }}
                >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <YAxis
                        dataKey="category"
                        type="category"
                        width={140}
                        tick={{ fontSize: 12 }}
                    />
                    <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={compactRupiah} />
                    <Tooltip
                        formatter={(value) => [formatRupiah(value), 'Total Pengeluaran']}
                        labelFormatter={(label) => `Kategori: ${label}`}
                    />
                    <Bar dataKey="total_expense" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
            </ResponsiveContainer>

            {/* Tabel sortable (semua kategori) */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead>
                        <tr className="border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wide">
                            <SortableHeader
                                label="Kategori"
                                sortKey="category"
                                onSort={requestSort}
                                getSortIcon={getSortIcon}
                            />
                            <SortableHeader
                                label="Total Pengeluaran"
                                sortKey="total_expense"
                                onSort={requestSort}
                                getSortIcon={getSortIcon}
                                align="right"
                            />
                            <SortableHeader
                                label="Jumlah Transaksi"
                                sortKey="expense_count"
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
                                key={`${row.category}-${idx}`}
                                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                            >
                                <td className="py-2 pr-4 font-medium text-gray-800">{row.category}</td>
                                <td className="py-2 pr-4 text-right text-gray-800">
                                    {formatRupiah(row.total_expense)}
                                </td>
                                <td className="py-2 pr-4 text-right text-gray-800">
                                    {row.expense_count}
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

export default ExpenseBreakdownSection;
