import React from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts';
import { useRpcQuery } from '@/hooks/useRpcQuery';
import { useSortableData } from '@/hooks/useSortableData';
import { useSectionCsvExport } from '@/hooks/useSectionCsvExport';
import { SectionCard, SectionSkeleton, SectionError, SectionEmpty, SortableHeader } from './shared';
import { formatRupiah, formatPersen } from '@/utils/analyticsFormatters';
import { formatPeriodLabel } from '@/utils/analyticsPeriodLabel';

const CASH_COLOR = '#f59e0b'; // amber-500
const TRANSFER_COLOR = '#3b82f6'; // blue-500

const compactRupiah = (value) =>
    new Intl.NumberFormat('id-ID', {
        notation: 'compact',
        compactDisplay: 'short',
        maximumFractionDigits: 1,
    }).format(value ?? 0);

/**
 * PaymentMethodSection — Laporan Cash vs Transfer per Lokasi
 *
 * Stacked bar chart cash + transfer per lokasi + tabel sortable. Berguna
 * untuk planning kas dan rekonsiliasi bank.
 *
 * @param {{ filter: { startDate: string, endDate: string, location: string|null } }} props
 */
function PaymentMethodSection({ filter }) {
    const { startDate, endDate, location } = filter ?? {};
    const periodLabel = formatPeriodLabel(startDate, endDate);

    const { data, isLoading, error, fetchAll } = useRpcQuery({
        rpcName: 'get_payment_method_summary',
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
      filename: `cash-vs-transfer_${startDate}_${endDate}`,
      columns: [
        { key: 'apartment_location', label: 'Lokasi' },
        { key: 'total_cash', label: 'Cash' },
        { key: 'total_transfer', label: 'Transfer' },
        { key: 'total_revenue', label: 'Total' },
        { key: 'cash_percentage', label: '% Cash' },
        { key: 'transfer_percentage', label: '% Transfer' },
      ],
    });

    if (isLoading) return <SectionSkeleton />;
    if (error) return <SectionError name="Cash vs Transfer" message={error} />;
    if (!data.length) return <SectionEmpty message="Tidak ada data untuk periode ini" />;

    const chartData = [...data].sort(
        (a, b) => Number(b.total_revenue || 0) - Number(a.total_revenue || 0)
    );

    const totalCash = data.reduce((s, d) => s + Number(d.total_cash || 0), 0);
    const totalTransfer = data.reduce((s, d) => s + Number(d.total_transfer || 0), 0);
    const grand = totalCash + totalTransfer;
    const cashPct = grand > 0 ? ((totalCash / grand) * 100).toFixed(2) : null;
    const trfPct = grand > 0 ? ((totalTransfer / grand) * 100).toFixed(2) : null;

    return (
        <SectionCard
            title="Cash vs Transfer"
            periodLabel={periodLabel}
            subtitle="Komposisi pembayaran tunai vs transfer per lokasi."
            onExport={exportCsv}
            isExporting={isExporting}
    >
            {/* Ringkasan total */}
            <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
                    <p className="text-[11px] text-amber-700 font-semibold uppercase tracking-wide">
                        Cash
                    </p>
                    <p className="text-sm font-bold text-amber-900">
                        {formatRupiah(totalCash)}{' '}
                        <span className="text-[11px] font-normal">
                            ({cashPct != null ? `${cashPct}%` : '-'})
                        </span>
                    </p>
                </div>
                <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2">
                    <p className="text-[11px] text-blue-700 font-semibold uppercase tracking-wide">
                        Transfer
                    </p>
                    <p className="text-sm font-bold text-blue-900">
                        {formatRupiah(totalTransfer)}{' '}
                        <span className="text-[11px] font-normal">
                            ({trfPct != null ? `${trfPct}%` : '-'})
                        </span>
                    </p>
                </div>
            </div>

            {/* Stacked bar chart vertikal */}
            <ResponsiveContainer width="100%" height={300}>
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
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={compactRupiah} />
                    <Tooltip
                        formatter={(value, name) => {
                            const label = name === 'total_cash' ? 'Cash' : 'Transfer';
                            return [formatRupiah(value), label];
                        }}
                        labelFormatter={(label) => `Lokasi: ${label}`}
                    />
                    <Legend
                        formatter={(value) => (value === 'total_cash' ? 'Cash' : 'Transfer')}
                    />
                    <Bar dataKey="total_cash" stackId="a" fill={CASH_COLOR} />
                    <Bar dataKey="total_transfer" stackId="a" fill={TRANSFER_COLOR} radius={[4, 4, 0, 0]} />
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
                                label="Cash"
                                sortKey="total_cash"
                                onSort={requestSort}
                                getSortIcon={getSortIcon}
                                align="right"
                            />
                            <SortableHeader
                                label="Transfer"
                                sortKey="total_transfer"
                                onSort={requestSort}
                                getSortIcon={getSortIcon}
                                align="right"
                            />
                            <SortableHeader
                                label="Total"
                                sortKey="total_revenue"
                                onSort={requestSort}
                                getSortIcon={getSortIcon}
                                align="right"
                            />
                            <SortableHeader
                                label="% Cash"
                                sortKey="cash_percentage"
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
                                    {formatRupiah(row.total_cash)}
                                </td>
                                <td className="py-2 pr-4 text-right text-gray-800">
                                    {formatRupiah(row.total_transfer)}
                                </td>
                                <td className="py-2 pr-4 text-right text-gray-800">
                                    {formatRupiah(row.total_revenue)}
                                </td>
                                <td className="py-2 text-right text-gray-800">
                                    {formatPersen(row.cash_percentage)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </SectionCard>
    );
}

export default PaymentMethodSection;
