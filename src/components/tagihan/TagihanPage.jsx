import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { TagihanBulananSection } from './TagihanBulananSection';
import { TagihanFeeSection } from './TagihanFeeSection';
import { PengeluaranSection } from '@/components/pengeluaran/PengeluaranSection';
import { PengeluaranUnitSection } from '@/components/pengeluaran/PengeluaranUnitSection';
import { TAGIHAN_TABS } from './tagihanTypes';

/**
 * Format an ISO date string as "dd/mm/yyyy HH:mm:ss WIB" in Asia/Jakarta timezone.
 *
 * @param {string} isoString - ISO date string
 * @returns {string} Formatted date-time with WIB suffix
 */
function formatLunasDateTimeWib(isoString) {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    const core = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(d);
    return `${core} WIB`;
  } catch {
    return '-';
  }
}

/**
 * TagihanPage — Parent orchestrator for the finance menu.
 *
 * Manages tab state, monthly summary, and real-time subscription.
 * Renders summary card, tab navigation, and active tab content.
 */
export function TagihanPage() {
  const [activeTab, setActiveTab] = useState('bulanan');
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );
  const [monthlySummary, setMonthlySummary] = useState({
    pemasukan: 0,
    pengeluaran: 0,
    laba: 0,
  });

  /**
   * Calculate monthly summary (pemasukan, pengeluaran, laba) for the selected month.
   */
  const calculateSummary = useCallback(async () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDateExclusive = new Date(year, month, 1);

    // Fetch income transactions for the month
    const { data: transactions } = await supabase
      .from('transactions')
      .select('cash_amount, transfer_amount')
      .gte('checkin_at', startDate.toISOString())
      .lt('checkin_at', endDateExclusive.toISOString());

    const pemasukan = (transactions || []).reduce(
      (sum, t) => sum + (t.cash_amount || 0) + (t.transfer_amount || 0),
      0
    );

    // Fetch expenses for the month
    const startStr = startDate.toISOString().slice(0, 10);
    const endStr = endDateExclusive.toISOString().slice(0, 10);

    const { data: expenses } = await supabase
      .from('pengeluaran')
      .select('jumlah')
      .gte('tanggal', startStr)
      .lt('tanggal', endStr);

    const pengeluaran = (expenses || []).reduce(
      (sum, e) => sum + (e.jumlah || 0),
      0
    );

    setMonthlySummary({ pemasukan, pengeluaran, laba: pemasukan - pengeluaran });
  }, [selectedMonth]);

  // Fetch summary on mount and when month changes
  useEffect(() => {
    calculateSummary();
  }, [calculateSummary]);

  // Real-time subscription for finance updates
  useEffect(() => {
    const realtimeChannel = supabase
      .channel('public:finance_updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        calculateSummary
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pengeluaran' },
        calculateSummary
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tagihan_bulanan' },
        calculateSummary
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tagihan_fee_lunas' },
        calculateSummary
      )
      .subscribe();

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [calculateSummary]);

  const formatRupiahInternal = (value) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(value || 0);

  const handleDataUpdate = () => {
    calculateSummary();
  };

  return (
    <div className="min-h-screen p-4 pt-6 pb-28">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-md space-y-5"
      >
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 px-6 py-3 text-white shadow-lg">
            <FileText className="h-6 w-6" />
            <h1 className="text-xl font-bold">Menu Finance</h1>
          </div>
        </div>

        {/* Monthly Summary Card */}
        <div className="glassmorphic-card space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-800">Ringkasan Bulanan</h2>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-lg border-2 border-gray-300 bg-white/50 px-2 py-1 text-sm text-gray-800"
            />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-green-100 p-2">
              <p className="text-xs text-green-800">Pemasukan</p>
              <p className="text-sm font-bold text-green-900">
                {formatRupiahInternal(monthlySummary.pemasukan)}
              </p>
            </div>
            <div className="rounded-lg bg-red-100 p-2">
              <p className="text-xs text-red-800">Pengeluaran</p>
              <p className="text-sm font-bold text-red-900">
                {formatRupiahInternal(monthlySummary.pengeluaran)}
              </p>
            </div>
            <div className="rounded-lg bg-blue-100 p-2">
              <p className="text-xs text-blue-800">Laba Bersih</p>
              <p className="text-sm font-bold text-blue-900">
                {formatRupiahInternal(monthlySummary.laba)}
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-4 gap-1 rounded-full bg-black/10 p-1">
          {TAGIHAN_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full py-2 px-2 text-xs font-semibold transition-all duration-300 ${
                activeTab === tab.id
                  ? tab.id === 'pengeluaranUnit'
                    ? 'bg-gradient-to-r from-orange-400 to-red-500 text-white shadow-lg'
                    : 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-lg'
                  : 'text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'bulanan' && (
              <TagihanBulananSection onDataUpdate={handleDataUpdate} />
            )}
            {activeTab === 'fee' && (
              <TagihanFeeSection onDataUpdate={handleDataUpdate} />
            )}
            {activeTab === 'pengeluaranUnit' && (
              <PengeluaranUnitSection onDataUpdate={handleDataUpdate} />
            )}
            {activeTab === 'pengeluaran' && (
              <PengeluaranSection onDataUpdate={handleDataUpdate} />
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
