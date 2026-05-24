import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
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
import { SectionCard, SectionSkeleton, SectionError, SectionEmpty } from './shared';
import { formatRupiah } from '@/utils/analyticsFormatters';
import { formatPeriodLabel } from '@/utils/analyticsPeriodLabel';

const compactRupiah = (value) =>
    new Intl.NumberFormat('id-ID', {
        notation: 'compact',
        compactDisplay: 'short',
        maximumFractionDigits: 1,
    }).format(value ?? 0);

function ChangeBadge({ value, className = '' }) {
    if (value == null) {
        return (
            <span className={`inline-flex items-center gap-0.5 text-xs text-gray-400 ${className}`}>
                <Minus className="w-3 h-3" />
                <span>data tahun lalu kosong</span>
            </span>
        );
    }
    const num = Number(value);
    if (Number.isNaN(num)) return null;

    const isPositive = num > 0;
    const isZero = num === 0;
    const Icon = isZero ? Minus : isPositive ? TrendingUp : TrendingDown;
    const color = isZero
        ? 'text-gray-500'
        : isPositive
            ? 'text-emerald-600'
            : 'text-red-600';
    const sign = isPositive ? '+' : '';

    return (
        <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${color} ${className}`}>
            <Icon className="w-3 h-3" />
            <span>
                {sign}
                {num.toFixed(2)}%
            </span>
        </span>
    );
}

/**
 * YoYComparisonSection — Perbandingan Year-over-Year
 *
 * Bandingkan revenue & transaction_count periode terpilih dengan periode
 * yang sama persis 1 tahun sebelumnya. Untuk data baru tanpa riwayat tahun
 * lalu, change_pct = null → tampilkan badge "data tahun lalu kosong".
 *
 * @param {{ filter: { startDate: string, endDate: string, location: string|null } }} props
 */
function YoYComparisonSection({ filter }) {
    const { startDate, endDate, location } = filter ?? {};
    const periodLabel = formatPeriodLabel(startDate, endDate);

    const { data, isLoading, error } = useRpcQuery({
        rpcName: 'get_revenue_yoy_comparison',
        params: {
            p_start_date: startDate,
            p_end_date: endDate,
            p_location: location ?? null,
        },
        paginated: false,
    });

    if (isLoading) return <SectionSkeleton />;
    if (error) return <SectionError name="Perbandingan YoY" message={error} />;
    if (!data.length) return <SectionEmpty message="Tidak ada data untuk periode ini" />;

    const k = data[0];

    // Data chart: 2 grup (Pendapatan, Transaksi) × 2 series (Tahun ini, Tahun lalu).
    const chartData = [
        {
            label: 'Pendapatan',
            thisYear: Number(k.current_revenue) || 0,
            lastYear: Number(k.previous_revenue) || 0,
        },
        {
            label: 'Transaksi',
            thisYear: Number(k.current_transactions) || 0,
            lastYear: Number(k.previous_transactions) || 0,
        },
    ];

    return (
        <SectionCard
            title="Perbandingan Year-over-Year"
            periodLabel={periodLabel}
            subtitle={`vs ${k.previous_period_label}`}
        >
            {/* KPI cards */}
            <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2">
                    <p className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wide">
                        Pendapatan
                    </p>
                    <p className="text-sm font-bold text-emerald-900">
                        {formatRupiah(k.current_revenue)}
                    </p>
                    <p className="text-[10px] text-emerald-700 mt-0.5">
                        Tahun lalu: {formatRupiah(k.previous_revenue)}
                    </p>
                    <ChangeBadge value={k.revenue_change_pct} className="mt-0.5" />
                </div>
                <div className="rounded-xl bg-violet-50 border border-violet-100 px-3 py-2">
                    <p className="text-[10px] text-violet-700 font-semibold uppercase tracking-wide">
                        Transaksi
                    </p>
                    <p className="text-sm font-bold text-violet-900">
                        {k.current_transactions}
                    </p>
                    <p className="text-[10px] text-violet-700 mt-0.5">
                        Tahun lalu: {k.previous_transactions}
                    </p>
                    <ChangeBadge value={k.transactions_change_pct} className="mt-0.5" />
                </div>
            </div>

            {/* Bar chart side-by-side */}
            <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={compactRupiah} />
                    <Tooltip
                        formatter={(value, name) => {
                            const label = name === 'thisYear' ? 'Periode ini' : 'Tahun lalu';
                            return [
                                typeof value === 'number' && value >= 1000
                                    ? formatRupiah(value)
                                    : value,
                                label,
                            ];
                        }}
                    />
                    <Legend
                        formatter={(v) => (v === 'thisYear' ? 'Periode ini' : 'Tahun lalu')}
                    />
                    <Bar dataKey="thisYear" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="lastYear" fill="#9ca3af" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </SectionCard>
    );
}

export default YoYComparisonSection;
