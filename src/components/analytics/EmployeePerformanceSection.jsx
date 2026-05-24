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
import PaginationControls from '@/components/PaginationControls';

/**
 * EmployeePerformanceSection — Performa per Karyawan (input_by)
 *
 * Bar chart horizontal jumlah transaksi per karyawan + tabel sortable
 * dengan pagination server-side.
 *
 * @param {{ filter: { startDate: string, endDate: string, location: string|null } }} props
 */
function EmployeePerformanceSection({ filter }) {
    const { startDate, endDate, location } = filter ?? {};
    const periodLabel = formatPeriodLabel(startDate, endDate);

    const { data, totalCount, totalPages, currentPage, isLoading, error, setPage, fetchAll } = useRpcQuery({
        rpcName: 'get_performance_by_employee',
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
      filename: `performa-karyawan_${startDate}_${endDate}`,
      columns: [
        { key: 'employee_name', label: 'Karyawan' },
        { key: 'total_transactions', label: 'Jumlah Transaksi' },
        { key: 'total_revenue', label: 'Total Pendapatan' },
        { key: 'avg_revenue_per_transaction', label: 'Rata-rata per Transaksi' },
      ],
    });

    if (isLoading) return <SectionSkeleton />;
    if (error) return <SectionError name="Performa Karyawan" message={error} />;
    if (!data.length) return <SectionEmpty message="Tidak ada data untuk periode ini" />;

    const chartData = [...data].sort(
        (a, b) => Number(b.total_transactions || 0) - Number(a.total_transactions || 0)
    );

    return (
        <SectionCard
            title="Performa Karyawan"
            periodLabel={periodLabel}
            subtitle="Jumlah transaksi dan revenue per input_by. 10 karyawan per halaman."
            onExport={exportCsv}
            isExporting={isExporting}
    >
            <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 32)}>
                <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <YAxis
                        dataKey="employee_name"
                        type="category"
                        width={140}
                        tick={{ fontSize: 12 }}
                    />
                    <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip
                        formatter={(value) => [value, 'Jumlah Transaksi']}
                        labelFormatter={(label) => `Karyawan: ${label}`}
                    />
                    <Bar dataKey="total_transactions" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
            </ResponsiveContainer>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead>
                        <tr className="border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wide">
                            <SortableHeader
                                label="Karyawan"
                                sortKey="employee_name"
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
                        </tr>
                    </thead>
                    <tbody>
                        {sortedData.map((row, idx) => (
                            <tr
                                key={`${row.employee_name}-${idx}`}
                                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                            >
                                <td className="py-2 pr-4 font-medium text-gray-800">{row.employee_name}</td>
                                <td className="py-2 pr-4 text-right text-gray-800">
                                    {row.total_transactions}
                                </td>
                                <td className="py-2 pr-4 text-right text-gray-800">
                                    {formatRupiah(row.total_revenue)}
                                </td>
                                <td className="py-2 text-right text-gray-800">
                                    {formatRupiah(row.avg_revenue_per_transaction)}
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

export default EmployeePerformanceSection;
