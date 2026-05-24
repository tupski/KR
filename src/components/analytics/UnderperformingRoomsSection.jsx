import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useRpcQuery } from '@/hooks/useRpcQuery';
import { useSortableData } from '@/hooks/useSortableData';
import { useSectionCsvExport } from '@/hooks/useSectionCsvExport';
import { SectionCard, SectionSkeleton, SectionError, SectionEmpty, SortableHeader } from './shared';
import { formatRupiah, formatPersen } from '@/utils/analyticsFormatters';
import { formatPeriodLabel } from '@/utils/analyticsPeriodLabel';
import PaginationControls from '@/components/PaginationControls';

const THRESHOLD_OPTIONS = [10, 20, 30, 50];

/**
 * UnderperformingRoomsSection — Kamar dengan Occupancy Rendah
 *
 * Tabel sortable + pagination kamar dengan occupancy_rate < threshold.
 * Threshold bisa dipilih (default 30%). Berguna untuk identifikasi kamar
 * yang perlu maintenance, harga turun, atau dilepas.
 *
 * @param {{ filter: { startDate: string, endDate: string, location: string|null } }} props
 */
function UnderperformingRoomsSection({ filter }) {
    const { startDate, endDate, location } = filter ?? {};
    const periodLabel = formatPeriodLabel(startDate, endDate);

    const [threshold, setThreshold] = useState(30);

    const { data, totalCount, totalPages, currentPage, isLoading, error, setPage, fetchAll } = useRpcQuery({
        rpcName: 'get_underperforming_rooms',
        params: {
            p_start_date: startDate,
            p_end_date: endDate,
            p_location: location ?? null,
            p_threshold_pct: threshold,
        },
        pageSize: 10,
        paginated: true,
    });

    const { sortedData, requestSort, getSortIcon } = useSortableData(data);

    const { exportCsv, isExporting } = useSectionCsvExport({
      fetchAll,
      filename: `kamar-underperforming_${startDate}_${endDate}`,
      columns: [
        { key: 'room_number', label: 'Kamar' },
        { key: 'apartment_location', label: 'Lokasi' },
        { key: 'total_transactions', label: 'Transaksi' },
        { key: 'total_revenue', label: 'Pendapatan' },
        { key: 'occupancy_rate', label: 'Occupancy (%)' },
      ],
    });

    return (
        <SectionCard
            title="Kamar Underperforming"
            periodLabel={periodLabel}
            subtitle={`Kamar dengan occupancy < ${threshold}%. Cocok untuk evaluasi maintenance / pricing.`}
            onExport={exportCsv}
            isExporting={isExporting}
    >
            {/* Threshold selector */}
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-600 font-semibold">Threshold:</span>
                {THRESHOLD_OPTIONS.map((opt) => (
                    <button
                        key={opt}
                        type="button"
                        onClick={() => setThreshold(opt)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${threshold === opt
                                ? 'bg-red-500 text-white border-red-500'
                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                            }`}
                    >
                        &lt; {opt}%
                    </button>
                ))}
            </div>

            {isLoading ? (
                <SectionSkeleton />
            ) : error ? (
                <SectionError name="Kamar Underperforming" message={error} />
            ) : !data.length ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span>
                        Tidak ada kamar dengan occupancy &lt; {threshold}% di periode ini. Bagus.
                    </span>
                </div>
            ) : (
                <>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead>
                                <tr className="border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wide">
                                    <SortableHeader
                                        label="Kamar"
                                        sortKey="room_number"
                                        onSort={requestSort}
                                        getSortIcon={getSortIcon}
                                    />
                                    <SortableHeader
                                        label="Lokasi"
                                        sortKey="apartment_location"
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
                                        label="Pendapatan"
                                        sortKey="total_revenue"
                                        onSort={requestSort}
                                        getSortIcon={getSortIcon}
                                        align="right"
                                    />
                                    <SortableHeader
                                        label="Occupancy"
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
                                        key={`${row.apartment_location}-${row.room_number}-${idx}`}
                                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                                    >
                                        <td className="py-2 pr-4 font-medium text-gray-800">
                                            {row.room_number}
                                        </td>
                                        <td className="py-2 pr-4 text-gray-600">{row.apartment_location}</td>
                                        <td className="py-2 pr-4 text-right text-gray-800">
                                            {row.total_transactions}
                                        </td>
                                        <td className="py-2 pr-4 text-right text-gray-800">
                                            {formatRupiah(row.total_revenue)}
                                        </td>
                                        <td className="py-2 text-right font-semibold text-red-700">
                                            {formatPersen(row.occupancy_rate)}
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
                </>
            )}
        </SectionCard>
    );
}

export default UnderperformingRoomsSection;
