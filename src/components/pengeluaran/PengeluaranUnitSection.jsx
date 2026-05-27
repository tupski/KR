import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronRight, AlertCircle, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { formatRupiah } from '@/lib/formatRupiah';
import { formatDateDisplay } from '@/lib/dateUtils';
import { usePengeluaranUnit } from './usePengeluaranUnit';
import PaginationControls from '@/components/PaginationControls';
import CategoryDetailPopup from '@/components/CategoryDetailPopup';
import { SectionCard } from '@/components/shared/SectionCard';

/**
 * PengeluaranUnitSection — Per-unit expense tracking with category summary.
 *
 * @param {object} props
 * @param {() => void} [props.onDataUpdate] - Callback when data changes
 */
export function PengeluaranUnitSection({ onDataUpdate } = {}) {
  const [showSummary, setShowSummary] = useState(false);

  const {
    expenses,
    categorySummary,
    totalItems,
    totalPages,
    currentPage,
    isLoading,
    error,
    setPage,
    filters,
    setFilter,
    clearFilters,
    categoryDialog,
    setCategoryDialog,
    handleCategoryClick,
  } = usePengeluaranUnit({ onDataUpdate });

  return (
    <div className="space-y-4">
      {/* Category Summary */}
      <SectionCard>
        <button
          type="button"
          onClick={() => setShowSummary((prev) => !prev)}
          className="flex w-full items-center justify-between text-sm font-semibold text-gray-700"
        >
          <span>Ringkasan per Kategori</span>
          {showSummary ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {showSummary && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="mt-3 grid grid-cols-2 gap-2"
          >
            {(categorySummary || []).length === 0 ? (
              <p className="col-span-2 text-center text-sm text-gray-500">
                Tidak ada data
              </p>
            ) : (
              (categorySummary || []).map((cat, idx) => (
                <button
                  key={cat.category || idx}
                  type="button"
                  onClick={() => handleCategoryClick(cat)}
                  className="rounded-lg border bg-white p-3 text-left transition-colors hover:bg-gray-50"
                >
                  <p className="text-xs text-gray-500">{cat.category || 'Lainnya'}</p>
                  <p className="text-sm font-bold text-gray-800">
                    {formatRupiah(cat.total || 0)}
                  </p>
                  <p className="text-xs text-gray-400">{cat.count} transaksi</p>
                </button>
              ))
            )}
          </motion.div>
        )}
      </SectionCard>

      {/* Filter Bar */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFilter('_toggle', null)}
          className="flex items-center gap-1"
        >
          <Filter className="h-4 w-4" />
          Filter
        </Button>
      </div>

      {/* Filter Controls (inline) */}
      {(filters.lokasi || filters.kamar || filters.startDate || filters.endDate) && (
        <div className="space-y-2 rounded-lg border bg-white p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Filter Aktif</span>
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700"
            >
              <X className="h-3 w-3" />
              Reset
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Lokasi"
              value={filters.lokasi || ''}
              onChange={(e) => setFilter('lokasi', e.target.value || null)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="Kamar"
              value={filters.kamar || ''}
              onChange={(e) => setFilter('kamar', e.target.value || null)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={filters.startDate || ''}
              onChange={(e) => setFilter('startDate', e.target.value || null)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={filters.endDate || ''}
              onChange={(e) => setFilter('endDate', e.target.value || null)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}

      {/* Expense List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      ) : expenses.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          Belum ada pengeluaran unit
        </p>
      ) : (
        <div className="space-y-2">
          {expenses.map((expense) => (
            <div key={expense.id} className="rounded-lg border bg-white p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    {expense.nama || expense.nama_pengeluaran || '-'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDateDisplay(expense.tanggal)}
                  </p>
                  {expense.apartment_location && (
                    <p className="mt-1 text-xs text-gray-400">
                      {expense.apartment_location}
                      {expense.room_number && ` - ${expense.room_number}`}
                    </p>
                  )}
                  {expense.kategori && (
                    <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                      {expense.kategori}
                    </span>
                  )}
                </div>
                <p className="text-sm font-bold text-gray-800">
                  {formatRupiah(expense.jumlah)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalItems > 0 && (
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
          itemsPerPage={10}
          totalItems={totalItems}
        />
      )}

      {/* Category Detail Popup */}
      <CategoryDetailPopup
        open={categoryDialog.open}
        onOpenChange={(open) =>
          setCategoryDialog((prev) => ({ ...prev, open }))
        }
        category={categoryDialog.selected}
        totalAmount={categoryDialog.totalAmount}
        filters={filters}
      />
    </div>
  );
}
