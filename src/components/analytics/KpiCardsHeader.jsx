import React from 'react';
import { TrendingUp, TrendingDown, Minus, RefreshCw, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { useRpcQuery } from '@/hooks/useRpcQuery';
import { formatRupiah, formatPersen } from '@/utils/analyticsFormatters';
import { formatPeriodLabel } from '@/utils/analyticsPeriodLabel';

/**
 * Tampilkan delta % dengan ikon panah dan warna:
 *   - positif        : hijau + panah ↑
 *   - negatif        : merah + panah ↓
 *   - 0 / null       : abu-abu + ikon –
 *
 * Khusus untuk KPI "Pengeluaran", invertColor=true → naik = warna merah
 * (karena pengeluaran naik adalah hal buruk).
 */
function DeltaBadge({ value, invertColor = false }) {
    if (value == null) {
        return (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-400">
                <Minus className="w-3 h-3" />
                <span>–</span>
            </span>
        );
    }
    const num = Number(value);
    const isPositive = num > 0;
    const isNegative = num < 0;
    const isZero = num === 0;

    let color = 'text-gray-500';
    if (!isZero) {
        if (invertColor) {
            color = isPositive ? 'text-red-600' : 'text-emerald-600';
        } else {
            color = isPositive ? 'text-emerald-600' : 'text-red-600';
        }
    }

    const Icon = isZero ? Minus : isPositive ? TrendingUp : TrendingDown;
    const sign = isPositive ? '+' : '';
    return (
        <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${color}`}>
            <Icon className="w-3 h-3" />
            <span>{sign}{num.toFixed(2)}%</span>
        </span>
    );
}

/**
 * Satu kartu KPI.
 */
function KpiCard({ label, value, delta, invertDeltaColor = false, accent = 'blue' }) {
    const accentBg = {
        blue: 'bg-blue-50 border-blue-100',
        emerald: 'bg-emerald-50 border-emerald-100',
        red: 'bg-red-50 border-red-100',
        amber: 'bg-amber-50 border-amber-100',
        violet: 'bg-violet-50 border-violet-100',
        indigo: 'bg-indigo-50 border-indigo-100',
    }[accent] ?? 'bg-blue-50 border-blue-100';
    const accentText = {
        blue: 'text-blue-900',
        emerald: 'text-emerald-900',
        red: 'text-red-900',
        amber: 'text-amber-900',
        violet: 'text-violet-900',
        indigo: 'text-indigo-900',
    }[accent] ?? 'text-blue-900';
    const accentLabel = {
        blue: 'text-blue-700',
        emerald: 'text-emerald-700',
        red: 'text-red-700',
        amber: 'text-amber-700',
        violet: 'text-violet-700',
        indigo: 'text-indigo-700',
    }[accent] ?? 'text-blue-700';

    return (
        <div className={`rounded-xl border px-3 py-2 ${accentBg}`}>
            <p className={`text-[10px] font-semibold uppercase tracking-wide ${accentLabel}`}>
                {label}
            </p>
            <p className={`text-sm font-bold ${accentText} truncate`}>{value}</p>
            <div className="mt-0.5">
                <DeltaBadge value={delta} invertColor={invertDeltaColor} />
            </div>
        </div>
    );
}

/**
 * KpiCardsHeader — header KPI cards + tombol refresh + label "Data terakhir
 * diperbarui". Memanggil `get_dashboard_kpis` untuk dapat 6 angka utama plus
 * delta vs periode sebelumnya yang panjangnya sama.
 *
 * @param {object} props
 * @param {{ startDate: string, endDate: string, location: string|null }} props.filter
 * @param {() => void} props.onGlobalRefresh - Refresh seluruh dashboard
 */
function KpiCardsHeader({ filter, onGlobalRefresh }) {
    const { startDate, endDate, location } = filter ?? {};
    const periodLabel = formatPeriodLabel(startDate, endDate);

    const { data, isLoading, isRefetching, error, lastUpdated, refresh } = useRpcQuery({
        rpcName: 'get_dashboard_kpis',
        params: {
            p_start_date: startDate,
            p_end_date: endDate,
            p_location: location ?? null,
        },
        paginated: false,
    });

    const handleRefresh = () => {
        refresh();
        if (typeof onGlobalRefresh === 'function') onGlobalRefresh();
    };

    const k = data?.[0] ?? {};

    // Format relative timestamp (e.g. "12 menit lalu") — guard NaN.
    let relativeLabel = '–';
    if (lastUpdated) {
        try {
            relativeLabel = formatDistanceToNow(new Date(lastUpdated), {
                addSuffix: true,
                locale: idLocale,
            });
        } catch {
            relativeLabel = '–';
        }
    }

    return (
        <div className="glassmorphic-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="font-bold text-base text-gray-800">Ringkasan</h2>
                    <p className="text-xs text-gray-500">
                        Periode: <span className="font-semibold">{periodLabel}</span>
                        {k.previous_period_label
                            ? ` · vs ${k.previous_period_label}`
                            : ''}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                        <Clock className="w-3 h-3" />
                        {relativeLabel}
                    </span>
                    <button
                        type="button"
                        onClick={handleRefresh}
                        disabled={isLoading || isRefetching}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-gray-200 bg-white text-gray-700 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        aria-label="Refresh data"
                    >
                        <RefreshCw
                            className={`w-3 h-3 ${isLoading || isRefetching ? 'animate-spin' : ''}`}
                        />
                        Refresh
                    </button>
                </div>
            </div>

            {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    Gagal memuat KPI: {error}
                </div>
            ) : isLoading && !data.length ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <KpiCard
                        label="Pendapatan"
                        value={formatRupiah(k.total_revenue)}
                        delta={k.revenue_change_pct}
                        accent="emerald"
                    />
                    <KpiCard
                        label="Pengeluaran"
                        value={formatRupiah(k.total_expense)}
                        delta={k.expense_change_pct}
                        invertDeltaColor
                        accent="red"
                    />
                    <KpiCard
                        label="Net Profit"
                        value={formatRupiah(k.net_profit)}
                        delta={k.net_profit_change_pct}
                        accent={Number(k.net_profit) >= 0 ? 'blue' : 'red'}
                    />
                    <KpiCard
                        label="Transaksi"
                        value={String(k.total_transactions ?? 0)}
                        delta={k.transactions_change_pct}
                        accent="violet"
                    />
                    <KpiCard
                        label="Tamu Unik"
                        value={String(k.unique_customers ?? 0)}
                        delta={k.customers_change_pct}
                        accent="indigo"
                    />
                    <KpiCard
                        label="Avg Occupancy"
                        value={formatPersen(k.avg_occupancy_rate)}
                        delta={null}
                        accent="amber"
                    />
                </div>
            )}
        </div>
    );
}

export default KpiCardsHeader;
