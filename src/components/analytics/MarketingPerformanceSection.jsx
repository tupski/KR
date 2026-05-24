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
import PaginationControls from '@/components/PaginationControls';

const compactRupiah = (value) =>
    new Intl.NumberFormat('id-ID', {
        notation: 'compact',
        compactDisplay: 'short',
        maximumFractionDigits: 1,
    }).format(value ?? 0);

/**
 * MarketingPerformanceSection — Performa per Marketing
 *
 * Bar chart horizontal revenue per marketing + tabel sortable dengan
 * pagination. Kolom fee_to_revenue_ratio menunjukkan persentase fee
 * relatif terhadap revenue (semakin kecil = semakin efisien).
 *
 * @param {{ filter: { startDate: string, endDate: string, location: string|null } }} props
 */
function MarketingPerformanceSection({ filter }) {
    const { startDate, endDate, location } = filter ?? {};
    const periodLabel = formatPeriodLabel(startDate, endDate);

    const { data, totalCount, totalPages, currentPage, isLoading, error, setPage, fetchAll } = useRpcQuery({
        rpcName: 'get_marketing_performance',
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
      filename: `performa-marketing_${startDate}_${endDate}`,
      columns: [
        { key: 'marketing_name', label: 'Marketing' },
        { key: 'total_transactions', label: 'Jumlah Transaksi' },
        { key: 'revenue_brought', label: 'Revenue Dibawa' },
        { key: 'total_fee', label: 'Total Fee' },
        { key: 'fee_to_revenue_ratio', label: 'Fee/Revenue (%)' },
      ],
    });

    if (isLoading) return <SectionSkeleton />;
    if (error) return <SectionError name="Performa Marketing" message={error} />;
    if (!data.length) return <SectionEmpty message="Tidak ada data untuk periode ini" />;

    const chartData = [...data].sort(
        (a, b) => Number(b.revenue_brought || 0) - Number(a.revenue_brought || 0)
    );

    return (
        <SectionCard
            title="Performa Marketing"
            periodLabel={periodLabel}
            subtitle="Revenue dibawa, fee yang harus dibayarkan, dan rasio fee/revenue."
            onExport={exportCsv}
            isExporting={isExporting}
    >
            <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 32)}>
                <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 4, right: 32, left: 8, bottom: 4 }}
                >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <YAxis
                        dataKey="marketing_name"
                        type="category"
                        width={140}
                        tick={{ fontSize: 12 }}
                    />
                    <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={compactRupiah} />
                    <Tooltip
                        formatter={(value) => [formatRupiah(value), 'Revenue Dibawa']}
                        labelFormatter={(label) => `Marketing: ${label}`}
                    />
                    <Bar dataKey="revenue_brought" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
            </ResponsiveContainer>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead>
                        <tr className="border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wide">
                            <SortableHeader
                                label="Marketing"
                                sortKey="marketing_name"
                                onSort={requestSort}
                                getSortIcon={getSortIcon}
                            />
                            <SortableHeader
                                label="Transaksi"
                                sortKey="total_transactions"
                                onSort={requestSort}
                                getSortIcon={getSortIcon}
                                align="right"
                            />
                            <SortableHeader
                                label="Revenue"
                                sortKey="revenue_brought"
                                onSort={requestSort}
                                getSortIcon={getSortIcon}
                                align="right"
                            />
                            <SortableHeader
                                label="Total Fee"
                                sortKey="total_fee"
                                onSort={requestSort}
                                getSortIcon={getSortIcon}
                                align="right"
                            />
                            <SortableHeader
                                label="Fee / Revenue"
                                sortKey="fee_to_revenue_ratio"
                                onSort={requestSort}
                                getSortIcon={getSortIcon}
                                align="right"
                            />
                        </tr>
                    </thead>
                    <tbody>
                        {sortedData.map((row, idx) => (
                            <tr
                                key={`${row.marketing_name}-${idx}`}
                                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                            >
                                <td className="py-2 pr-4 font-medium text-gray-800">{row.marketing_name}</td>
                                <td className="py-2 pr-4 text-right text-gray-800">
                                    {row.total_transactions}
                                </td>
                                <td className="py-2 pr-4 text-right text-gray-800">
                                    {formatRupiah(row.revenue_brought)}
                                </td>
                                <td className="py-2 pr-4 text-right text-gray-800">
                                    {formatRupiah(row.total_fee)}
                                </td>
                                <td className="py-2 text-right text-gray-800">
                                    {formatPersen(row.fee_to_revenue_ratio)}
                                </td>
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

export default MarketingPerformanceSection;
