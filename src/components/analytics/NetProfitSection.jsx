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
    ReferenceLine,
} from 'recharts';
import { useRpcQuery } from '@/hooks/useRpcQuery';
import { useSortableData } from '@/hooks/useSortableData';
import { useSectionCsvExport } from '@/hooks/useSectionCsvExport';
import { SectionCard, SectionSkeleton, SectionError, SectionEmpty, SortableHeader } from './shared';
import { formatRupiah, formatPersen } from '@/utils/analyticsFormatters';
import { formatPeriodLabel } from '@/utils/analyticsPeriodLabel';

const POSITIVE_COLOR = '#10b981'; // emerald-500
const NEGATIVE_COLOR = '#ef4444'; // red-500

const compactRupiah = (value) =>
    new Intl.NumberFormat('id-ID', {
        notation: 'compact',
        compactDisplay: 'short',
        maximumFractionDigits: 1,
    }).format(value ?? 0);

/**
 * NetProfitSection — Laporan Net Profit per Lokasi
 *
 * Bar chart horizontal net_profit per lokasi (warna merah jika negatif)
 * + tabel sortable. Total revenue & total expense ditampilkan di kartu
 * ringkasan di atas tabel.
 *
 * @param {{ filter: { startDate: string, endDate: string, location: string|null } }} props
 */
function NetProfitSection({ filter }) {
    const { startDate, endDate, location } = filter ?? {};
    const periodLabel = formatPeriodLabel(startDate, endDate);

    const { data, isLoading, error, fetchAll } = useRpcQuery({
        rpcName: 'get_net_profit_per_location',
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
        filename: `net-profit_${startDate}_${endDate}`,
        columns: [
            { key: 'apartment_location', label: 'Lokasi' },
            { key: 'total_revenue', label: 'Pendapatan' },
            { key: 'total_expense', label: 'Pengeluaran' },
            { key: 'net_profit', label: 'Net Profit' },
            { key: 'profit_margin', label: 'Margin (%)' },
        ],
    });

    if (isLoading) return <SectionSkeleton />;
    if (error) return <SectionError name="Net Profit per Lokasi" message={error} />;
    if (!data.length) return <SectionEmpty message="Tidak ada data untuk periode ini" />;

    const chartData = [...data].sort(
        (a, b) => Number(b.net_profit || 0) - Number(a.net_profit || 0)
    );

    const totalRevenue = data.reduce((sum, d) => sum + Number(d.total_revenue || 0), 0);
    const totalExpense = data.reduce((sum, d) => sum + Number(d.total_expense || 0), 0);
    const totalNetProfit = totalRevenue - totalExpense;
    const overallMargin =
        totalRevenue > 0 ? ((totalNetProfit / totalRevenue) * 100).toFixed(2) : null;

    return (
        <SectionCard
            title="Net Profit per Lokasi"
            periodLabel={periodLabel}
            subtitle="Pendapatan dikurangi pengeluaran (Tagihan Unit, Fee Marketing, Listrik, dll)."
            onExport={exportCsv}
            isExporting={isExporting}
        >
            {/* Ringkasan total */}
            <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2">
                    <p className="text-[11px] text-emerald-700 font-semibold uppercase tracking-wide">
                        Pendapatan
                    </p>
                    <p className="text-sm font-bold text-emerald-900">
                        {formatRupiah(totalRevenue)}
                    </p>
                </div>
                <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2">
                    <p className="text-[11px] text-red-700 font-semibold uppercase tracking-wide">
                        Pengeluaran
                    </p>
                    <p className="text-sm font-bold text-red-900">{formatRupiah(totalExpense)}</p>
                </div>
                <div
                    className={`rounded-xl px-3 py-2 border ${totalNetProfit >= 0
                        ? 'bg-blue-50 border-blue-100'
                        : 'bg-red-50 border-red-100'
                        }`}
                >
                    <p
                        className={`text-[11px] font-semibold uppercase tracking-wide ${totalNetProfit >= 0 ? 'text-blue-700' : 'text-red-700'
                            }`}
                    >
                        Net Profit
                    </p>
                    <p
                        className={`text-sm font-bold ${totalNetProfit >= 0 ? 'text-blue-900' : 'text-red-900'
                            }`}
                    >
                        {formatRupiah(totalNetProfit)}{' '}
                        <span className="text-[11px] font-normal">
                            ({overallMargin != null ? `${overallMargin}%` : '-'})
                        </span>
                    </p>
                </div>
            </div>

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
                    <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={compactRupiah} />
                    <Tooltip
                        formatter={(value, name) => {
                            if (name === 'net_profit') return [formatRupiah(value), 'Net Profit'];
                            return [formatRupiah(value), name];
                        }}
                        labelFormatter={(label) => `Lokasi: ${label}`}
                    />
                    <ReferenceLine x={0} stroke="#9ca3af" />
                    <Bar dataKey="net_profit" radius={[0, 4, 4, 0]}>
                        {chartData.map((row, idx) => (
                            <Cell
                                key={`cell-${idx}`}
                                fill={Number(row.net_profit) >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR}
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
                                label="Pendapatan"
                                sortKey="total_revenue"
                                onSort={requestSort}
                                getSortIcon={getSortIcon}
                                align="right"
                            />
                            <SortableHeader
                                label="Pengeluaran"
                                sortKey="total_expense"
                                onSort={requestSort}
                                getSortIcon={getSortIcon}
                                align="right"
                            />
                            <SortableHeader
                                label="Net Profit"
                                sortKey="net_profit"
                                onSort={requestSort}
                                getSortIcon={getSortIcon}
                                align="right"
                            />
                            <SortableHeader
                                label="Margin"
                                sortKey="profit_margin"
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
                                    {formatRupiah(row.total_expense)}
                                </td>
                                <td
                                    className={`py-2 pr-4 text-right font-semibold ${Number(row.net_profit) >= 0 ? 'text-emerald-700' : 'text-red-700'
                                        }`}
                                >
                                    {formatRupiah(row.net_profit)}
                                </td>
                                <td className="py-2 text-right text-gray-800">
                                    {formatPersen(row.profit_margin)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </SectionCard>
    );
}

export default NetProfitSection;
