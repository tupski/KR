import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  PlusCircle,
  ChevronDown,
  ChevronRight,
  Trash2,
  Search,
  Download,
  AlertCircle,
  Filter,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/use-toast';
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
import { formatRupiah } from '@/lib/formatRupiah';
import { formatDateDisplay } from '@/lib/dateUtils';
import { usePengeluaran } from './usePengeluaran';
import { ExportFilterModal } from '@/components/tagihan/ExportFilterModal';
import PaginationControls from '@/components/PaginationControls';
import CategoryDetailPopup from '@/components/CategoryDetailPopup';
import { SectionCard } from '@/components/shared/SectionCard';

/**
 * PengeluaranSection — General expense CRUD with category summary and export.
 *
 * @param {object} props
 * @param {() => void} [props.onDataUpdate] - Callback when data changes
 */
export function PengeluaranSection({ onDataUpdate } = {}) {
  const { user } = useAuth();
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const {
    expenses,
    categorySummary,
    categories,
    totalItems,
    totalPages,
    currentPage,
    isLoading,
    error,
    setPage,
    filters,
    setFilter,
    clearFilters,
    showFilters,
    setShowFilters,
    categoryDialog,
    setCategoryDialog,
    deleteTarget,
    setDeleteTarget,
    handleAddExpense,
    handleDelete,
    handleCategoryClick,
    handleExport,
    fetchCategories,
    refreshExpenses,
    refreshSummary,
  } = usePengeluaran({ onDataUpdate });

  const [newExpense, setNewExpense] = useState({
    nama_pengeluaran: '',
    jumlah: '',
    kategori: '',
    tanggal: new Date().toISOString().split('T')[0],
    keterangan: '',
    lokasi: '',
    kamar: '',
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Build category options for ExportFilterModal
  const categoryOptions = useMemo(
    () =>
      (categories || []).map((c) => ({
        label: c.nama || c,
        value: c.nama || c,
      })),
    [categories]
  );

  const handleInputChange = (field, value) => {
    setNewExpense((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddSubmit = async () => {
    if (!newExpense.nama_pengeluaran.trim()) {
      toast({ title: 'Nama pengeluaran harus diisi', variant: 'destructive' });
      return;
    }
    if (!newExpense.jumlah || Number(newExpense.jumlah) <= 0) {
      toast({ title: 'Jumlah harus lebih dari 0', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      await handleAddExpense(newExpense, user.id);
      setNewExpense({
        nama_pengeluaran: '',
        jumlah: '',
        kategori: '',
        tanggal: new Date().toISOString().split('T')[0],
        keterangan: '',
        lokasi: '',
        kamar: '',
      });
      setShowAddForm(false);
      toast({ title: 'Pengeluaran berhasil ditambahkan' });
    } catch (err) {
      toast({ title: 'Gagal menambahkan pengeluaran', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await handleDelete(deleteTarget.id);
      setDeleteTarget(null);
      toast({ title: 'Pengeluaran berhasil dihapus' });
    } catch (err) {
      toast({ title: 'Gagal menghapus pengeluaran', description: err.message, variant: 'destructive' });
    }
  };

  const onExportHandler = async (filterParams) => {
    try {
      await handleExport(XLSX, filterParams);
      setExportModalOpen(false);
      toast({ title: 'Export berhasil' });
    } catch (err) {
      toast({ title: 'Gagal export', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Add Expense Form */}
      <SectionCard>
        <button
          type="button"
          onClick={() => setShowAddForm((prev) => !prev)}
          className="flex w-full items-center justify-between text-sm font-semibold text-gray-700"
        >
          <span className="flex items-center gap-2">
            <PlusCircle className="h-4 w-4 text-blue-500" />
            Tambah Pengeluaran
          </span>
          {showAddForm ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {showAddForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="mt-3 space-y-3"
          >
            <input
              placeholder="Nama Pengeluaran"
              value={newExpense.nama_pengeluaran}
              onChange={(e) => handleInputChange('nama_pengeluaran', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Jumlah"
                value={newExpense.jumlah}
                onChange={(e) => handleInputChange('jumlah', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={newExpense.tanggal}
                onChange={(e) => handleInputChange('tanggal', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <select
              value={newExpense.kategori}
              onChange={(e) => handleInputChange('kategori', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Pilih Kategori</option>
              {(categories || []).map((cat) => (
                <option key={cat.id || cat.nama || cat} value={cat.nama || cat}>
                  {cat.nama || cat}
                </option>
              ))}
            </select>
            <textarea
              placeholder="Keterangan (opsional)"
              value={newExpense.keterangan}
              onChange={(e) => handleInputChange('keterangan', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              rows={2}
            />
            <div className="flex gap-2">
              <input
                placeholder="Lokasi (opsional)"
                value={newExpense.lokasi}
                onChange={(e) => handleInputChange('lokasi', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                placeholder="Kamar (opsional)"
                value={newExpense.kamar}
                onChange={(e) => handleInputChange('kamar', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <Button onClick={handleAddSubmit} disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </motion.div>
        )}
      </SectionCard>

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

      {/* Filters Toggle */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => setShowFilters((prev) => !prev)}>
          <Filter className="mr-1 h-4 w-4" />
          Filter
        </Button>
        <Button variant="outline" size="sm" onClick={() => setExportModalOpen(true)}>
          <Download className="mr-1 h-4 w-4" />
          Export Excel
        </Button>
      </div>

      {/* Filter Controls */}
      {showFilters && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="space-y-2 rounded-lg border bg-white p-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Filter</span>
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
        </motion.div>
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
        <p className="py-8 text-center text-sm text-gray-500">Belum ada pengeluaran</p>
      ) : (
        <div className="space-y-2">
          {expenses.map((expense) => (
            <div
              key={expense.id}
              className="rounded-lg border bg-white p-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    {expense.nama_pengeluaran}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDateDisplay(expense.tanggal)}
                    {expense.kategori && (
                      <>
                        {' '}·{' '}
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                          {expense.kategori}
                        </span>
                      </>
                    )}
                  </p>
                  {expense.keterangan && (
                    <p className="mt-1 text-xs text-gray-400">{expense.keterangan}</p>
                  )}
                  {(expense.apartment_location || expense.room_number) && (
                    <p className="mt-1 text-xs text-gray-400">
                      {expense.apartment_location}
                      {expense.room_number && ` - ${expense.room_number}`}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className="text-sm font-bold text-gray-800">
                    {formatRupiah(expense.jumlah)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(expense)}
                    className="text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
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

      {/* Export Filter Modal */}
      <ExportFilterModal
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
        onExport={onExportHandler}
        categories={categoryOptions}
      />

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

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Pengeluaran</AlertDialogTitle>
            <AlertDialogDescription>
              Hapus pengeluaran "{deleteTarget?.nama_pengeluaran}"? Tindakan ini tidak
              dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
