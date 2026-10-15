import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, TrendingUp, Users } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';

const ITEMS_PER_PAGE = 10;
const ID_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function getMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthBounds(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = new Date(year, month, 1);
  const endDate = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
  return { startDate, endDate };
}

function getMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return `${ID_MONTHS[month - 1]} ${year}`;
}

const RankingMarketing = () => {
  const currentMonth = useMemo(() => getMonthKey(), []);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [rankings, setRankings] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalCs, setTotalCs] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadRankings = async () => {
      setIsLoading(true);
      setError(null);
      setRankings([]);
      setTotalCount(0);
      setTotalCs(0);

      const { startDate, endDate } = getMonthBounds(selectedMonth);
      const { data, error: queryError } = await supabase.rpc('get_marketing_ranking', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_limit: ITEMS_PER_PAGE,
        p_offset: (currentPage - 1) * ITEMS_PER_PAGE,
      });

      if (cancelled) return;
      if (queryError) {
        console.error('Error fetching rankings:', queryError);
        setError('Ranking marketing gagal dimuat. Coba pilih bulan lagi.');
        setIsLoading(false);
        return;
      }

      const nextRankings = (data || []).map((row) => ({
        nama: row.marketing_name,
        jumlahTransaksi: Number(row.total_transactions || 0),
        totalPemasukan: Number(row.total_revenue || 0),
      }));
      setRankings(nextRankings);
      setTotalCount(Number(data?.[0]?.total_count || 0));
      setTotalCs(Number(data?.[0]?.total_cs || 0));
      setIsLoading(false);
    };

    loadRankings();
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, currentPage]);

  const totalMarketingAktif = totalCount;
  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
  const statsPeriodLabel = getMonthLabel(selectedMonth);

  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(1, page), totalPages));
  }, [totalPages]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage]);

  const formatRupiah = (amount) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);

  const handleMonthChange = (event) => {
    setSelectedMonth(event.target.value || currentMonth);
    setCurrentPage(1);
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 pt-5 pb-28">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-slate-800">Ranking Marketing</h1>
          <p className="mt-1 text-xs text-slate-500">Bandingkan hasil per bulan</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label htmlFor="ranking-marketing-month" className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
            <CalendarDays className="h-4 w-4 text-slate-500" />
            Periode ranking
          </label>
          <input
            id="ranking-marketing-month"
            type="month"
            value={selectedMonth}
            max={currentMonth}
            onChange={handleMonthChange}
            className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
          />
          <p className="mt-2 text-xs text-slate-500">Bulan lain hanya dibaca setelah dipilih.</p>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Users className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs text-slate-500">Marketing Aktif ({statsPeriodLabel})</p>
                <p className="text-lg font-semibold tabular-nums text-slate-900">{isLoading ? '...' : error ? '—' : totalMarketingAktif}</p>
              </div>
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div className="min-w-0 text-right">
                <p className="truncate text-xs text-slate-500">Total CS ({statsPeriodLabel})</p>
                <p className="text-lg font-semibold tabular-nums text-slate-900">{isLoading ? '...' : error ? '—' : totalCs}</p>
              </div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500" role="status" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin" />
            Memuat ranking {statsPeriodLabel}...
          </div>
        ) : error ? null : rankings.length > 0 ? (
          <div className="space-y-2">
            {rankings.map((marketing, index) => {
              const absoluteIndex = (currentPage - 1) * ITEMS_PER_PAGE + index;
              const accent = absoluteIndex % 2 === 0 ? 'border-l-blue-600' : 'border-l-emerald-600';
              const bg = absoluteIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50';
              return (
                <motion.div
                  key={`${marketing.nama}-${absoluteIndex}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className={`rounded-lg border border-slate-200 ${bg} border-l-4 ${accent} p-3 shadow-sm`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <span className="text-xs font-medium text-slate-400">#{absoluteIndex + 1}</span>
                    <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{marketing.nama}</h3>
                  </div>
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="text-slate-500">CS</span>
                    <span className="font-medium tabular-nums text-slate-800">{marketing.jumlahTransaksi}</span>
                  </div>
                  <div className="mt-1 flex justify-between gap-2 text-xs">
                    <span className="text-slate-500">Pemasukan</span>
                    <span className="font-medium tabular-nums text-slate-800">{formatRupiah(marketing.totalPemasukan)}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
            Tidak ada transaksi di {statsPeriodLabel}.
          </p>
        )}

        {totalCount > ITEMS_PER_PAGE && (
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
              disabled={currentPage <= 1}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="mr-0.5 h-4 w-4" /> Sebelumnya
            </button>
            <p className="text-xs font-medium text-slate-600">Halaman {currentPage} / {totalPages}</p>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
              disabled={currentPage >= totalPages}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Berikutnya <ChevronRight className="ml-0.5 h-4 w-4" />
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default RankingMarketing;
