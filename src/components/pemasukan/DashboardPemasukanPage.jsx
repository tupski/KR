import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useIncomeFilters } from '@/hooks/useIncomeFilters';
import { useIncomeData } from '@/hooks/useIncomeData';
import { deleteTransaction, editTransaction } from '@/lib/incomeApi';
import { isValidFinancePin } from '@/config/authConfig';
import { supabase } from '@/lib/customSupabaseClient';
import { getLocalDate } from '@/lib/dateUtils';
import EditTransaksiModal from '@/components/EditTransaksiModal';
import { PinModal } from '@/components/shared/PinModal';
import { IncomeFilterBar } from './IncomeFilterBar';
import { IncomeStatsCard } from './IncomeStatsCard';
import { TabTransaksi } from './TabTransaksi';
import { TabDeposit } from './TabDeposit';
import { IncomeShareDialog } from './IncomeShareDialog';
import { IncomeExportDialog } from './IncomeExportDialog';

/**
 * DashboardPemasukanPage — Parent orchestrator for the income dashboard.
 *
 * Wires useIncomeFilters and useIncomeData hooks together,
 * manages tab state (transaction list / deposit), and coordinates
 * edit, delete, share, and export actions across child components.
 */
export function DashboardPemasukanPage() {
  const { user, userRole, session } = useAuth();

  // ─── Hooks ─────────────────────────────────────────────────
  const { filters, setFilter, getQueryParams } = useIncomeFilters();
  const queryParams = useMemo(() => getQueryParams(), [getQueryParams]);
  const {
    transaksiList,
    totalCount,
    currentPage,
    totalPages,
    isLoading,
    error,
    stats,
    setPage,
    refresh,
  } = useIncomeData(queryParams);

  // ─── Tab state ─────────────────────────────────────────────
  const [activeMainTab, setActiveMainTab] = useState('umum');

  // ─── Location options (loaded once) ────────────────────────
  const [locationOptions, setLocationOptions] = useState([]);

  useEffect(() => {
    supabase
      .from('lokasi_apartemen')
      .select('name')
      .order('name')
      .then(({ data }) => {
        if (data) {
          setLocationOptions(data.map((l) => l.name));
        }
      });
  }, []);

  // ─── Edit state ────────────────────────────────────────────
  const [editingTransaksi, setEditingTransaksi] = useState(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingEdit, setPendingEdit] = useState(null);

  const handleEditClick = useCallback(
    (transaksi) => {
      if (userRole === 'super_admin') {
        setEditingTransaksi(transaksi);
        return;
      }
      setPendingEdit(transaksi);
      setShowPinModal(true);
    },
    [userRole],
  );

  const handlePinComplete = useCallback(
    (pin) => {
      if (isValidFinancePin(pin)) {
        setShowPinModal(false);
        setEditingTransaksi(pendingEdit);
        setPendingEdit(null);
        toast({
          title: 'Akses diberikan',
          className: 'bg-green-500 text-white',
        });
      } else {
        setShowPinModal(false);
        toast({ title: 'PIN Salah', variant: 'destructive' });
      }
    },
    [pendingEdit],
  );

  const handleSaveEdit = useCallback(
    async (updatedTransaksi) => {
      try {
        await editTransaction(updatedTransaksi.id, updatedTransaksi, session);
        toast({ title: 'Transaksi diperbarui ✅' });
        setEditingTransaksi(null);
        refresh();
      } catch (err) {
        toast({
          title: 'Gagal menyimpan',
          description: err.message,
          variant: 'destructive',
        });
      }
    },
    [session, refresh],
  );

  // ─── Delete state ──────────────────────────────────────────
  const handleDelete = useCallback(
    async (id) => {
      if (!window.confirm('Yakin ingin menghapus transaksi ini?')) return;
      try {
        const data = await deleteTransaction(id, session);
        const removedInfo = data?.removed_fee_rows
          ? `, komisi terhapus ${data.removed_fee_rows}`
          : '';
        toast({ title: `Transaksi dihapus${removedInfo}` });
        refresh();
      } catch (err) {
        toast({
          title: 'Gagal menghapus',
          description: err.message,
          variant: 'destructive',
        });
      }
    },
    [session, refresh],
  );

  // ─── Share state ───────────────────────────────────────────
  const [shareTransaction, setShareTransaction] = useState(null);

  const handleShare = useCallback((transaksi) => {
    setShareTransaction(transaksi);
  }, []);

  // ─── Export state ──────────────────────────────────────────
  const [showExport, setShowExport] = useState(false);

  // ─── Error display ────────────────────────────────────────
  const displayError = error;

  return (
    <>
      {/* PIN Modal for protected edit access */}
      <PinModal
        open={showPinModal}
        onOpenChange={setShowPinModal}
        onPinComplete={handlePinComplete}
      />

      {/* Edit Transaction Modal */}
      {editingTransaksi && (
        <EditTransaksiModal
          transaksi={editingTransaksi}
          onClose={() => setEditingTransaksi(null)}
          onSave={handleSaveEdit}
        />
      )}

      {/* Share Dialog */}
      <IncomeShareDialog
        open={!!shareTransaction}
        onOpenChange={(open) => {
          if (!open) setShareTransaction(null);
        }}
        transaction={shareTransaction}
      />

      {/* Export Dialog */}
      <IncomeExportDialog
        open={showExport}
        onOpenChange={setShowExport}
        transactions={transaksiList}
        startDate={filters.date || filters.dateStart || ''}
        endDate={filters.date || filters.dateEnd || ''}
      />

      {/* Main content */}
      <div className="min-h-screen p-4 pb-28 pt-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mx-auto max-w-md space-y-5"
        >
          {/* Header */}
          <div className="text-center">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 px-6 py-3 text-white shadow-lg">
              <TrendingUp className="h-5 w-5" />
              <h1 className="text-xl font-bold">Laporan & Deposit</h1>
            </div>
          </div>

          {/* Tab bar: Riwayat Transaksi / Manajemen Deposit */}
          <div className="flex gap-2 rounded-2xl bg-slate-200/50 p-1">
            <button
              onClick={() => setActiveMainTab('umum')}
              className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all ${
                activeMainTab === 'umum'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Riwayat Transaksi
            </button>
            <button
              onClick={() => setActiveMainTab('deposit')}
              className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all ${
                activeMainTab === 'deposit'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Manajemen Deposit
            </button>
          </div>

          {activeMainTab === 'umum' && (
            <>
              {/* Filter bar */}
              <IncomeFilterBar
                filters={filters}
                setFilter={setFilter}
                locationOptions={locationOptions}
                onExport={() => setShowExport(true)}
              />

              {/* Error state */}
              {displayError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">
                  {displayError}
                </div>
              )}

              {/* Stats cards */}
              <IncomeStatsCard stats={stats} />

              {/* Transaction list with pagination */}
              <TabTransaksi
                transactions={transaksiList}
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalCount}
                isLoading={isLoading}
                onPageChange={setPage}
                onEditClick={handleEditClick}
                onDelete={handleDelete}
                onShare={handleShare}
              />
            </>
          )}

          {activeMainTab === 'deposit' && <TabDeposit />}
        </motion.div>
      </div>
    </>
  );
}
