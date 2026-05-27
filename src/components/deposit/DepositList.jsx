import React from 'react';
import { motion } from 'framer-motion';
import { Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { formatRupiah } from '@/lib/formatRupiah';
import { resolveStorageUrl } from '@/lib/storageUrl';

/**
 * Format ISO datetime string to Indonesian locale display.
 */
function formatTime(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

/**
 * Render a single deposit card.
 */
function DepositCard({ tx, activeTab, onReturnClick }) {
  const hasCash = Number(tx.deposit_cash) > 0;
  const hasTransfer = Number(tx.deposit_transfer) > 0;
  const totalDep = (Number(tx.deposit_cash) || 0) + (Number(tx.deposit_transfer) || 0);

  // Determine card style based on deposit type
  let cardBorder = 'border-slate-200';
  let cardBg = 'bg-white';
  let typeBadge = null;

  if (hasCash && hasTransfer) {
    cardBorder = 'border-purple-200';
    cardBg = 'bg-purple-50';
    typeBadge = (
      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-200">
        Tunai + Transfer
      </span>
    );
  } else if (hasCash) {
    cardBorder = 'border-green-200';
    cardBg = 'bg-green-50';
    typeBadge = (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700 border border-green-200">
        💵 Tunai
      </span>
    );
  } else if (hasTransfer) {
    cardBorder = 'border-blue-200';
    cardBg = 'bg-blue-50';
    typeBadge = (
      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
        🏦 Transfer
      </span>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`rounded-2xl border-2 ${cardBorder} ${cardBg} p-4 shadow-sm overflow-hidden`}
    >
      <div className="flex items-start justify-between">
        <div className="overflow-hidden">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-slate-900 truncate">{tx.customer_name}</h3>
            {typeBadge}
          </div>
          <p className="text-xs text-slate-500 truncate">
            Kamar {tx.room_number} ({tx.apartment_location})
          </p>
          <p className="text-xs text-slate-500">Masuk: {formatTime(tx.created_at)}</p>
          {tx.marketing_name && (
            <p className="text-xs text-slate-400 truncate">Marketing: {tx.marketing_name}</p>
          )}
        </div>
        <div className="text-right min-w-0 shrink-0 ml-2">
          <p
            className={`text-lg font-extrabold ${
              activeTab === 'belum' ? 'text-amber-600' : 'text-green-600'
            } truncate`}
          >
            {formatRupiah(totalDep)}
          </p>
        </div>
      </div>

      {activeTab === 'belum' && (
        <Button
          onClick={() => onReturnClick(tx)}
          className="mt-4 w-full bg-amber-500 text-white hover:bg-amber-600 font-bold"
        >
          Kembalikan Deposit
        </Button>
      )}

      {activeTab === 'sudah' && (
        <div className="mt-4 rounded-xl bg-green-50 px-3 py-2 text-xs text-green-800 border border-green-100 flex justify-between items-center overflow-hidden gap-2">
          <span className="truncate">Dikembalikan: {formatTime(tx.deposit_returned_at)}</span>
          {tx.deposit_refund_proof_url && (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-green-700 hover:text-green-800 hover:bg-green-100 flex items-center gap-1 shrink-0"
                >
                  <ImageIcon className="h-3 w-3" /> Lihat Bukti
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm rounded-3xl bg-black/90">
                <DialogHeader>
                  <DialogTitle className="text-white">Bukti Pengembalian</DialogTitle>
                  <DialogDescription className="text-slate-300">
                    Bukti refund deposit customer {tx.customer_name}.
                  </DialogDescription>
                </DialogHeader>
                <img
                  src={resolveStorageUrl(tx.deposit_refund_proof_url)}
                  alt="Bukti Refund"
                  className="w-full rounded-2xl border border-white/20"
                />
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}
    </motion.div>
  );
}

/**
 * Pagination controls for the deposit list.
 */
function PaginationControls({ currentPage, totalPages, totalItems, onPageChange, isLoading }) {
  if (totalPages <= 1) return null;

  // Build visible page numbers (max 5)
  const getPageNumbers = () => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 3) return [1, 2, 3, 4, 5];
    if (currentPage >= totalPages - 2) {
      return Array.from({ length: 5 }, (_, i) => totalPages - 4 + i);
    }
    return Array.from({ length: 5 }, (_, i) => currentPage - 2 + i);
  };

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs text-slate-600">
          <span className="font-bold text-slate-900">{totalItems}</span> data
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1 || isLoading}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-all ${
              currentPage === 1 || isLoading
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-sm'
            }`}
          >
            ← Prev
          </button>

          <div className="flex items-center gap-1">
            {getPageNumbers().map((pageNum) => (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                disabled={isLoading}
                className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-all ${
                  currentPage === pageNum
                    ? 'bg-indigo-500 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {pageNum}
              </button>
            ))}
          </div>

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages || isLoading}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-all ${
              currentPage === totalPages || isLoading
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-sm'
            }`}
          >
            Next →
          </button>
        </div>

        <div className="text-xs text-slate-600">
          Halaman{' '}
          <span className="font-bold text-slate-900">{currentPage}</span> dari{' '}
          <span className="font-bold text-slate-900">{totalPages}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * DepositList — Paginated deposit list with return/returned actions.
 *
 * @param {object}   props
 * @param {Array}    props.deposits     - Deposit data array from useDepositData
 * @param {boolean}  props.isLoading    - Loading state
 * @param {string}   props.activeTab    - 'belum' | 'sudah'
 * @param {number}   props.currentPage  - Current page number
 * @param {number}   props.totalPages   - Total page count
 * @param {number}   props.totalItems   - Total item count
 * @param {function} props.onPageChange - (page) => void
 * @param {function} props.onReturnClick - (tx) => void
 */
export function DepositList({
  deposits,
  isLoading,
  activeTab,
  currentPage,
  totalPages,
  totalItems,
  onPageChange,
  onReturnClick,
}) {
  if (isLoading) {
    return (
      <p className="py-10 text-center text-sm text-slate-500">Memuat data deposit...</p>
    );
  }

  if (!deposits || deposits.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate-500">
        Tidak ada deposit di kategori ini.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {deposits.map((tx) => (
        <DepositCard
          key={tx.id}
          tx={tx}
          activeTab={activeTab}
          onReturnClick={onReturnClick}
        />
      ))}

      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        onPageChange={onPageChange}
        isLoading={isLoading}
      />
    </div>
  );
}
