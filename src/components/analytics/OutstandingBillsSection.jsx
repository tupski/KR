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
import { formatRupiah } from '@/utils/analyticsFormatters';

const compactRupiah = (value) =>
    new Intl.NumberFormat('id-ID', {
        notation: 'compact',
        compactDisplay: 'short',
        maximumFractionDigits: 1,
    }).format(value ?? 0);

const BUCKET_COLORS = {
    'Belum Jatuh Tempo': '#6b7280', // gray
    '0–30 hari': '#10b981', // emerald
    '31–60 hari': '#f59e0b', // amber
    '61–90 hari': '#f97316', // orange
    '>90 hari': '#ef4444', // red
};

/**
 * OutstandingBillsSection — Tagihan Outstanding (Aging)
 *
 * Tagihan dengan status='unpaid' dipecah per aging bucket berdasarkan selisih
 * hari dari due_date. Tidak terpengaruh filter tanggal global karena ini snapshot
 * "kondisi sekarang" (BUT lokasi filter tetap dihormati).
 *
 * @param {{ filter: { startDate: string, endDate: string, location: string|null } }} props
 */
function OutstandingBillsSection({ filter }) {
    const { location } = filter ?? {};

    const { data, isLoading, error, fetchAll } = useRpcQuery({
        rpcName: 'get_outstanding_bills_summary',
        params: {
            p_location: location ?? null,
        },
        paginated: false,
    });

    const { sortedData, requestSort, getSortIcon } = useSortableData(data);

    const { exportCsv, isExporting } = useSectionCsvExport({
        fetchAll,
        filename: 'tagihan-outstanding',
        columns: [
            { key: 'aging_bucket', label: 'Aging' },
            { key: 'bill_count', label: 'Jumlah Tagihan' },
            { key: 'total_amount', label: 'Total Amount' },
        ],
    });

    if (isLoading) return <SectionSkeleton />;
    if (error) return <SectionError name="Tagihan Outstanding" message={error} />;
    if (!data.length) {
        return (
            <SectionCard
                title="Tagihan Outstanding"
                periodLabel="snapshot saat ini"
                subtitle="Tagihan unpaid dipecah per aging bucket."
            >
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                    Tidak ada tagihan outstanding. Bagus.
                </div>
            </SectionCard>
        );
    }

    const totalAmount = data.reduce((s, d) => s + Number(d.total_amount || 0), 0);
    const totalBills = data.reduce((s, d) => s + Number(d.bill_count || 0), 0);
    // Bagian "lewat jatuh tempo" = semua bucket selain "Belum Jatuh Tempo"
    const overdueAmount = data
        .filter((d) => d.aging_bucket !== 'Belum Jatuh Tempo')
        .reduce((s, d) => s + Number(d.total_amount || 0), 0);

    return (
        <SectionCard
            title="Tagihan Outstanding"
            periodLabel="snapshot saat ini"
            subtitle="Tagihan unpaid dipecah per aging bucket. Filter lokasi tetap diterapkan."
            onExport={exportCsv}
            isExporting={isExporting}
        >
            {/* Ringkasan total */}
            <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2">
                    <p className="text-[11px] text-blue-700 font-semibold uppercase tracking-wide">
                        Total Tagihan
                    </p>
                    <p className="text-sm font-bold text-blue-900">{totalBills}</p>
                </div>
                <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
                    <p className="text-[11px] text-amber-700 font-semibold uppercase tracking-wide">
                        Total Nominal
                    </p>
                    <p className="text-sm font-bold text-amber-900">
                        {formatRupiah(totalAmount)}
                    </p>
                </div>
                <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2">
                    <p className="text-[11px] text-red-700 font-semibold uppercase tracking-wide">
                        Lewat Jatuh Tempo
                    </p>
                    <p className="text-sm font-bold text-red-900">
                        {formatRupiah(overdueAmount)}
                    </p>
                </div>
            </div>

            {/* Bar chart */}
            <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data} margin={{ top: 4, right: 24, left: 8, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                        dataKey="aging_bucket"
                        tick={{ fontSize: 11 }}
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                        height={50}
                    />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={compactRupiah} />
                    <Tooltip
                        formatter={(value) => [formatRupiah(value), 'Total Amount']}
                        labelFormatter={(label) => `Aging: ${label}`}
                    />
                    <Bar dataKey="total_amount" radius={[4, 4, 0, 0]}>
                        {data.map((row, idx) => (
                            <Cell
                                key={`cell-${idx}`}
                                fill={BUCKET_COLORS[row.aging_bucket] ?? '#3b82f6'}
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
                                label="Aging"
                                sortKey="bucket_order"
                                onSort={requestSort}
                                getSortIcon={getSortIcon}
                            />
                            <SortableHeader
                                label="Jumlah Tagihan"
                                sortKey="bill_count"
                                onSort={requestSort}
                                getSortIcon={getSortIcon}
                                align="right"
                            />
                            <SortableHeader
                                label="Total Amount"
                                sortKey="total_amount"
                                onSort={requestSort}
                                getSortIcon={getSortIcon}
                                align="right"
                            />
                        </tr>
                    </thead>
                    <tbody>
                        {sortedData.map((row, idx) => (
                            <tr
                                key={`${row.aging_bucket}-${idx}`}
                                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                            >
                                <td className="py-2 pr-4 font-medium text-gray-800">{row.aging_bucket}</td>
                                <td className="py-2 pr-4 text-right text-gray-800">{row.bill_count}</td>
                                <td className="py-2 text-right text-gray-800">
                                    {formatRupiah(row.total_amount)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </SectionCard>
    );
}

export default OutstandingBillsSection;
