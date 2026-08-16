import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, TrendingUp, Users } from 'lucide-react';
import { transactionsApi } from '@/api/transactions.api';

const ITEMS_PER_PAGE = 10;

const ID_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function toMonthKey(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return `${ID_MONTHS[m - 1] || m} ${y}`;
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const RankingMarketing = () => {
  const [rows, setRows] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const loadRankings = async () => {
    try {
      // Fetch all transactions with marketing data
      // Note: In production, consider adding a dedicated API endpoint for marketing rankings
      const data = await transactionsApi.list({ limit: 1000 });
      setRows(data || []);
    } catch (error) {
      console.error('Error fetching rankings:', error);
    }
  };

  useEffect(() => {
    loadRankings();
    const interval = setInterval(loadRankings, 5000);
    return () => clearInterval(interval);
  }, []);

  const monthKeys = useMemo(() => {
    const set = new Set();
    (rows || []).forEach((t) => {
      const k = toMonthKey(t.checkin_at || t.created_at);
      if (k) set.add(k);
    });
    return ['all', ...[...set].sort().reverse()];
  }, [rows]);

  useEffect(() => {
    if (monthKeys.length === 0) {
      setSelectedMonth(null);
      return;
    }
    setSelectedMonth((prev) => (prev && monthKeys.includes(prev) ? prev : 'all'));
  }, [monthKeys]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedMonth]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage]);

  const filteredRows = useMemo(() => {
    if (!selectedMonth) return [];
    if (selectedMonth === 'all') return rows || [];
    return (rows || []).filter((t) => toMonthKey(t.checkin_at || t.created_at) === selectedMonth);
  }, [rows, selectedMonth]);

  const rankings = useMemo(() => {
    const marketingStats = filteredRows.reduce((acc, t) => {
      const name = t.marketing_name;
      if (!name) return acc;
      if (!acc[name]) {
        acc[name] = { nama: name, jumlahTransaksi: 0, totalPemasukan: 0 };
      }
      acc[name].jumlahTransaksi += 1;
      acc[name].totalPemasukan += (t.cash_amount || 0) + (t.transfer_amount || 0);
      return acc;
    }, {});

    return Object.values(marketingStats).sort((a, b) => b.jumlahTransaksi - a.jumlahTransaksi);
  }, [filteredRows]);

  const formatRupiah = (angka) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka);

  const statsPeriodLabel =
    selectedMonth === 'all'
      ? 'Keseluruhan'
      : selectedMonth && selectedMonth === currentMonthKey()
        ? 'Bulan ini'
        : formatMonthLabel(selectedMonth || '');

  const totalMarketingAktif = rankings.length;
  const totalCs = rankings.reduce((sum, r) => sum + r.jumlahTransaksi, 0);

  const totalPages = Math.max(1, Math.ceil(rankings.length / ITEMS_PER_PAGE));

  useEffect(() => {
    setCurrentPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const paginatedRankings = rankings.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="min-h-screen bg-slate-100 p-4 pt-5 pb-28">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-slate-800">Ranking Marketing</h1>
          {monthKeys.length > 0 && (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-slate-500">Filter bulan</label>
              <select
                value={selectedMonth || ''}
                onChange={(e) => setSelectedMonth(e.target.value || null)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-400"
              >
                {monthKeys.map((mk) => (
                  <option key={mk} value={mk}>
                    {mk === 'all' ? 'Keseluruhan' : formatMonthLabel(mk)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Users className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs text-slate-500">Marketing Aktif ({statsPeriodLabel})</p>
                <p className="text-lg font-semibold tabular-nums text-slate-900">{totalMarketingAktif}</p>
              </div>
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div className="min-w-0 text-right">
                <p className="truncate text-xs text-slate-500">Total CS ({statsPeriodLabel})</p>
                <p className="text-lg font-semibold tabular-nums text-slate-900">{totalCs}</p>
              </div>
            </div>
          </div>
        </div>

        {rankings.length > 0 ? (
          <div className="space-y-2">
            {paginatedRankings.map((marketing, index) => {
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
          <p className="py-8 text-center text-sm text-slate-500">
            {monthKeys.length === 0 ? 'Belum ada data transaksi.' : 'Tidak ada transaksi di bulan ini.'}
          </p>
        )}

        {rankings.length > ITEMS_PER_PAGE && (
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage <= 1}
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
            >
              <ChevronLeft className="mr-0.5 h-4 w-4" /> Sebelumnya
            </button>
            <p className="text-xs font-medium text-slate-600">
              Halaman {currentPage} / {totalPages}
            </p>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage >= totalPages}
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
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
