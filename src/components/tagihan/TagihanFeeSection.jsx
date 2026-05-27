import React, { useState, useMemo, useCallback } from 'react';
import {
  Share2,
  CheckCircle,
  Trash2,
  Search,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { formatRupiah } from '@/lib/formatRupiah';
import { formatDateDisplay } from '@/lib/dateUtils';
import { formatWhatsappDateTime } from '@/lib/formatPaymentText';
import { payFeeItems, deleteFeeItem } from '@/lib/tagihanApi';
import { getDateRangeToday, getDateRangeYesterday, getDateRangeLast7Days, getDateRangeThisMonth } from '@/lib/dateUtils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import PaginationControls from '@/components/PaginationControls';

/**
 * TagihanFeeSection — Marketing fee management with grouping by marketing and WhatsApp share.
 *
 * @param {object} props
 * @param {() => void} [props.onDataUpdate] - Callback when data changes
 */
export function TagihanFeeSection({ onDataUpdate } = {}) {
  const { user } = useAuth();

  // ─── State ──────────────────────────────────────────────────
  const [activePaidView, setActivePaidView] = useState('unpaid');
  const [dateFilter, setDateFilter] = useState('today');
  const [payModal, setPayModal] = useState({ open: false, selectedFees: [], marketingName: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ─── Date Range ─────────────────────────────────────────────
  const getFeeDateRange = useCallback((filter) => {
    switch (filter) {
      case 'today': return getDateRangeToday();
      case 'yesterday': return getDateRangeYesterday();
      case '7days': return getDateRangeLast7Days();
      case 'month': return getDateRangeThisMonth();
      default: return null;
    }
  }, []);

  const paidDateRange = useMemo(() => {
    if (activePaidView !== 'paid') return null;
    return getFeeDateRange(dateFilter);
  }, [activePaidView, dateFilter, getFeeDateRange]);

  // ─── Paid Filters ───────────────────────────────────────────
  const paidFilters = useMemo(() => ({
    paid_at_not_null: { op: 'not_is_null', value: null },
    ...(paidDateRange
      ? {
          paid_at_start: { op: 'gte', value: paidDateRange.start, column: 'paid_at' },
          paid_at_end: { op: 'lte', value: paidDateRange.end, column: 'paid_at' },
        }
      : {}),
  }), [paidDateRange]);

  // ─── Paginated Queries ──────────────────────────────────────
  const unpaidQuery = usePaginatedQuery({
    table: 'fee_items',
    select: '*, marketing!inner(name)',
    pageSize: 50,
    orderBy: 'created_at',
    ascending: false,
    filters: { paid_at: { op: 'is', value: null } },
    enabled: activePaidView === 'unpaid',
  });

  const paidQuery = usePaginatedQuery({
    table: 'fee_items',
    select: '*, marketing!inner(name)',
    pageSize: 10,
    orderBy: 'paid_at',
    ascending: false,
    filters: paidFilters,
    enabled: activePaidView === 'paid',
  });

  const { data: unpaidFees, refresh: refreshUnpaid } = unpaidQuery;
  const { data: paidFees, refresh: refreshPaid } = paidQuery;
  const activeQuery = activePaidView === 'unpaid' ? unpaidQuery : paidQuery;

  // ─── Group Unpaid Fees by Marketing ─────────────────────────
  const marketingGroups = useMemo(() => {
    if (!unpaidFees || unpaidFees.length === 0) return [];

    const groups = {};
    unpaidFees.forEach((fee) => {
      const marketingName = fee.marketing?.name || 'Tanpa Marketing';
      if (!groups[marketingName]) {
        groups[marketingName] = { marketingName, items: [], totalFee: 0 };
      }
      groups[marketingName].items.push(fee);
      groups[marketingName].totalFee += Number(fee.amount || 0);
    });

    return Object.values(groups).sort((a, b) => b.totalFee - a.totalFee);
  }, [unpaidFees]);

  // ─── Filtered Paid Fees ─────────────────────────────────────
  const filteredPaidFees = useMemo(() => {
    if (!paidFees || !searchQuery) return paidFees || [];
    const q = searchQuery.toLowerCase();
    return paidFees.filter(
      (fee) =>
        (fee.marketing?.name || '').toLowerCase().includes(q) ||
        (fee.room_number || '').toLowerCase().includes(q)
    );
  }, [paidFees, searchQuery]);

  // ─── Handlers ───────────────────────────────────────────────
  const handlePayFees = useCallback((marketingName, transactions) => {
    const feeIds = transactions.map((t) => t.id);
    setPayModal({ open: true, selectedFees: feeIds, marketingName });
  }, []);

  const executePay = async () => {
    if (payModal.selectedFees.length === 0) return;

    setIsSubmitting(true);
    try {
      await payFeeItems(payModal.selectedFees, user.id);
      toast({ title: `Fee ${payModal.marketingName} berhasil dibayar` });
      setPayModal({ open: false, selectedFees: [], marketingName: '' });
      refreshUnpaid();
      onDataUpdate?.();
    } catch (err) {
      toast({ title: 'Gagal membayar fee', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await deleteFeeItem(deleteTarget.id);
      toast({ title: 'Fee berhasil dihapus' });
      setDeleteTarget(null);
      if (activePaidView === 'unpaid') {
        refreshUnpaid();
      } else {
        refreshPaid();
      }
      onDataUpdate?.();
    } catch (err) {
      toast({ title: 'Gagal menghapus fee', description: err.message, variant: 'destructive' });
    }
  };

  // ─── WhatsApp Share ─────────────────────────────────────────
  const handleShare = (feeItem) => {
    const marketingName = feeItem.marketing?.name || 'Marketing';
    const text = `*Fee Marketing - ${marketingName}*\n\n` +
      `Transaksi: ${feeItem.transaction_id || '-'}\n` +
      `Kamar: ${feeItem.room_number || '-'}\n` +
      `Jumlah: ${formatRupiah(feeItem.amount)}\n` +
      `Tanggal: ${formatWhatsappDateTime(feeItem.created_at)}\n`;

    const waUri = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUri, '_blank');
  };

  const handleShareUnpaidFee = (group) => {
    const sorted = [...group.items].sort((a, b) =>
      (a.room_number || '').localeCompare(b.room_number || '')
    );

    let text = `*Fee Marketing - ${group.marketingName} (Belum Dibayar)*\n\n`;
    sorted.forEach((item, idx) => {
      text += `${idx + 1}. ${item.room_number || '-'} — ${formatRupiah(item.amount)}\n`;
    });
    text += `\nTotal: ${formatRupiah(group.totalFee)}\n`;

    const waUri = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUri, '_blank');
  };

  // ─── Date Filter Buttons ────────────────────────────────────
  const DateFilterButtons = () => (
    <div className="flex gap-1">
      {[
        { id: 'today', label: 'Hari Ini' },
        { id: 'yesterday', label: 'Kemarin' },
        { id: '7days', label: '7 Hari' },
        { id: 'month', label: 'Bulan Ini' },
      ].map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => setDateFilter(opt.id)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            dateFilter === opt.id
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Toggle: Belum Lunas / Sudah Lunas */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-full bg-gray-100 p-0.5">
          <button
            type="button"
            onClick={() => setActivePaidView('unpaid')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activePaidView === 'unpaid' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
            }`}
          >
            Belum Lunas
          </button>
          <button
            type="button"
            onClick={() => setActivePaidView('paid')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activePaidView === 'paid' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
            }`}
          >
            Sudah Lunas
          </button>
        </div>

        {/* Date filter for paid view */}
        {activePaidView === 'paid' && <DateFilterButtons />}
      </div>

      {/* Unpaid View — Grouped by Marketing */}
      {activePaidView === 'unpaid' && (
        <>
          {activeQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : activeQuery.error ? (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" />
              {activeQuery.error}
            </div>
          ) : marketingGroups.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">Semua fee sudah dibayar</p>
          ) : (
            <div className="space-y-3">
              {marketingGroups.map((group) => (
                <div key={group.marketingName} className="rounded-lg border bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-gray-800">{group.marketingName}</p>
                      <p className="text-xs text-gray-500">{group.items.length} transaksi</p>
                    </div>
                    <p className="text-sm font-bold text-red-600">
                      {formatRupiah(group.totalFee)}
                    </p>
                  </div>

                  <div className="space-y-1">
                    {group.items.map((fee) => (
                      <div key={fee.id} className="flex items-center justify-between rounded bg-gray-50 px-2 py-1">
                        <div>
                          <p className="text-xs text-gray-600">
                            {fee.room_number || '-'}
                          </p>
                          {fee.transaction_id && (
                            <p className="text-xs text-gray-400">ID: {fee.transaction_id}</p>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-gray-700">
                          {formatRupiah(fee.amount)}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => handlePayFees(group.marketingName, group.items)}
                    >
                      <CheckCircle className="mr-1 h-3 w-3" />
                      Bayar Semua
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => handleShareUnpaidFee(group)}
                    >
                      <Share2 className="mr-1 h-3 w-3" />
                      Share ke WA
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Paid View — Flat List with Search */}
      {activePaidView === 'paid' && (
        <>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="Cari marketing atau kamar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm"
            />
          </div>

          {activeQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : activeQuery.error ? (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" />
              {activeQuery.error}
            </div>
          ) : filteredPaidFees.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">Tidak ada data fee</p>
          ) : (
            <div className="space-y-2">
              {filteredPaidFees.map((fee) => (
                <div key={fee.id} className="rounded-lg border bg-white p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        {fee.marketing?.name || 'Tanpa Marketing'}
                      </p>
                      <p className="text-xs text-gray-500">
                        Kamar: {fee.room_number || '-'}
                        {' · '}Lunas: {formatDateDisplay(fee.paid_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-gray-800">
                        {formatRupiah(fee.amount)}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleShare(fee)}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-500"
                        title="Share ke WA"
                      >
                        <Share2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(fee)}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500"
                        title="Hapus"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination for paid view */}
          {activeQuery.totalItems > 0 && (
            <PaginationControls
              currentPage={activeQuery.currentPage}
              totalPages={activeQuery.totalPages}
              onPageChange={activeQuery.setPage}
              itemsPerPage={activeQuery.pageSize}
              totalItems={activeQuery.totalItems}
            />
          )}
        </>
      )}

      {/* ── Pay Confirmation Modal ── */}
      <Dialog open={payModal.open} onOpenChange={(open) => setPayModal((prev) => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konfirmasi Pembayaran Fee</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              Marketing: <strong>{payModal.marketingName}</strong>
            </p>
            <p className="text-sm text-gray-600">
              Jumlah fee yang akan dibayar: <strong>{payModal.selectedFees.length}</strong> transaksi
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayModal({ open: false, selectedFees: [], marketingName: '' })}>
              Batal
            </Button>
            <Button onClick={executePay} disabled={isSubmitting}>
              {isSubmitting ? 'Memproses...' : 'Konfirmasi Bayar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Fee</AlertDialogTitle>
            <AlertDialogDescription>
              Hapus fee ini? Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
