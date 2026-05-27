import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  PlusCircle,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import {
  payTagihanBulanan,
  deleteTagihan,
  toggleTagihanRecurring,
} from '@/lib/tagihanApi';
import { compressImageFile } from '@/lib/compressImage';
import { uploadToVercelBlob } from '@/lib/vercelBlobUpload';
import PaginationControls from '@/components/PaginationControls';
import { TagihanBillCard } from './TagihanBillCard';
import {
  AddTagihanDialog,
  EditTagihanDialog,
  PayTagihanDialog,
  DeleteTagihanDialog,
  ImageViewerModalWrapper,
} from './TagihanBulananDialogs';

const INITIAL_FORM = {
  nama: '',
  jumlah: '',
  due_date: '',
  lokasi: '',
  kamar: '',
  kategori: '',
  bulan: '',
  is_recurring: false,
};

/**
 * TagihanBulananSection — Monthly bill CRUD with pagination, pay dialog, and recurring toggle.
 *
 * @param {object} props
 * @param {() => void} [props.onDataUpdate] - Callback when data changes
 */
export function TagihanBulananSection({ onDataUpdate } = {}) {
  const { user } = useAuth();

  // ─── Tab State ──────────────────────────────────────────────
  const [paidTab, setPaidTab] = useState(false);
  const [unpaidMonthFilter, setUnpaidMonthFilter] = useState('all');
  const [paidMonthFilter, setPaidMonthFilter] = useState('all');

  // ─── Dialog State ───────────────────────────────────────────
  const [dialog, setDialog] = useState({
    addOpen: false,
    editOpen: false,
    payOpen: false,
    deleteOpen: false,
    deleteId: null,
  });
  const [payId, setPayId] = useState(null);
  const [payProofFile, setPayProofFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewImage, setViewImage] = useState(null);

  // ─── Form State ─────────────────────────────────────────────
  const [form, setForm] = useState(INITIAL_FORM);
  const [editForm, setEditForm] = useState({ ...INITIAL_FORM, id: null });

  // ─── Month Labels ───────────────────────────────────────────
  const monthLabels = useMemo(() => {
    const now = new Date();
    return {
      thisMonthName: format(now, 'MMM', { locale: idLocale }),
      nextMonthName: format(addMonths(now, 1), 'MMM', { locale: idLocale }),
      prevMonthName: format(subMonths(now, 1), 'MMM', { locale: idLocale }),
    };
  }, []);

  // ─── Date Ranges ────────────────────────────────────────────
  const unpaidDateRange = useMemo(() => {
    if (unpaidMonthFilter === 'all') return null;
    const now = new Date();
    const target = unpaidMonthFilter === 'this' ? now : addMonths(now, 1);
    return { from: format(startOfMonth(target), 'yyyy-MM-dd'), to: format(endOfMonth(target), 'yyyy-MM-dd') };
  }, [unpaidMonthFilter]);

  const paidDateRange = useMemo(() => {
    if (paidMonthFilter === 'all') return null;
    const now = new Date();
    const target = paidMonthFilter === 'this' ? now : subMonths(now, 1);
    return { from: format(startOfMonth(target), 'yyyy-MM-dd'), to: format(endOfMonth(target), 'yyyy-MM-dd') };
  }, [paidMonthFilter]);

  // ─── Stable Filter Objects ──────────────────────────────────
  const unpaidFilters = useMemo(() => ({
    status: { op: 'eq', value: 'unpaid' },
    ...(unpaidDateRange
      ? {
          due_date_from: { op: 'gte', value: unpaidDateRange.from, column: 'due_date' },
          due_date_to: { op: 'lte', value: unpaidDateRange.to, column: 'due_date' },
        }
      : {}),
  }), [unpaidDateRange]);

  const paidFilters = useMemo(() => ({
    status: { op: 'eq', value: 'paid' },
    ...(paidDateRange
      ? {
          paid_at_from: { op: 'gte', value: `${paidDateRange.from}T00:00:00.000Z`, column: 'paid_at' },
          paid_at_to: { op: 'lte', value: `${paidDateRange.to}T23:59:59.999Z`, column: 'paid_at' },
        }
      : {}),
  }), [paidDateRange]);

  // ─── Paginated Queries ──────────────────────────────────────
  const unpaidQuery = usePaginatedQuery({
    table: 'tagihan_bulanan',
    select: '*',
    pageSize: 10,
    orderBy: 'due_date',
    ascending: true,
    filters: unpaidFilters,
    enabled: !paidTab,
  });

  const paidQuery = usePaginatedQuery({
    table: 'tagihan_bulanan',
    select: '*',
    pageSize: 10,
    orderBy: 'paid_at',
    ascending: false,
    filters: paidFilters,
    enabled: paidTab,
  });

  const { data: unpaidBills, refresh: refreshUnpaid } = unpaidQuery;
  const { data: paidBills, refresh: refreshPaid } = paidQuery;
  const activeQuery = paidTab ? paidQuery : unpaidQuery;

  // ─── Refresh Helper ─────────────────────────────────────────
  const refreshAll = useCallback(() => {
    if (paidTab) {
      refreshPaid();
    } else {
      refreshUnpaid();
    }
    onDataUpdate?.();
  }, [paidTab, refreshPaid, refreshUnpaid, onDataUpdate]);

  // ─── Form Handlers ──────────────────────────────────────────
  const resetForm = () => setForm(INITIAL_FORM);

  const handleInputChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditInputChange = (field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddTagihan = async () => {
    if (!form.nama.trim() || !form.jumlah || Number(form.jumlah) <= 0 || !form.due_date) {
      toast({ title: 'Nama, jumlah (>0), dan tanggal jatuh tempo harus diisi', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: insertError } = await supabase.from('tagihan_bulanan').insert({
        nama: form.nama,
        jumlah: Number(form.jumlah),
        due_date: form.due_date,
        apartment_location: form.lokasi || null,
        room_number: form.kamar || null,
        kategori: form.kategori || null,
        bulan: form.bulan || null,
        is_recurring: form.is_recurring,
        status: 'unpaid',
        created_by: user.id,
      });

      if (insertError) throw insertError;

      toast({ title: 'Tagihan berhasil ditambahkan' });
      resetForm();
      setDialog((prev) => ({ ...prev, addOpen: false }));
      refreshUnpaid();
      onDataUpdate?.();
    } catch (err) {
      toast({ title: 'Gagal menambahkan tagihan', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEdit = (bill) => {
    setEditForm({
      id: bill.id,
      nama: bill.nama || '',
      jumlah: String(bill.jumlah || ''),
      due_date: bill.due_date || '',
      lokasi: bill.apartment_location || '',
      kamar: bill.room_number || '',
      kategori: bill.kategori || '',
      bulan: bill.bulan || '',
      is_recurring: !!bill.is_recurring,
    });
    setDialog((prev) => ({ ...prev, editOpen: true }));
  };

  const handleSaveEdit = async () => {
    if (!editForm.nama.trim() || !editForm.jumlah || Number(editForm.jumlah) <= 0) {
      toast({ title: 'Nama dan jumlah harus diisi', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: updateError } = await supabase
        .from('tagihan_bulanan')
        .update({
          nama: editForm.nama,
          jumlah: Number(editForm.jumlah),
          due_date: editForm.due_date,
          apartment_location: editForm.lokasi || null,
          room_number: editForm.kamar || null,
          kategori: editForm.kategori || null,
          bulan: editForm.bulan || null,
          is_recurring: editForm.is_recurring,
        })
        .eq('id', editForm.id);

      if (updateError) throw updateError;

      toast({ title: 'Tagihan berhasil diperbarui' });
      setDialog((prev) => ({ ...prev, editOpen: false }));
      refreshAll();
    } catch (err) {
      toast({ title: 'Gagal memperbarui tagihan', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openPay = (billId) => {
    setPayId(billId);
    setPayProofFile(null);
    setDialog((prev) => ({ ...prev, payOpen: true }));
  };

  const handleProofUpload = async (file) => {
    try {
      const compressed = await compressImageFile(file);
      const url = await uploadToVercelBlob(compressed, 'tagihan-proof');
      return url;
    } catch {
      toast({ title: 'Gagal upload bukti bayar', variant: 'destructive' });
      return null;
    }
  };

  const handleMarkAsPaid = async () => {
    if (!payId) return;

    setIsSubmitting(true);
    try {
      let proofUrl = null;
      if (payProofFile) {
        proofUrl = await handleProofUpload(payProofFile);
        if (!proofUrl) {
          setIsSubmitting(false);
          return;
        }
      }

      await payTagihanBulanan([payId], user.id, proofUrl);
      toast({ title: 'Tagihan berhasil dibayar' });
      setDialog((prev) => ({ ...prev, payOpen: false }));
      setPayId(null);
      refreshAll();
    } catch (err) {
      toast({ title: 'Gagal membayar tagihan', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    const id = dialog.deleteId;
    if (!id) return;

    try {
      await deleteTagihan(id);
      toast({ title: 'Tagihan berhasil dihapus' });
      setDialog({ addOpen: false, editOpen: false, payOpen: false, deleteOpen: false, deleteId: null });
      refreshAll();
    } catch (err) {
      toast({ title: 'Gagal menghapus tagihan', description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleRecurring = async (tagihan) => {
    try {
      await toggleTagihanRecurring(tagihan.id, !tagihan.is_recurring);
      refreshAll();
    } catch (err) {
      toast({ title: 'Gagal mengubah status recurring', description: err.message, variant: 'destructive' });
    }
  };

  const bills = paidTab ? paidBills : unpaidBills;
  const isLoading = activeQuery.isLoading;
  const error = activeQuery.error;

  return (
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" onClick={() => setDialog((prev) => ({ ...prev, addOpen: true }))}>
          <PlusCircle className="mr-1 h-4 w-4" />
          Tambah Tagihan
        </Button>
        <div className="flex items-center gap-1 rounded-full bg-gray-100 p-0.5">
          <button
            type="button"
            onClick={() => setPaidTab(false)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              !paidTab ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
            }`}
          >
            Belum Lunas
          </button>
          <button
            type="button"
            onClick={() => setPaidTab(true)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              paidTab ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
            }`}
          >
            Lunas
          </button>
        </div>
      </div>

      {/* Month Filters */}
      <div className="flex gap-1">
        {!paidTab ? (
          <>
            {['all', 'this', 'next'].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setUnpaidMonthFilter(key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  unpaidMonthFilter === key
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {key === 'all' ? 'Semua' : key === 'this' ? monthLabels.thisMonthName : monthLabels.nextMonthName}
              </button>
            ))}
          </>
        ) : (
          <>
            {['all', 'this', 'prev'].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setPaidMonthFilter(key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  paidMonthFilter === key
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {key === 'all' ? 'Semua' : key === 'this' ? monthLabels.thisMonthName : monthLabels.prevMonthName}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Bills List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      ) : bills.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          {paidTab ? 'Belum ada tagihan yang lunas' : 'Belum ada tagihan'}
        </p>
      ) : (
        <div className="space-y-2">
          {bills.map((bill) => (
            <TagihanBillCard
              key={bill.id}
              bill={bill}
              paidTab={paidTab}
              onEdit={openEdit}
              onPay={openPay}
              onToggleRecurring={handleToggleRecurring}
              onDeleteClick={(id) => setDialog((prev) => ({ ...prev, deleteOpen: true, deleteId: id }))}
              onViewProof={setViewImage}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {activeQuery.totalItems > 0 && (
        <PaginationControls
          currentPage={activeQuery.currentPage}
          totalPages={activeQuery.totalPages}
          onPageChange={activeQuery.setPage}
          itemsPerPage={activeQuery.pageSize}
          totalItems={activeQuery.totalItems}
        />
      )}

      {/* Dialogs */}
      <AddTagihanDialog
        open={dialog.addOpen}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, addOpen: open }))}
        form={form}
        onInputChange={handleInputChange}
        onSubmit={handleAddTagihan}
        isSubmitting={isSubmitting}
      />

      <EditTagihanDialog
        open={dialog.editOpen}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, editOpen: open }))}
        editForm={editForm}
        onInputChange={handleEditInputChange}
        onSubmit={handleSaveEdit}
        isSubmitting={isSubmitting}
      />

      <PayTagihanDialog
        open={dialog.payOpen}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, payOpen: open }))}
        payProofFile={payProofFile}
        onProofFileChange={setPayProofFile}
        onConfirm={handleMarkAsPaid}
        isSubmitting={isSubmitting}
      />

      <DeleteTagihanDialog
        open={dialog.deleteOpen}
        onOpenChange={(open) =>
          setDialog((prev) => ({ ...prev, deleteOpen: open, deleteId: open ? prev.deleteId : null }))
        }
        onConfirm={handleDelete}
      />

      <ImageViewerModalWrapper viewImage={viewImage} onClose={() => setViewImage(null)} />
    </div>
  );
}
