import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IncomeTransactionList } from './IncomeTransactionList';

/**
 * TabTransaksi — Transaction list tab with pagination.
 *
 * Renders the income transaction list with server-side pagination controls.
 * Wraps IncomeTransactionList with pagination buttons.
 *
 * @param {object} props
 * @param {object[]} props.transactions - Current page transaction items
 * @param {number} props.currentPage - Active page number
 * @param {number} props.totalPages - Total available pages
 * @param {number} props.totalItems - Total item count across all pages
 * @param {boolean} props.isLoading - Loading state
 * @param {(page: number) => void} props.onPageChange - Page change handler
 * @param {(transaction: object) => void} props.onEditClick - Edit button handler
 * @param {(id: string) => void} props.onDelete - Delete button handler
 * @param {(transaction: object) => void} props.onShare - Share button handler
 */
export function TabTransaksi({
  transactions = [],
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  isLoading = false,
  onPageChange,
  onEditClick,
  onDelete,
  onShare,
}) {
  return (
    <div className="glassmorphic-card p-5">
      <h2 className="mb-4 font-bold text-gray-800">Detail Transaksi</h2>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : (
        <>
          <IncomeTransactionList
            transactions={transactions}
            onEditClick={onEditClick}
            onDelete={onDelete}
            onShare={onShare}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Button
                size="sm"
                variant="outline"
                disabled={currentPage <= 1}
                onClick={() =>
                  onPageChange(Math.max(currentPage - 1, 1))
                }
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Sebelumnya
              </Button>

              <p className="text-xs text-gray-600">
                Halaman {currentPage} dari {totalPages} ({totalItems} total)
              </p>

              <Button
                size="sm"
                variant="outline"
                disabled={currentPage >= totalPages}
                onClick={() =>
                  onPageChange(Math.min(currentPage + 1, totalPages))
                }
              >
                Berikutnya
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Summary */}
      <div className="glassmorphic-card mt-4 p-5">
        <h3 className="text-base font-bold text-red-900">
          Total Pemasukan (Filter)
        </h3>
        {!isLoading && transactions.length > 0 && (
          <p className="mt-1 text-sm">
            {totalItems} total transaksi
          </p>
        )}
      </div>
    </div>
  );
}
