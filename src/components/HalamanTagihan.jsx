import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, PlusCircle, Calendar, CheckCircle, History, ChevronDown, ChevronRight, Eye, Share2, Trash2, Coins, Search, Download, Building2, DoorOpen, Tag, AlertCircle, Pencil, Repeat } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { financeApi } from '@/api/finance.api';
import { pengeluaranApi } from '@/api/pengeluaran.api';
import { locationsApi } from '@/api/locations.api';
import { transactionsApi } from '@/api/transactions.api';
import * as storageApi from '@/api/storage.api';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { addDays, addMonths, format, endOfMonth, startOfDay, startOfMonth, subDays, subMonths } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import PaginationControls from '@/components/PaginationControls';
import TrendBreakdownChart from '@/components/TrendBreakdownChart';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useCategorySummary } from '@/hooks/useCategorySummary';
import { Spinner } from '@/components/ui/spinner';
import { getDefaultDateRange } from '@/lib/dateUtils';
import { formatRupiah } from '@/lib/formatRupiah';
import CategoryDetailPopup from '@/components/CategoryDetailPopup';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/** Contoh: "18 Apr 2026, 13:20 WIB" — waktu zona Asia/Jakarta. */
const formatLunasDateTimeWib = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
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
};

const HalamanTagihan = () => {
  const [activeMenu, setActiveMenu] = useState('bulanan');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [monthlySummary, setMonthlySummary] = useState({ pemasukan: 0, pengeluaran: 0, laba: 0 });

  const formatRupiah = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value || 0);

  const calculateSummary = useCallback(async () => {
    const startDate = startOfMonth(new Date(selectedMonth));
    const endDateExclusive = addMonths(startDate, 1);

    try {
      const transactionsData = await transactionsApi.list({
        startDate: startDate.toISOString(),
        endDate: endDateExclusive.toISOString(),
        select: 'cash_amount,transfer_amount'
      });
      const transactions = transactionsData?.data || transactionsData || [];
      const pemasukan = transactions.reduce((sum, t) => sum + (t.cash_amount || 0) + (t.transfer_amount || 0), 0);

      const expensesData = await pengeluaranApi.list({
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(endDateExclusive, 'yyyy-MM-dd'),
        select: 'jumlah'
      });
      const expenses = expensesData?.data || expensesData || [];
      const pengeluaran = expenses.reduce((sum, e) => sum + (e.jumlah || 0), 0);

      setMonthlySummary({ pemasukan, pengeluaran, laba: pemasukan - pengeluaran });
    } catch (error) {
      console.error("Error fetching finance summary:", error);
    }
  }, [selectedMonth]);

  const handleDataUpdate = () => {
    calculateSummary();
  }

  const financeDebounceRef = useRef(null);
  const debouncedCalculateSummary = useCallback(() => {
    if (financeDebounceRef.current) clearTimeout(financeDebounceRef.current);
    financeDebounceRef.current = setTimeout(() => calculateSummary(), 1500);
  }, [calculateSummary]);

  useEffect(() => {
    calculateSummary();
    // Realtime subscription removed - polling will be handled by component refresh
  }, [calculateSummary]);

  return (
    <div className="min-h-screen p-4 pt-6 pb-28">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md mx-auto space-y-5">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-6 py-3 rounded-full shadow-lg">
            <FileText className="w-6 h-6" />
            <h1 className="text-xl font-bold">Menu Finance</h1>
          </div>
        </div>

        <div className="glassmorphic-card p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-gray-800 font-bold">Ringkasan Bulanan</h2>
            <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-white/50 border-gray-300 border-2 rounded-lg px-2 py-1 text-gray-800 text-sm" />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-green-100 p-2 rounded-lg">
              <p className="text-xs text-green-800">Pemasukan</p>
              <p className="text-green-900 font-bold text-sm">{formatRupiah(monthlySummary.pemasukan)}</p>
            </div>
            <div className="bg-red-100 p-2 rounded-lg">
              <p className="text-xs text-red-800">Pengeluaran</p>
              <p className="text-red-900 font-bold text-sm">{formatRupiah(monthlySummary.pengeluaran)}</p>
            </div>
            <div className="bg-blue-100 p-2 rounded-lg">
              <p className="text-xs text-blue-800">Laba Bersih</p>
              <p className="text-blue-900 font-bold text-sm">{formatRupiah(monthlySummary.laba)}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1 p-1 rounded-full bg-black/10">
          <button onClick={() => setActiveMenu('bulanan')} className={`py-2 px-2 rounded-full text-xs font-semibold transition-all duration-300 ${activeMenu === 'bulanan' ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-lg' : 'text-gray-700'}`}>
            Tgh. Unit
          </button>
          <button onClick={() => setActiveMenu('fee')} className={`py-2 px-2 rounded-full text-xs font-semibold transition-all duration-300 ${activeMenu === 'fee' ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-lg' : 'text-gray-700'}`}>
            Tgh. Fee
          </button>
          <button onClick={() => setActiveMenu('pengeluaran')} className={`py-2 px-2 rounded-full text-xs font-semibold transition-all duration-300 ${activeMenu === 'pengeluaran' ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-lg' : 'text-gray-700'}`}>
            Pengeluaran
          </button>
          <button onClick={() => setActiveMenu('pengeluaranUnit')} className={`py-2 px-2 rounded-full text-xs font-semibold transition-all duration-300 ${activeMenu === 'pengeluaranUnit' ? 'bg-gradient-to-r from-orange-400 to-red-500 text-white shadow-lg' : 'text-gray-700'}`}>
            Per Unit
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeMenu}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeMenu === 'bulanan' ? <TagihanBulanan onDataUpdate={handleDataUpdate} /> : activeMenu === 'fee' ? <TagihanFee onDataUpdate={handleDataUpdate} /> : activeMenu === 'pengeluaranUnit' ? <PengeluaranUnit onDataUpdate={handleDataUpdate} /> : <Pengeluaran onDataUpdate={handleDataUpdate} />}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

const TagihanBulanan = ({ onDataUpdate }) => {
  const { user } = useAuth();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [newTagihan, setNewTagihan] = useState({ apartment_location: '', room_number: '', amount: '', due_date: '', is_recurring: true });
  const [tagihanKamarOptions, setTagihanKamarOptions] = useState([]);
  const [lokasiOptions, setLokasiOptions] = useState([]);
  const [buktiBayarFile, setBuktiBayarFile] = useState(null);
  const [selectedTagihan, setSelectedTagihan] = useState(null);
  const [showHistory, setShowHistory] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeUnitTab, setActiveUnitTab] = useState('aktif'); // 'aktif' | 'lunas'
  const [unpaidMonthFilter, setUnpaidMonthFilter] = useState('all'); // 'all' | 'this' | 'next'
  const [paidMonthFilter, setPaidMonthFilter] = useState('all'); // 'all' | 'this' | 'prev'
  // Edit
  const [editingTagihan, setEditingTagihan] = useState(null); // row sedang diedit
  const [editForm, setEditForm] = useState({ apartment_location: '', room_number: '', amount: '', due_date: '', is_recurring: true });
  const [editSuccessOpen, setEditSuccessOpen] = useState(false);

  // Helper: nama bulan untuk label chip filter
  const monthLabels = useMemo(() => {
    const now = new Date();
    return {
      thisMonthName: format(now, 'MMM', { locale: idLocale }),
      nextMonthName: format(addMonths(now, 1), 'MMM', { locale: idLocale }),
      prevMonthName: format(subMonths(now, 1), 'MMM', { locale: idLocale }),
    };
  }, []);

  // Hitung range due_date untuk filter tagihan aktif (berdasarkan due_date)
  const unpaidDateRange = useMemo(() => {
    const now = new Date();
    if (unpaidMonthFilter === 'this') {
      return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: format(endOfMonth(now), 'yyyy-MM-dd') };
    }
    if (unpaidMonthFilter === 'next') {
      const next = addMonths(now, 1);
      return { from: format(startOfMonth(next), 'yyyy-MM-dd'), to: format(endOfMonth(next), 'yyyy-MM-dd') };
    }
    return null;
  }, [unpaidMonthFilter]);

  // Hitung range paid_at untuk filter riwayat lunas (berdasarkan paid_at)
  const paidDateRange = useMemo(() => {
    const now = new Date();
    if (paidMonthFilter === 'this') {
      return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: format(endOfMonth(now), 'yyyy-MM-dd') };
    }
    if (paidMonthFilter === 'prev') {
      const prev = subMonths(now, 1);
      return { from: format(startOfMonth(prev), 'yyyy-MM-dd'), to: format(endOfMonth(prev), 'yyyy-MM-dd') };
    }
    return null;
  }, [paidMonthFilter]);

  // Stable filter objects — must be memoized to avoid infinite re-fetch loop
  const unpaidFilters = useMemo(() => ({
    status: { op: 'eq', value: 'unpaid' },
    ...(unpaidDateRange ? {
      due_date_from: { op: 'gte', value: unpaidDateRange.from, column: 'due_date' },
      due_date_to: { op: 'lte', value: unpaidDateRange.to, column: 'due_date' },
    } : {}),
  }), [unpaidDateRange]);

  const paidFilters = useMemo(() => ({
    status: { op: 'eq', value: 'paid' },
    ...(paidDateRange ? {
      paid_at_from: { op: 'gte', value: `${paidDateRange.from}T00:00:00.000Z`, column: 'paid_at' },
      paid_at_to: { op: 'lte', value: `${paidDateRange.to}T23:59:59.999Z`, column: 'paid_at' },
    } : {}),
  }), [paidDateRange]);

  // Server-side paginated queries
  const unpaidQuery = usePaginatedQuery({
    table: 'tagihan_bulanan',
    select: '*',
    pageSize: 10,
    orderBy: 'due_date',
    ascending: true,
    filters: unpaidFilters,
  });

  const paidQuery = usePaginatedQuery({
    table: 'tagihan_bulanan',
    select: '*',
    pageSize: 10,
    orderBy: 'paid_at',
    ascending: false,
    filters: paidFilters,
  });

  // Compute diffDays for unpaid tagihan display
  const tagihanList = useMemo(() => {
    return (unpaidQuery.data || []).map(tagihan => {
      const dueDate = new Date(tagihan.due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffTime = dueDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return { ...tagihan, diffDays };
    });
  }, [unpaidQuery.data]);

  const paidList = paidQuery.data || [];

  const fetchOptions = async () => {
    try {
      const lokasiData = await locationsApi.list();
      if (lokasiData) setLokasiOptions(lokasiData.map(l => l.name));
      const kamarData = await locationsApi.listRoomsWithOccupancy();
      if (kamarData) setTagihanKamarOptions(kamarData);
    } catch (error) {
      console.error('Failed to fetch options:', error);
    }
  };

  useEffect(() => {
    fetchOptions();
  }, []);

  const formatRupiah = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value || 0);
  const deformatRupiah = (value) => String(value).replace(/[^0-9]/g, '');

  const handleInputChange = (field, value) => {
    if (field === 'amount') {
      const numericValue = deformatRupiah(value);
      setNewTagihan(prev => ({ ...prev, [field]: numericValue ? new Intl.NumberFormat('id-ID').format(numericValue) : '' }));
    } else {
      setNewTagihan(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleEditInputChange = (field, value) => {
    if (field === 'amount') {
      const numericValue = deformatRupiah(value);
      setEditForm(prev => ({ ...prev, [field]: numericValue ? new Intl.NumberFormat('id-ID').format(numericValue) : '' }));
    } else {
      setEditForm(prev => ({ ...prev, [field]: value }));
    }
  };

  const openEditDialog = (tagihan) => {
    setEditingTagihan(tagihan);
    setEditForm({
      apartment_location: tagihan.apartment_location || '',
      room_number: tagihan.room_number || '',
      amount: tagihan.amount ? new Intl.NumberFormat('id-ID').format(tagihan.amount) : '',
      due_date: tagihan.due_date || '',
      is_recurring: !!tagihan.is_recurring,
    });
  };

  const handleAddTagihan = async () => {
    if (!newTagihan.apartment_location || !newTagihan.room_number || !newTagihan.amount || !newTagihan.due_date) {
      toast({ title: "Data tidak lengkap!", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      await financeApi.createTagihanBulanan({
        apartment_location: newTagihan.apartment_location,
        room_number: newTagihan.room_number,
        amount: deformatRupiah(newTagihan.amount),
        due_date: newTagihan.due_date,
        is_recurring: !!newTagihan.is_recurring,
        status: 'unpaid'
      });

      setIsFormOpen(false);
      setNewTagihan({ apartment_location: '', room_number: '', amount: '', due_date: '', is_recurring: true });
      toast({ title: "✅ Tagihan berhasil ditambahkan!" });
      unpaidQuery.refresh();
      onDataUpdate();
    } catch (error) {
      toast({ title: "Gagal menambahkan", description: error.message, variant: "destructive" });
    }
    setIsSubmitting(false);
  };

  const handleSaveEdit = async () => {
    if (!editingTagihan) return;
    if (!editForm.apartment_location || !editForm.room_number || !editForm.amount || !editForm.due_date) {
      toast({ title: "Data tidak lengkap!", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      await financeApi.updateTagihanBulanan(editingTagihan.id, {
        apartment_location: editForm.apartment_location,
        room_number: editForm.room_number,
        amount: deformatRupiah(editForm.amount),
        due_date: editForm.due_date,
        is_recurring: !!editForm.is_recurring,
      });

      setEditingTagihan(null);
      unpaidQuery.refresh();
      paidQuery.refresh();
      onDataUpdate();
      setEditSuccessOpen(true);
    } catch (error) {
      toast({ title: "Gagal menyimpan perubahan", description: error.message, variant: "destructive" });
    }
    setIsSubmitting(false);
  };

  const handleMarkAsPaid = async () => {
    if (!selectedTagihan || isSubmitting) return;

    setIsSubmitting(true);
    let proof_url = null;
    if (buktiBayarFile) {
      try {
        proof_url = await storageApi.uploadFile(buktiBayarFile, 'tagihan-proofs');
      } catch (uploadError) {
        toast({ title: "Gagal upload bukti", description: uploadError.message, variant: "destructive" });
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const rpcData = await financeApi.payTagihanBulanan(selectedTagihan.id, {
        proof_url: proof_url,
      });

      const generatedNext = !!rpcData?.next_tagihan_id;
      toast({
        title: "🎉 Lunas!",
        description: generatedNext
          ? "Tagihan lunas. Tagihan periode berikutnya otomatis dibuat."
          : "Tagihan telah dipindahkan ke riwayat dan dicatat di pengeluaran.",
      });
      setSelectedTagihan(null);
      setBuktiBayarFile(null);
      unpaidQuery.refresh();
      paidQuery.refresh();
      onDataUpdate();
    } catch (error) {
      toast({ title: "Gagal menandai lunas", description: error.message, variant: "destructive" });
    }
    setIsSubmitting(false);
  };

  const formatDate = (dateString) => new Date(dateString).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

  const handleDelete = async (id) => {
    try {
      await financeApi.deleteTagihanBulanan(id);
      toast({ title: "Tagihan dihapus" });
      unpaidQuery.refresh();
      paidQuery.refresh();
      onDataUpdate();
    } catch (error) {
      toast({ title: "Gagal menghapus", description: error.message, variant: "destructive" });
    }
  }

  const filteredKamarOptions = newTagihan.apartment_location ? tagihanKamarOptions.filter(k => k.lokasi === newTagihan.apartment_location) : [];
  const filteredEditKamarOptions = editForm.apartment_location ? tagihanKamarOptions.filter(k => k.lokasi === editForm.apartment_location) : [];

  // Rooms that already have unpaid tagihan (to disable in the add form)
  const existingUnpaidRooms = useMemo(() => {
    const set = new Set();
    (unpaidQuery.data || []).forEach(t => {
      if (t.apartment_location && t.room_number) {
        set.add(`${t.apartment_location}__${t.room_number}`);
      }
    });
    return set;
  }, [unpaidQuery.data]);

  return (
    <div className="space-y-5">
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogTrigger asChild>
          <Button className="w-full bg-gradient-to-r from-cyan-400 to-blue-500 text-white font-bold py-6 text-base rounded-2xl shadow-lg">
            <PlusCircle className="mr-2 h-5 w-5" /> Tambah Tagihan
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-white">
          <DialogHeader><DialogTitle>Form Tagihan Baru</DialogTitle><DialogDescription>Isi data tagihan baru lalu simpan.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Lokasi Apartemen</label>
              <select value={newTagihan.apartment_location} onChange={(e) => handleInputChange('apartment_location', e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-2 text-gray-900">
                <option value="">Pilih Lokasi</option>
                {lokasiOptions.map((lok, i) => <option key={i} value={lok}>{lok}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Nomor Kamar</label>
              <select value={newTagihan.room_number} onChange={(e) => handleInputChange('room_number', e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-2 text-gray-900" disabled={!newTagihan.apartment_location}>
                <option value="">Pilih Kamar</option>
                {filteredKamarOptions.map((k, i) => {
                  const alreadyAdded = existingUnpaidRooms.has(`${newTagihan.apartment_location}__${k.name}`);
                  return <option key={i} value={k.name} disabled={alreadyAdded}>{k.name}{alreadyAdded ? ' (sudah ada tagihan)' : ''}</option>;
                })}
              </select>
              {newTagihan.room_number && existingUnpaidRooms.has(`${newTagihan.apartment_location}__${newTagihan.room_number}`) && (
                <p className="mt-1 text-xs text-amber-600 font-medium">Kamar ini sudah memiliki tagihan aktif.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Jumlah Tagihan</label>
              <input type="text" placeholder="Rp 0" value={newTagihan.amount} onChange={(e) => handleInputChange('amount', e.target.value)} inputMode="text" className="w-full px-4 py-3 rounded-xl border-2 text-gray-900" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Jatuh Tempo</label>
              <input type="date" value={newTagihan.due_date} onChange={(e) => handleInputChange('due_date', e.target.value)} className="w-full px-4 py-3 rounded-xl border-2 text-gray-900" />
            </div>
            <label className="flex items-center gap-3 rounded-xl border-2 border-cyan-200 bg-cyan-50/60 px-4 py-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!!newTagihan.is_recurring}
                onChange={(e) => handleInputChange('is_recurring', e.target.checked)}
                className="h-4 w-4 accent-blue-600"
              />
              <span className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                <Repeat className="w-4 h-4 text-blue-600" />
                Tagihan rutin tiap bulan
              </span>
            </label>
          </div>
          <DialogFooter><Button onClick={handleAddTagihan} disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-700">Simpan Tagihan</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tab Tagihan Aktif / Lunas */}
      <div className="flex gap-1 p-1 rounded-2xl bg-slate-100">
        <button
          onClick={() => setActiveUnitTab('aktif')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeUnitTab === 'aktif' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Tagihan Aktif
          {unpaidQuery.totalItems > 0 && (
            <span className={`ml-2 inline-flex items-center justify-center min-w-[1.3rem] h-5 rounded-full text-[10px] font-bold px-1 ${activeUnitTab === 'aktif' ? 'bg-blue-100 text-blue-700' : 'bg-slate-300 text-slate-600'}`}>
              {unpaidQuery.totalItems}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveUnitTab('lunas')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeUnitTab === 'lunas' ? 'bg-white shadow text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Lunas
          {paidQuery.totalItems > 0 && (
            <span className={`ml-2 inline-flex items-center justify-center min-w-[1.3rem] h-5 rounded-full text-[10px] font-bold px-1 ${activeUnitTab === 'lunas' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-300 text-slate-600'}`}>
              {paidQuery.totalItems}
            </span>
          )}
        </button>
      </div>

      {activeUnitTab === 'aktif' && (
        <div className="glassmorphic-card p-5 space-y-4">
          {/* Filter bulan untuk Tagihan Aktif */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setUnpaidMonthFilter('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${unpaidMonthFilter === 'all' ? 'bg-blue-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Semua
            </button>
            <button
              type="button"
              onClick={() => setUnpaidMonthFilter('this')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${unpaidMonthFilter === 'this' ? 'bg-blue-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Bulan ini ({monthLabels.thisMonthName})
            </button>
            <button
              type="button"
              onClick={() => setUnpaidMonthFilter('next')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${unpaidMonthFilter === 'next' ? 'bg-blue-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Bulan {monthLabels.nextMonthName}
            </button>
          </div>

          {unpaidQuery.error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{unpaidQuery.error}</span>
            </div>
          )}
          {unpaidQuery.isLoading && (
            <div className="flex justify-center py-8">
              <Spinner className="w-6 h-6 text-blue-500" />
            </div>
          )}
          {!unpaidQuery.isLoading && tagihanList.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">Tidak ada tagihan aktif. 🎉</p>
            </div>
          ) : (
            !unpaidQuery.isLoading && tagihanList.map(tagihan => {
              const isOverdue = tagihan.diffDays < 0;
              const isDueToday = tagihan.diffDays === 0;
              const isDueSoon = tagihan.diffDays > 0 && tagihan.diffDays <= 7;
              let statusClasses = 'bg-green-100 text-green-800';
              if (isOverdue) statusClasses = 'bg-red-100 text-red-800';
              else if (isDueToday) statusClasses = 'bg-orange-100 text-orange-800';
              else if (isDueSoon) statusClasses = 'bg-yellow-100 text-yellow-800';
              const statusLabel = isOverdue ? `Terlambat ${Math.abs(tagihan.diffDays)} hari` : isDueToday ? 'Tempo hari ini' : `${tagihan.diffDays} hari lagi`;
              return (
                <motion.div key={tagihan.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white/50 p-4 rounded-2xl shadow-sm border relative">
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-blue-600 hover:bg-blue-50"
                      onClick={() => openEditDialog(tagihan)}
                      aria-label="Edit tagihan"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" aria-label="Hapus tagihan"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger><AlertDialogContent className="bg-white"><AlertDialogHeader><AlertDialogTitle>Hapus Tagihan?</AlertDialogTitle><AlertDialogDescription>Tindakan ini tidak bisa dibatalkan.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(tagihan.id)} className="bg-red-600">Hapus</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                  </div>
                  <h3 className="font-bold text-gray-900 pr-20">{tagihan.apartment_location} - Kamar {tagihan.room_number}</h3>
                  <p className="text-lg font-bold text-blue-600">{formatRupiah(tagihan.amount)}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <div className={`text-xs font-bold px-2 py-1 rounded-full ${statusClasses} inline-block`}>
                      {statusLabel}
                    </div>
                    {tagihan.is_recurring && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                        <Repeat className="w-3 h-3" /> Rutin Bulanan
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-end mt-3 border-t pt-3">
                    <p className="text-sm text-gray-600"><Calendar className="w-4 h-4 inline" /> {formatDate(tagihan.due_date)}</p>
                    <AlertDialog><AlertDialogTrigger asChild><Button size="sm" className="bg-green-500" onClick={() => setSelectedTagihan(tagihan)}><CheckCircle className="mr-2 h-4 w-4" /> Lunas</Button></AlertDialogTrigger><AlertDialogContent className="bg-white"><AlertDialogHeader><AlertDialogTitle>Konfirmasi Lunas</AlertDialogTitle><AlertDialogDescription>Upload bukti bayar (opsional).</AlertDialogDescription></AlertDialogHeader><div className="py-2"><input type="file" onChange={(e) => setBuktiBayarFile(e.target.files[0])} className="w-full text-sm text-gray-700 file:text-blue-600" /></div>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setSelectedTagihan(null)} disabled={isSubmitting}>Batal</AlertDialogCancel>
                        <AlertDialogAction onClick={handleMarkAsPaid} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700">
                          {isSubmitting ? 'Memproses...' : 'Konfirmasi Lunas'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent></AlertDialog>
                  </div>
                </motion.div>
              )
            })
          )}
          <PaginationControls
            currentPage={unpaidQuery.currentPage}
            totalPages={unpaidQuery.totalPages}
            onPageChange={unpaidQuery.setPage}
            itemsPerPage={unpaidQuery.pageSize}
            totalItems={unpaidQuery.totalItems}
            onPageSizeChange={unpaidQuery.setPageSize}
          />
        </div>
      )}

      {activeUnitTab === 'lunas' && (
        <div className="glassmorphic-card p-5 space-y-4">
          {/* Filter bulan untuk Riwayat Lunas */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPaidMonthFilter('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${paidMonthFilter === 'all' ? 'bg-emerald-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Semua
            </button>
            <button
              type="button"
              onClick={() => setPaidMonthFilter('this')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${paidMonthFilter === 'this' ? 'bg-emerald-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Bulan ini ({monthLabels.thisMonthName})
            </button>
            <button
              type="button"
              onClick={() => setPaidMonthFilter('prev')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${paidMonthFilter === 'prev' ? 'bg-emerald-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Bulan {monthLabels.prevMonthName}
            </button>
          </div>

          {paidQuery.error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{paidQuery.error}</span>
            </div>
          )}
          {paidQuery.isLoading && (
            <div className="flex justify-center py-8">
              <Spinner className="w-6 h-6 text-blue-500" />
            </div>
          )}
          {!paidQuery.isLoading && paidList.length === 0 && (
            <div className="text-center py-8">
              <History className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">Belum ada riwayat lunas.</p>
            </div>
          )}
          {!paidQuery.isLoading && paidList.map(item => (
            <motion.div key={item.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white/50 p-4 rounded-2xl relative">
              <AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="absolute top-2 right-2 h-7 w-7 text-red-500"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger><AlertDialogContent className="bg-white"><AlertDialogHeader><AlertDialogTitle>Hapus Riwayat?</AlertDialogTitle><AlertDialogDescription>Data riwayat lunas ini akan dihapus permanen.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(item.id)} className="bg-red-600">Hapus</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
              <p className="font-bold text-gray-900">{item.apartment_location} - {item.room_number}</p>
              <p className="text-blue-700 font-semibold">{formatRupiah(item.amount)}</p>
              <p className="text-xs text-gray-500">Lunas: {formatLunasDateTimeWib(item.paid_at)}</p>
              <div className="flex justify-between items-center mt-2">
                {item.proof_url && (<Dialog><DialogTrigger asChild><Button variant="link" className="text-blue-600 p-0 h-auto"><Eye className="w-4 h-4 mr-1" /> Lihat Bukti</Button></DialogTrigger><DialogContent className="bg-black/80"><DialogHeader><DialogTitle className="text-white">Bukti Pembayaran</DialogTitle><DialogDescription className="text-gray-300">Pratinjau bukti pembayaran tagihan bulanan.</DialogDescription></DialogHeader><img src={storageApi.resolveFileUrl(item.proof_url)} alt="Bukti bayar" className="rounded-lg" /></DialogContent></Dialog>)}
              </div>
            </motion.div>
          ))}
          <PaginationControls
            currentPage={paidQuery.currentPage}
            totalPages={paidQuery.totalPages}
            onPageChange={paidQuery.setPage}
            itemsPerPage={paidQuery.pageSize}
            totalItems={paidQuery.totalItems}
            onPageSizeChange={paidQuery.setPageSize}
          />
        </div>
      )}

      {/* Edit Tagihan Dialog */}
      <Dialog open={!!editingTagihan} onOpenChange={(open) => { if (!open) setEditingTagihan(null); }}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>Edit Tagihan Unit</DialogTitle>
            <DialogDescription>Ubah data tagihan unit lalu simpan perubahan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Lokasi Apartemen</label>
              <select value={editForm.apartment_location} onChange={(e) => handleEditInputChange('apartment_location', e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-2 text-gray-900">
                <option value="">Pilih Lokasi</option>
                {lokasiOptions.map((lok, i) => <option key={i} value={lok}>{lok}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Nomor Kamar</label>
              <select value={editForm.room_number} onChange={(e) => handleEditInputChange('room_number', e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-2 text-gray-900 disabled:bg-slate-100 disabled:text-slate-500 cursor-not-allowed" disabled>
                <option value="">Pilih Kamar</option>
                {filteredEditKamarOptions.map((k, i) => <option key={i} value={k.name}>{k.name}</option>)}
              </select>
              <p className="mt-1 text-xs text-slate-500">Nomor kamar tidak bisa diubah. Hapus dan buat tagihan baru jika perlu ganti kamar.</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Jumlah Tagihan</label>
              <input type="text" placeholder="Rp 0" value={editForm.amount} onChange={(e) => handleEditInputChange('amount', e.target.value)} inputMode="text" className="w-full px-4 py-3 rounded-xl border-2 text-gray-900" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Jatuh Tempo</label>
              <input type="date" value={editForm.due_date} onChange={(e) => handleEditInputChange('due_date', e.target.value)} className="w-full px-4 py-3 rounded-xl border-2 text-gray-900" />
            </div>
            <label className="flex items-center gap-3 rounded-xl border-2 border-cyan-200 bg-cyan-50/60 px-4 py-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!!editForm.is_recurring}
                onChange={(e) => handleEditInputChange('is_recurring', e.target.checked)}
                className="h-4 w-4 accent-blue-600"
              />
              <span className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                <Repeat className="w-4 h-4 text-blue-600" />
                Tagihan rutin tiap bulan
              </span>
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingTagihan(null)} disabled={isSubmitting}>Batal</Button>
            <Button onClick={handleSaveEdit} disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit success popup */}
      <AlertDialog open={editSuccessOpen} onOpenChange={setEditSuccessOpen}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-emerald-700">
              <CheckCircle className="w-5 h-5" /> Perubahan Tersimpan
            </AlertDialogTitle>
            <AlertDialogDescription>
              Data tagihan unit berhasil diperbarui.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className="bg-emerald-600 hover:bg-emerald-700">OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
};

const getFeeRangeToday = () => {
  const t = startOfDay(new Date());
  const d = format(t, 'yyyy-MM-dd');
  return { from: d, to: d };
};
const getFeeRangeYesterday = () => {
  const y = subDays(startOfDay(new Date()), 1);
  const d = format(y, 'yyyy-MM-dd');
  return { from: d, to: d };
};
const getFeeRangeLast7Days = () => {
  const end = startOfDay(new Date());
  const start = subDays(end, 6);
  return { from: format(start, 'yyyy-MM-dd'), to: format(end, 'yyyy-MM-dd') };
};
const getFeeRangeThisMonth = () => {
  const now = new Date();
  return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: format(endOfMonth(now), 'yyyy-MM-dd') };
};

const TagihanFee = ({ onDataUpdate }) => {
  const [unpaidFees, setUnpaidFees] = useState([]);
  const [showHistory, setShowHistory] = useState(true);
  const [uploadFile, setUploadFile] = useState(null);
  const [feeDateFrom, setFeeDateFrom] = useState(() => getFeeRangeToday().from);
  const [feeDateTo, setFeeDateTo] = useState(() => getFeeRangeToday().to);
  const [feePreset, setFeePreset] = useState('today');
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [modalMarketing, setModalMarketing] = useState(null);
  const [pendingPayAction, setPendingPayAction] = useState(null); // { type: 'single'|'all', marketingName, transactions: [], totalFee }
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  /** Urutan daftar marketing & transaksi per tanggal check-in */
  const [feeDateOrder, setFeeDateOrder] = useState('newest'); // 'newest' | 'oldest'
  const [activeFeeTab, setActiveFeeTab] = useState('aktif'); // 'aktif' | 'lunas'
  const feeHistorySectionRef = useRef(null);

  // Memoize filters for paginated riwayat lunas query
  const paidFeesFilters = useMemo(() => ({
    ...(feeDateFrom ? { paid_date_from: { op: 'gte', value: feeDateFrom, column: 'paid_date' } } : {}),
    ...(feeDateTo ? { paid_date_to: { op: 'lte', value: feeDateTo, column: 'paid_date' } } : {}),
  }), [feeDateFrom, feeDateTo]);

  // Paginated query for riwayat fee lunas
  const {
    data: paidFees,
    totalItems: paidFeesTotalItems,
    totalPages: paidFeesTotalPages,
    currentPage: paidFeesCurrentPage,
    pageSize: paidFeesPageSize,
    isLoading: paidFeesLoading,
    error: paidFeesError,
    setPage: setPaidFeesPage,
    setPageSize: setPaidFeesPageSize,
    refresh: refreshPaidFees,
  } = usePaginatedQuery({
    table: 'tagihan_fee_lunas',
    select: '*',
    pageSize: 10,
    orderBy: 'paid_at',
    ascending: false,
    filters: paidFeesFilters,
    enabled: true,
  });

  const formatRupiah = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

  const applyFeePreset = useCallback((preset) => {
    let r;
    if (preset === 'today') r = getFeeRangeToday();
    else if (preset === 'yesterday') r = getFeeRangeYesterday();
    else if (preset === 'last7') r = getFeeRangeLast7Days();
    else if (preset === 'thisMonth') r = getFeeRangeThisMonth();
    else return;
    setFeeDateFrom(r.from);
    setFeeDateTo(r.to);
    setFeePreset(preset);
  }, []);

  const showFeeDateRange =
    feePreset === 'last7' ||
    feePreset === 'thisMonth' ||
    (feePreset === 'custom' && feeDateFrom !== feeDateTo);

  const loadData = useCallback(async () => {
    const startTime = startOfDay(new Date(feeDateFrom));
    const endTimeExclusive = addDays(startOfDay(new Date(feeDateTo)), 1);

    try {
      const transactionsData = await transactionsApi.list({
        startDate: startTime.toISOString(),
        endDate: endTimeExclusive.toISOString(),
        select: 'id,marketing_name,marketing_fee,customer_name,apartment_location,checkin_at'
      });
      const transactions = transactionsData?.data || transactionsData || [];

      const txIds = transactions.map((t) => t.id).filter((id) => id != null);

      let paidTransactionIds = new Set();
      if (txIds.length > 0) {
        // Note: Backend needs to provide an endpoint for paid fee items
        // For now, we'll use the finance API to check unpaid fees
        const unpaidFees = await financeApi.listFeeUnpaid({
          startDate: startTime.toISOString(),
          endDate: endTimeExclusive.toISOString(),
        });
        // If a transaction is in unpaid fees, it's not paid yet
        const unpaidTxIds = new Set((unpaidFees || []).flatMap(f => (f.transactions || []).map(t => t.transaction_id)));
        paidTransactionIds = new Set(txIds.filter(id => !unpaidTxIds.has(id)));
      }

      const marketingSummary = transactions.reduce((acc, curr) => {
        if (!curr.marketing_name || !curr.marketing_fee || curr.marketing_fee <= 0) {
          return acc;
        }

        const feeAmount = Number(curr.marketing_fee);
        if (!acc[curr.marketing_name]) {
          acc[curr.marketing_name] = { nama: curr.marketing_name, count: 0, totalFee: 0, transactions: [] };
        }
        if (paidTransactionIds.has(curr.id)) {
          return acc;
        }
        acc[curr.marketing_name].count += 1;
        acc[curr.marketing_name].totalFee += feeAmount;
        acc[curr.marketing_name].transactions.push({
          transaction_id: curr.id,
          customer: curr.customer_name,
          location: curr.apartment_location,
          fee: feeAmount,
          checkin_at: curr.checkin_at,
        });
        return acc;
      }, {});

      const unpaidFeeArray = Object.values(marketingSummary).filter(fee => fee.count > 0);
      setUnpaidFees(unpaidFeeArray);
    } catch (error) {
      console.error('Failed to load fee data:', error);
    }
  }, [feeDateFrom, feeDateTo]);

  const tagihanRealtimeDebounceRef = useRef(null);
  const debouncedLoadData = useCallback(() => {
    if (tagihanRealtimeDebounceRef.current) clearTimeout(tagihanRealtimeDebounceRef.current);
    tagihanRealtimeDebounceRef.current = setTimeout(() => loadData(), 1500);
  }, [loadData]);

  useEffect(() => {
    loadData();
    // Realtime subscription removed - polling will be handled by component refresh
  }, [debouncedLoadData, refreshPaidFees]);

  const openPayModal = (fee) => {
    setModalMarketing(fee);
    setIsPayModalOpen(true);
    setUploadFile(null);
  };

  const requestConfirmPay = ({ type, marketingName, transactions }) => {
    const totalFee = (transactions || []).reduce((sum, t) => sum + Number(t.fee || 0), 0);
    setPendingPayAction({ type, marketingName, transactions, totalFee });
    setConfirmOpen(true);
  };

  const executePay = async () => {
    if (!pendingPayAction || isSubmitting) return;
    const { marketingName, transactions } = pendingPayAction;

    setIsSubmitting(true);
    try {
      let proof_url = null;
      if (uploadFile) {
        try {
          proof_url = await storageApi.uploadFile(uploadFile, 'fee-proofs');
        } catch (uploadError) {
          toast({ title: "Gagal upload bukti", description: uploadError.message, variant: "destructive" });
          setIsSubmitting(false);
          return;
        }
      }

      const transactionIds = (transactions || []).map((t) => t.transaction_id);
      const rpcData = await financeApi.payFeeItems({
        marketing_name: marketingName,
        transaction_ids: transactionIds,
        proof_url: proof_url,
      });

      const inserted = rpcData?.items_inserted ?? transactions.length;
      toast({ title: "Pembayaran fee berhasil ✅", description: `${marketingName} • ${inserted} customer` });

      setConfirmOpen(false);
      setPendingPayAction(null);
      setUploadFile(null);
      setIsPayModalOpen(false);
      setModalMarketing(null);
      setShowHistory(true);
      setActiveFeeTab('lunas');
      await loadData();
      refreshPaidFees();
      requestAnimationFrame(() => {
        feeHistorySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      onDataUpdate();
    } catch (error) {
      toast({ title: "Gagal menyimpan pembayaran", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await financeApi.deleteFeeLunas(id);
      toast({ title: "Riwayat fee dihapus" });
      refreshPaidFees();
      onDataUpdate();
    } catch (error) {
      toast({ title: "Gagal menghapus", description: error.message, variant: "destructive" });
    }
  }

  const handleShare = async (item) => {
    let details = (item.transactions_detail || item.transactions || []).map((t, i) => `${i + 1}. ${t.customer} - ${t.location}`).join('\n');
    const totalFee = item.total_fee ?? item.totalFee ?? 0;
    const customerCount = item.customer_count ?? item.count ?? 0;
    const marketingName = item.marketing_name ?? item.nama ?? 'Unknown';
    const paidAt = item.paid_at ? `\n\nLunas: ${formatLunasDateTimeWib(item.paid_at)}` : '';

    const message = `*Rincian Fee*\n-------------------\n*Marketing:* ${marketingName}\n*Total Fee:* ${formatRupiah(totalFee)}\n*Jumlah Customer:* ${customerCount} orang\n\n*Detail Customer:*\n${details}${paidAt}`;

    try {
      await navigator.clipboard.writeText(message);
      toast({
        title: "Pesan disalin!",
        description: "Buka WhatsApp, tempel pesan, dan lampirkan bukti bayar jika ada.",
      });
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank');
    } catch (error) {
      toast({ title: "Gagal membagikan", variant: "destructive" });
    }
  };

  const feeRangeLabel = useMemo(() => {
    if (feeDateFrom === feeDateTo) return feeDateFrom;
    return `${feeDateFrom} – ${feeDateTo}`;
  }, [feeDateFrom, feeDateTo]);

  const totalUnpaidFee = useMemo(
    () => unpaidFees.reduce((sum, fee) => sum + Number(fee.totalFee || 0), 0),
    [unpaidFees]
  );

  const handleShareUnpaidFee = async (fee) => {
    const details = (fee.transactions || [])
      .map((t, i) => `${i + 1}. ${t.customer} - ${t.location}`)
      .join('\n');
    const message = `*Tagihan Fee (Belum Lunas)*\n-------------------\n*Marketing:* ${fee.nama}\n*Periode:* ${feeRangeLabel}\n*Total Fee:* ${formatRupiah(fee.totalFee)}\n*Jumlah Customer:* ${fee.count} orang\n\n*Detail Customer:*\n${details}`;

    try {
      await navigator.clipboard.writeText(message);
      toast({
        title: 'Pesan disalin!',
        description: 'Buka WhatsApp, tempel pesan, lalu kirim.',
      });
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank');
    } catch {
      toast({ title: 'Gagal membagikan', variant: 'destructive' });
    }
  };

  const processedFees = useMemo(() => {
    const txTime = (t) => {
      const x = t?.checkin_at ? new Date(t.checkin_at).getTime() : 0;
      return Number.isFinite(x) ? x : 0;
    };
    let result = unpaidFees.map((f) => ({
      ...f,
      transactions: [...(f.transactions || [])].sort((a, b) =>
        feeDateOrder === 'newest' ? txTime(b) - txTime(a) : txTime(a) - txTime(b)
      ),
    }));

    if (searchTerm) {
      result = result.filter((f) => f.nama.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    const groupKey = (f) => {
      const times = (f.transactions || []).map(txTime).filter((n) => n > 0);
      if (!times.length) return 0;
      return feeDateOrder === 'newest' ? Math.max(...times) : Math.min(...times);
    };
    result.sort((a, b) => (feeDateOrder === 'newest' ? groupKey(b) - groupKey(a) : groupKey(a) - groupKey(b)));

    return result;
  }, [unpaidFees, searchTerm, feeDateOrder]);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-600 to-cyan-500 p-6 rounded-2xl text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-xl font-black tracking-tight uppercase">Tagihan Fee Marketing</h1>
          <p className="text-blue-100 text-xs mt-1">Kelola dan bayar komisi marketing secara kolektif.</p>
        </div>
      </div>

      {/* Tab Fee Aktif / Lunas */}
      <div className="flex gap-1 p-1 rounded-2xl bg-slate-100">
        <button
          onClick={() => setActiveFeeTab('aktif')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeFeeTab === 'aktif' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Tagihan Aktif
          {processedFees.length > 0 && (
            <span className={`ml-2 inline-flex items-center justify-center min-w-[1.3rem] h-5 rounded-full text-[10px] font-bold px-1 ${activeFeeTab === 'aktif' ? 'bg-blue-100 text-blue-700' : 'bg-slate-300 text-slate-600'}`}>
              {processedFees.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveFeeTab('lunas')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeFeeTab === 'lunas' ? 'bg-white shadow text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Lunas
          {paidFeesTotalItems > 0 && (
            <span className={`ml-2 inline-flex items-center justify-center min-w-[1.3rem] h-5 rounded-full text-[10px] font-bold px-1 ${activeFeeTab === 'lunas' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-300 text-slate-600'}`}>
              {paidFeesTotalItems}
            </span>
          )}
        </button>
      </div>

      {activeFeeTab === 'aktif' && (
        <div className="glassmorphic-card p-5 space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold text-lg text-gray-800 flex items-center gap-2"><Coins className="text-blue-500 shrink-0" /> Tagihan Fee ({formatRupiah(totalUnpaidFee)})</h2>
            </div>
            <p className="text-xs text-slate-500">Filter menurut tanggal check-in transaksi.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant={feePreset === 'today' ? 'default' : 'outline'} size="sm" className="h-8 text-xs rounded-lg" onClick={() => applyFeePreset('today')}>Hari ini</Button>
              <Button type="button" variant={feePreset === 'yesterday' ? 'default' : 'outline'} size="sm" className="h-8 text-xs rounded-lg" onClick={() => applyFeePreset('yesterday')}>Kemarin</Button>
              <Button type="button" variant={feePreset === 'last7' ? 'default' : 'outline'} size="sm" className="h-8 text-xs rounded-lg" onClick={() => applyFeePreset('last7')}>7 hari terakhir</Button>
              <Button type="button" variant={feePreset === 'thisMonth' ? 'default' : 'outline'} size="sm" className="h-8 text-xs rounded-lg" onClick={() => applyFeePreset('thisMonth')}>Bulan ini</Button>
            </div>
            {showFeeDateRange ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
                  <span className="text-xs font-medium text-slate-600 shrink-0">Dari</span>
                  <input
                    type="date"
                    value={feeDateFrom}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFeePreset('custom');
                      setFeeDateFrom(v);
                      if (v > feeDateTo) setFeeDateTo(v);
                    }}
                    className="min-w-0 flex-1 border-0 bg-transparent text-sm text-gray-900 outline-none"
                  />
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
                  <span className="text-xs font-medium text-slate-600 shrink-0">Sampai</span>
                  <input
                    type="date"
                    value={feeDateTo}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFeePreset('custom');
                      setFeeDateTo(v);
                      if (v < feeDateFrom) setFeeDateFrom(v);
                    }}
                    className="min-w-0 flex-1 border-0 bg-transparent text-sm text-gray-900 outline-none"
                  />
                </label>
              </div>
            ) : (
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
                <span className="text-xs font-medium text-slate-600 shrink-0">Tanggal</span>
                <input
                  type="date"
                  value={feeDateFrom}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFeePreset('custom');
                    setFeeDateFrom(v);
                    setFeeDateTo(v);
                  }}
                  className="min-w-0 flex-1 border-0 bg-transparent text-sm text-gray-900 outline-none"
                />
              </label>
            )}
          </div>

          {/* Search & Sort UI */}
          <div className="grid grid-cols-2 gap-3 pb-2 border-b border-slate-100">
            <div className="relative group">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input
                type="text"
                placeholder="Cari marketing..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-xs bg-slate-50 border-2 border-slate-200 rounded-xl pl-8 pr-2 py-2.5 outline-none focus:border-blue-400 focus:bg-white transition-all shadow-sm"
              />
            </div>
            <select
              value={feeDateOrder}
              onChange={(e) => setFeeDateOrder(e.target.value)}
              className="text-xs bg-slate-50 border-2 border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-blue-400"
            >
              <option value="newest">Tanggal terbaru</option>
              <option value="oldest">Tanggal terlama</option>
            </select>
          </div>

          {processedFees.length === 0 ? (
            <div className="text-center py-8">
              <Coins className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">
                {searchTerm ? 'Marketing tidak ditemukan.' : 'Semua fee pada periode ini sudah lunas! 🎉'}
              </p>
            </div>
          ) : (
            processedFees.map((fee) => (
              <motion.div key={fee.nama} layout className="bg-white/50 border p-4 rounded-2xl relative">
                <Button
                  size="icon"
                  onClick={() => handleShareUnpaidFee(fee)}
                  className="absolute top-3 right-3 h-7 w-7 bg-green-500"
                >
                  <Share2 className="w-4 h-4" />
                </Button>
                <h3 className="font-bold text-gray-900 text-lg">{fee.nama}</h3>
                <p className="text-gray-700">Jumlah Customer: <span className="font-semibold text-gray-900">{fee.count} orang</span></p>
                <p className="text-gray-700">Total Fee: <span className="font-bold text-xl text-blue-600">{formatRupiah(fee.totalFee)}</span></p>
                <div className="mt-4 border-t pt-4">
                  <Button
                    size="sm"
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    onClick={() => openPayModal(fee)}
                  >
                    Bayar Fee {fee.nama}
                  </Button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* Modal pembayaran per customer */}
      <Dialog open={isPayModalOpen} onOpenChange={(open) => { setIsPayModalOpen(open); if (!open) { setModalMarketing(null); setUploadFile(null); } }}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>Bayar Fee Marketing</DialogTitle>
            <DialogDescription>
              {modalMarketing?.nama ? `Marketing: ${modalMarketing.nama} • Periode: ${feeRangeLabel}` : 'Pilih marketing untuk membayar fee.'}
            </DialogDescription>
          </DialogHeader>

          {modalMarketing?.transactions?.length ? (
            <div className="space-y-3">
              <div className="rounded-xl border bg-slate-50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-700">Sisa customer</span>
                  <span className="font-bold text-slate-900">{modalMarketing.transactions.length}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-slate-700">Total sisa fee</span>
                  <span className="font-bold text-blue-700">{formatRupiah(modalMarketing.totalFee)}</span>
                </div>
              </div>

              <div className="space-y-2">
                {modalMarketing.transactions.map((t) => (
                  <div key={t.transaction_id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{t.customer}</p>
                      <p className="truncate text-xs text-slate-600">{t.location}</p>
                      <p className="text-xs font-semibold text-blue-700">{formatRupiah(t.fee)}</p>
                    </div>
                    <Button
                      size="sm"
                      className="shrink-0 bg-green-600 hover:bg-green-700"
                      onClick={() => requestConfirmPay({ type: 'single', marketingName: modalMarketing.nama, transactions: [t] })}
                    >
                      Bayar
                    </Button>
                  </div>
                ))}
              </div>

              <div className="space-y-2 border-t pt-3">
                <label className="block text-sm font-semibold text-slate-700">Bukti bayar (opsional)</label>
                <input type="file" accept="image/*" onChange={(e) => setUploadFile(e.target.files[0])} className="w-full text-sm text-gray-700 file:text-blue-600" />
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  onClick={() => requestConfirmPay({ type: 'all', marketingName: modalMarketing.nama, transactions: modalMarketing.transactions })}
                >
                  Bayar Semua
                </Button>
              </div>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-slate-600">Tidak ada customer yang belum dibayar.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Konfirmasi pembayaran */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi Pembayaran</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda sudah bayar fee untuk marketing {pendingPayAction?.marketingName || '-'}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting} onClick={() => { setConfirmOpen(false); setPendingPayAction(null); }}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={executePay} disabled={isSubmitting} className="bg-green-600">
              {isSubmitting ? 'Memproses...' : 'Bayar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {activeFeeTab === 'lunas' && (
        <div ref={feeHistorySectionRef} className="glassmorphic-card p-5 space-y-4">
          {paidFeesError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{paidFeesError}</span>
            </div>
          )}
          {paidFeesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="w-6 h-6 text-blue-500" />
            </div>
          ) : paidFees.length > 0 ? (
            <>
              {paidFees.map(item => (
                <motion.div key={item.id} layout className="bg-white/50 border p-4 rounded-2xl relative">
                  <AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="absolute top-2 right-2 h-7 w-7 text-red-500"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger><AlertDialogContent className="bg-white"><AlertDialogHeader><AlertDialogTitle>Hapus Riwayat?</AlertDialogTitle><AlertDialogDescription>Riwayat fee lunas ini akan dihapus permanen.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(item.id)} className="bg-red-600">Hapus</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                  <p className="font-bold text-lg text-gray-900">{item.marketing_name}</p>
                  <p className="text-blue-700 font-semibold">{formatRupiah(item.total_fee)} ({item.customer_count} CS)</p>
                  <p className="text-xs text-gray-500">Lunas: {formatLunasDateTimeWib(item.paid_at)}</p>
                  <div className="flex gap-2 items-center mt-2">
                    {item.proof_url && (<Dialog><DialogTrigger asChild><Button variant="link" className="text-blue-600 p-0 h-auto"><Eye className="w-4 h-4 mr-1" />Lihat Bukti</Button></DialogTrigger><DialogContent className="bg-black/80"><DialogHeader><DialogTitle className="text-white">Bukti Pembayaran Fee</DialogTitle><DialogDescription className="text-gray-300">Pratinjau bukti pembayaran fee marketing.</DialogDescription></DialogHeader><img src={storageApi.resolveFileUrl(item.proof_url)} alt={`Bukti bayar ${item.marketing_name}`} className="rounded-lg w-full" /></DialogContent></Dialog>)}
                    <Button size="icon" onClick={() => handleShare(item)} className="h-7 w-7 bg-green-500"><Share2 className="w-4 h-4" /></Button>
                  </div>
                </motion.div>
              ))}
              <PaginationControls
                currentPage={paidFeesCurrentPage}
                totalPages={paidFeesTotalPages}
                onPageChange={setPaidFeesPage}
                itemsPerPage={paidFeesPageSize}
                totalItems={paidFeesTotalItems}
                onPageSizeChange={setPaidFeesPageSize}
              />
            </>
          ) : (
            <div className="text-center py-8">
              <History className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">Belum ada riwayat lunas untuk periode ini.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Export Filter Modal Component
const ExportFilterModal = ({ open, onOpenChange, onExport, categories, locations }) => {
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [includeUncategorized, setIncludeUncategorized] = useState(true);

  const handleCategoryToggle = (cat) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const handleLocationToggle = (loc) => {
    setSelectedLocations(prev =>
      prev.includes(loc) ? prev.filter(l => l !== loc) : [...prev, loc]
    );
  };

  const handleExport = () => {
    onExport({
      categories: selectedCategories,
      locations: selectedLocations,
      dateFrom,
      dateTo,
      includeUncategorized
    });
    onOpenChange(false);
  };

  const selectAllCategories = () => setSelectedCategories([...categories]);
  const clearAllCategories = () => setSelectedCategories([]);
  const selectAllLocations = () => setSelectedLocations([...locations]);
  const clearAllLocations = () => setSelectedLocations([]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Download className="w-5 h-5" /> Export Pengeluaran</DialogTitle>
          <DialogDescription>Pilih filter untuk data yang ingin diexport ke Excel.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Periode */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Periode</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Dari</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full px-3 py-2 rounded-xl border-2 text-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Sampai</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full px-3 py-2 rounded-xl border-2 text-gray-900" />
              </div>
            </div>
          </div>

          {/* Kategori */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold text-gray-700">Kategori</label>
              <div className="flex gap-2">
                <button type="button" onClick={selectAllCategories} className="text-xs text-blue-600 hover:underline">Pilih Semua</button>
                <button type="button" onClick={clearAllCategories} className="text-xs text-gray-500 hover:underline">Hapus</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <button key={cat} type="button" onClick={() => handleCategoryToggle(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${selectedCategories.includes(cat) ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                  {cat}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 mt-2 text-sm text-gray-600">
              <input type="checkbox" checked={includeUncategorized} onChange={(e) => setIncludeUncategorized(e.target.checked)} className="rounded" />
              Sertakan data tanpa kategori (lama)
            </label>
          </div>

          {/* Lokasi */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold text-gray-700">Lokasi Apartemen</label>
              <div className="flex gap-2">
                <button type="button" onClick={selectAllLocations} className="text-xs text-blue-600 hover:underline">Pilih Semua</button>
                <button type="button" onClick={clearAllLocations} className="text-xs text-gray-500 hover:underline">Hapus</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {locations.map(loc => (
                <button key={loc} type="button" onClick={() => handleLocationToggle(loc)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${selectedLocations.includes(loc) ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                  {loc}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={handleExport} className="bg-green-600 hover:bg-green-700">
            <Download className="w-4 h-4 mr-2" /> Export Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Pengeluaran Unit Component - Screen untuk melihat pengeluaran per unit
const PengeluaranUnit = ({ onDataUpdate }) => {
  const [lokasiOptions, setLokasiOptions] = useState([]);
  const [kamarOptions, setKamarOptions] = useState([]);
  const [selectedLokasi, setSelectedLokasi] = useState('');
  const [selectedKamar, setSelectedKamar] = useState('');
  const [startDate, setStartDate] = useState(() => getDefaultDateRange().startDate);
  const [endDate, setEndDate] = useState(() => getDefaultDateRange().endDate);
  const [showLoadingTimeout, setShowLoadingTimeout] = useState(false);

  const loadOptions = useCallback(async () => {
    try {
      const lokasiData = await locationsApi.list();
      if (lokasiData) setLokasiOptions(lokasiData.map(l => l.name));

      const kamarData = await locationsApi.listRoomsWithOccupancy();
      if (kamarData) setKamarOptions(kamarData);
    } catch (error) {
      console.error('Failed to load options:', error);
    }
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  // Memoize filters for paginated query (Requirement 4.4 - filter changes reset to page 1)
  // Hanya tampilkan pengeluaran yang memiliki apartment_location (tidak null)
  const pengeluaranFilters = useMemo(() => ({
    apartment_location_not_null: { op: 'not_is_null', value: null, column: 'apartment_location' },
    ...(startDate ? { tanggal_from: { op: 'gte', value: startDate, column: 'tanggal' } } : {}),
    ...(endDate ? { tanggal_to: { op: 'lte', value: endDate, column: 'tanggal' } } : {}),
    ...(selectedLokasi ? { apartment_location: { op: 'eq', value: selectedLokasi } } : {}),
    ...(selectedKamar ? { room_number: { op: 'eq', value: selectedKamar } } : {}),
  }), [startDate, endDate, selectedLokasi, selectedKamar]);

  // Server-side paginated query for detail list (Requirement 4.1, 4.2)
  const {
    data: expenses,
    totalItems,
    totalPages,
    currentPage,
    pageSize,
    isLoading,
    error: queryError,
    setPage,
    setPageSize,
    refresh: refreshExpenses,
  } = usePaginatedQuery({
    table: 'pengeluaran',
    select: '*',
    pageSize: 10,
    orderBy: 'tanggal',
    ascending: false,
    filters: pengeluaranFilters,
  });

  // Server-side category summary via RPC — masih dipakai untuk CategoryDetailPopup
  const {
    data: categorySummary,
    isLoading: isCategoryLoading,
    error: categoryError,
    refresh: refreshCategorySummary,
  } = useCategorySummary({
    lokasi: selectedLokasi || undefined,
    kamar: selectedKamar || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  // Loading timeout indicator (Requirement 4.6 - 10s timeout display)
  useEffect(() => {
    if (!isLoading) {
      setShowLoadingTimeout(false);
      return;
    }
    setShowLoadingTimeout(false);
    const timer = setTimeout(() => setShowLoadingTimeout(true), 10000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // Realtime refresh removed - polling will be handled by component refresh
  useEffect(() => {
    // No-op: Realtime subscription removed
  }, [refreshExpenses, refreshCategorySummary, onDataUpdate]);

  const filteredKamarOptions = selectedLokasi ? kamarOptions.filter(k => k.lokasi === selectedLokasi) : [];

  // Popup state for CategoryDetailPopup (Requirement 6.1, 6.6).
  // Parent state (filters, currentPage) is intentionally untouched while
  // the popup is open; closing only flips popup-local state.
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [isCategoryPopupOpen, setIsCategoryPopupOpen] = useState(false);

  // Snapshot filters at click time so popup queries stay stable while open.
  const popupFilters = useMemo(
    () => ({
      lokasi: selectedLokasi || undefined,
      kamar: selectedKamar || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
    [selectedLokasi, selectedKamar, startDate, endDate]
  );

  const handleCategoryClick = (cat) => {
    if (!cat) return;
    const rawCategory = cat.category;
    // Use the raw_category from RPC (actual DB value) for exact match query.
    // Fall back to category field if raw_category not available.
    const dbValue = cat.raw_category !== undefined ? cat.raw_category : rawCategory;
    const label =
      rawCategory && String(rawCategory).trim() !== ''
        ? rawCategory
        : 'Lainnya';
    setSelectedCategory({
      category: dbValue,
      label,
      totalAmount: Number(cat.total_amount || 0),
    });
    setIsCategoryPopupOpen(true);
  };

  return (
    <div className="space-y-5">
      <Button className="w-full bg-gradient-to-r from-orange-400 to-red-500 text-white font-bold py-6 text-base rounded-2xl shadow-lg" onClick={() => window.location.hash = '#pengeluaran'}>
        <PlusCircle className="mr-2 h-5 w-5" /> Catat Pengeluaran
      </Button>

      <div className="glassmorphic-card p-5 space-y-4">
        <h2 className="font-bold text-lg text-gray-800 flex items-center gap-2"><Building2 className="w-5 h-5 text-blue-500" /> Filter Unit</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Lokasi</label>
            <select value={selectedLokasi} onChange={(e) => { setSelectedLokasi(e.target.value); setSelectedKamar(''); }} className="w-full px-3 py-2.5 rounded-xl border-2 text-gray-900 bg-white">
              <option value="">Semua Lokasi</option>
              {lokasiOptions.map(loc => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Kamar</label>
            <select value={selectedKamar} onChange={(e) => setSelectedKamar(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-2 text-gray-900 bg-white" disabled={!selectedLokasi}>
              <option value="">{selectedLokasi ? 'Semua Kamar' : 'Pilih Lokasi Dulu'}</option>
              {filteredKamarOptions.map(k => <option key={k.name} value={k.name}>{k.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Dari Tanggal</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-2 text-gray-900" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Sampai Tanggal</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-2 text-gray-900" />
          </div>
        </div>
      </div>

      {/* Detail Pengeluaran with server-side pagination */}
      <div className="glassmorphic-card p-5 space-y-4">
        <h2 className="font-bold text-lg text-gray-800">Detail Pengeluaran</h2>

        {/* Error message (Requirement 4 - error handling) */}
        {queryError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{queryError}</span>
          </div>
        )}

        {/* Loading indicator with 10s timeout display (Requirement 4.6) */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Spinner className="w-6 h-6 text-blue-500" />
            {showLoadingTimeout && (
              <p className="text-xs text-gray-500">Memuat data lebih lama dari biasanya...</p>
            )}
          </div>
        )}

        {/* Empty state (Requirement 7.7) */}
        {!isLoading && !queryError && expenses.length === 0 && (
          <div className="text-center py-8">
            <Coins className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">Tidak ada data untuk filter ini</p>
          </div>
        )}

        {/* Expense list */}
        {!isLoading && expenses.length > 0 && (
          expenses.map(expense => (
            <motion.div key={expense.id} layout className="bg-white/50 p-4 rounded-2xl shadow-sm border">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-gray-900">{expense.nama_pengeluaran}</h3>
                  {expense.category && <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full mt-1">{expense.category}</span>}
                </div>
                <p className="font-bold text-red-600 whitespace-nowrap">{formatRupiah(expense.jumlah)}</p>
              </div>
              <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                <p><Calendar className="w-3 h-3 inline mr-1" />{format(new Date(expense.tanggal), 'dd MMMM yyyy', { locale: idLocale })}</p>
                {expense.apartment_location && <p><Building2 className="w-3 h-3 inline mr-1" />{expense.apartment_location}{expense.room_number ? ` - ${expense.room_number}` : ''}</p>}
              </div>
              {expense.keterangan && <p className="text-sm text-gray-700 mt-2 border-t pt-2">{expense.keterangan}</p>}
            </motion.div>
          ))
        )}

        {/* Pagination controls below detail list (Requirement 4.3) */}
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
          itemsPerPage={pageSize}
          totalItems={totalItems}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Category detail popup (Requirement 6.1, 6.6).
                Closing the popup only updates popup-local state — the parent's
                filter state and currentPage remain untouched. */}
      <CategoryDetailPopup
        open={isCategoryPopupOpen}
        onOpenChange={setIsCategoryPopupOpen}
        category={selectedCategory?.category ?? ''}
        label={selectedCategory?.label}
        totalAmount={selectedCategory?.totalAmount || 0}
        filters={popupFilters}
      />
    </div>
  );
};

const Pengeluaran = ({ onDataUpdate }) => {
  const { user } = useAuth();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Date filter state - default to current month using getDefaultDateRange
  const [startDate, setStartDate] = useState(() => getDefaultDateRange().startDate);
  const [endDate, setEndDate] = useState(() => getDefaultDateRange().endDate);

  // Ringkasan Pengeluaran collapse state - default collapsed
  const [isRingkasanOpen, setIsRingkasanOpen] = useState(false);

  // Popup state for CategoryDetailPopup
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [isCategoryPopupOpen, setIsCategoryPopupOpen] = useState(false);

  // New state for categories and units
  const [categories, setCategories] = useState([]);
  const [lokasiOptions, setLokasiOptions] = useState([]);
  const [kamarOptions, setKamarOptions] = useState([]);
  const [newExpense, setNewExpense] = useState({
    nama_pengeluaran: '',
    jumlah: '',
    tanggal: format(new Date(), 'yyyy-MM-dd'),
    keterangan: '',
    category: '',
    customCategory: '',
    apartment_location: '',
    room_number: ''
  });

  // Export filter state
  const [showExportModal, setShowExportModal] = useState(false);

  // Memoize filters for paginated query
  const pengeluaranFilters = useMemo(() => ({
    ...(startDate ? { tanggal_from: { op: 'gte', value: startDate, column: 'tanggal' } } : {}),
    ...(endDate ? { tanggal_to: { op: 'lte', value: endDate, column: 'tanggal' } } : {}),
  }), [startDate, endDate]);

  // Server-side paginated query
  const {
    data: expenses,
    totalItems,
    totalPages,
    currentPage,
    pageSize,
    isLoading,
    error: queryError,
    setPage,
    setPageSize,
    refresh: refreshExpenses,
  } = usePaginatedQuery({
    table: 'pengeluaran',
    select: '*',
    pageSize: 10,
    orderBy: 'tanggal',
    ascending: false,
    filters: pengeluaranFilters,
  });

  // Server-side category summary for total & ringkasan (covers all pages in date range)
  const {
    data: categorySummary,
    isLoading: isCategoryLoading,
    refresh: refreshCategorySummary,
  } = useCategorySummary({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  // Total from server-side summary (all pages in date range)
  const totalPengeluaran = useMemo(
    () => (categorySummary || []).reduce((sum, c) => sum + Number(c.total_amount || 0), 0),
    [categorySummary]
  );

  // Snapshot filters for popup
  const popupFilters = useMemo(
    () => ({ startDate: startDate || undefined, endDate: endDate || undefined }),
    [startDate, endDate]
  );

  const handleCategoryClick = (cat) => {
    if (!cat) return;
    const rawCategory = cat.category;
    const dbValue = cat.raw_category !== undefined ? cat.raw_category : rawCategory;
    const label = rawCategory && String(rawCategory).trim() !== '' ? rawCategory : 'Lainnya';
    setSelectedCategory({ category: dbValue, label, totalAmount: Number(cat.total_amount || 0) });
    setIsCategoryPopupOpen(true);
  };

  // Format date range label for total display
  const dateRangeLabel = useMemo(() => {
    const fmt = (d) => {
      if (!d) return '';
      try {
        const [y, m, day] = d.split('-');
        return `${parseInt(day)} ${new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date(y, m - 1))} ${y}`;
      } catch { return d; }
    };
    if (startDate && endDate && startDate !== endDate) return `${fmt(startDate)} – ${fmt(endDate)}`;
    if (startDate) return fmt(startDate);
    return fmt(endDate);
  }, [startDate, endDate]);

  const formatRupiahLocal = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value || 0);
  const deformatRupiah = (value) => String(value).replace(/[^0-9]/g, '');

  const loadOptions = useCallback(async () => {
    try {
      const catData = await pengeluaranApi.listCategories();
      if (catData) setCategories(catData.map(c => c.name));

      const lokasiData = await locationsApi.list();
      if (lokasiData) setLokasiOptions(lokasiData.map(l => l.name));

      const kamarData = await locationsApi.listRoomsWithOccupancy();
      if (kamarData) setKamarOptions(kamarData);
    } catch (error) {
      console.error('Failed to load options:', error);
    }
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const handleInputChange = (field, value) => {
    if (field === 'jumlah') {
      const numericValue = deformatRupiah(value);
      setNewExpense(prev => ({ ...prev, [field]: numericValue ? new Intl.NumberFormat('id-ID').format(numericValue) : '' }));
    } else {
      setNewExpense(prev => ({ ...prev, [field]: value }));
    }
  };

  const filteredKamarOptions = newExpense.apartment_location ? kamarOptions.filter(k => k.lokasi === newExpense.apartment_location) : [];

  const handleAddExpense = async () => {
    if (!newExpense.nama_pengeluaran || !newExpense.jumlah || !newExpense.tanggal) {
      toast({ title: "Data tidak lengkap!", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);

    // Determine final category
    const finalCategory = newExpense.category === 'custom' ? newExpense.customCategory : newExpense.category;

    try {
      // If custom category, add to categories table
      if (newExpense.category === 'custom' && newExpense.customCategory) {
        // Note: Backend should handle custom category creation
        setCategories(prev => [...prev, newExpense.customCategory]);
      }

      await pengeluaranApi.create({
        nama_pengeluaran: newExpense.nama_pengeluaran,
        jumlah: deformatRupiah(newExpense.jumlah),
        tanggal: newExpense.tanggal,
        keterangan: newExpense.keterangan || null,
        category: finalCategory || null,
        apartment_location: newExpense.apartment_location || null,
        room_number: newExpense.room_number || null,
      });

      setIsFormOpen(false);
      setNewExpense({
        nama_pengeluaran: '',
        jumlah: '',
        tanggal: format(new Date(), 'yyyy-MM-dd'),
        keterangan: '',
        category: '',
        customCategory: '',
        apartment_location: '',
        room_number: ''
      });
      toast({ title: "✅ Pengeluaran berhasil dicatat!" });
      refreshExpenses();
      refreshCategorySummary();
      onDataUpdate();
    } catch (error) {
      toast({ title: "Gagal menambah pengeluaran", description: error.message, variant: "destructive" });
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (id) => {
    try {
      await pengeluaranApi.delete(id);
      toast({ title: "Pengeluaran dihapus" });
      refreshExpenses();
      refreshCategorySummary();
      onDataUpdate();
    } catch (error) {
      toast({ title: "Gagal menghapus", description: error.message, variant: "destructive" });
    }
  };

  const handleExport = async (filters) => {
    try {
      const params = {
        limit: 10000, // Large limit for export
        ...(filters.dateFrom && { startDate: filters.dateFrom }),
        ...(filters.dateTo && { endDate: filters.dateTo }),
      };

      const result = await pengeluaranApi.list(params);
      const data = result?.data || result || [];

      let filteredData = data;

      // Filter by categories
      if (filters.categories.length > 0) {
        filteredData = filteredData.filter(e =>
          (filters.includeUncategorized && !e.category) || filters.categories.includes(e.category)
        );
      } else if (!filters.includeUncategorized) {
        filteredData = filteredData.filter(e => e.category);
      }

      // Filter by locations
      if (filters.locations.length > 0) {
        filteredData = filteredData.filter(e => !e.apartment_location || filters.locations.includes(e.apartment_location));
      }

      if (filteredData.length === 0) {
        toast({ title: "Tidak ada data untuk diexport", variant: "destructive" });
        return;
      }

      const exportData = filteredData.map(e => ({
        'Tanggal': format(new Date(e.tanggal), 'dd/MM/yyyy'),
        'Kategori': e.category || '-',
        'Lokasi': e.apartment_location || '-',
        'Kamar': e.room_number || '-',
        'Nama Pengeluaran': e.nama_pengeluaran,
        'Jumlah': e.jumlah,
        'Keterangan': e.keterangan || '-'
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Pengeluaran');
      XLSX.writeFile(workbook, `Laporan_Pengeluaran_${filters.dateFrom}_${filters.dateTo}.xlsx`);

      toast({ title: "Export berhasil!", description: `${filteredData.length} data diexport.` });
    } catch (err) {
      toast({ title: "Gagal export", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      <ExportFilterModal
        open={showExportModal}
        onOpenChange={setShowExportModal}
        onExport={handleExport}
        categories={categories}
        locations={lokasiOptions}
      />

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogTrigger asChild>
          <Button className="w-full bg-gradient-to-r from-orange-400 to-red-500 text-white font-bold py-6 text-base rounded-2xl shadow-lg">
            <PlusCircle className="mr-2 h-5 w-5" /> Catat Pengeluaran
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Form Pengeluaran Baru</DialogTitle><DialogDescription>Masukkan detail pengeluaran untuk dicatat ke sistem.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            {/* Kategori */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Kategori <span className="text-gray-400">(opsional)</span></label>
              <select value={newExpense.category} onChange={(e) => handleInputChange('category', e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-2 text-gray-900 bg-white">
                <option value="">Pilih Kategori</option>
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                <option value="custom">+ Kategori Baru</option>
              </select>
              {newExpense.category === 'custom' && (
                <input type="text" placeholder="Nama kategori baru" value={newExpense.customCategory} onChange={(e) => handleInputChange('customCategory', e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-2 text-gray-900 mt-2" />
              )}
            </div>

            {/* Unit Apartemen */}
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
              <label className="block text-sm font-semibold text-amber-800 mb-2"><Building2 className="w-4 h-4 inline mr-1" /> Unit Apartemen <span className="text-gray-400">(opsional)</span></label>
              <div className="grid grid-cols-2 gap-3">
                <select value={newExpense.apartment_location} onChange={(e) => { handleInputChange('apartment_location', e.target.value); handleInputChange('room_number', ''); }} className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white text-gray-900 text-sm">
                  <option value="">Pilih Lokasi</option>
                  {lokasiOptions.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                </select>
                <select value={newExpense.room_number} onChange={(e) => handleInputChange('room_number', e.target.value)} className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white text-gray-900 text-sm" disabled={!newExpense.apartment_location}>
                  <option value="">{newExpense.apartment_location ? 'Pilih Kamar' : '-'}</option>
                  {filteredKamarOptions.map(k => <option key={k.name} value={k.name}>{k.name}</option>)}
                </select>
              </div>
            </div>

            <input type="text" placeholder="Nama Pengeluaran *" value={newExpense.nama_pengeluaran} onChange={(e) => handleInputChange('nama_pengeluaran', e.target.value)} className="w-full px-4 py-3 rounded-xl border-2 text-gray-900" />
            <input type="text" placeholder="Jumlah (Rp) *" value={newExpense.jumlah} onChange={(e) => handleInputChange('jumlah', e.target.value)} inputMode="numeric" className="w-full px-4 py-3 rounded-xl border-2 text-gray-900" />
            <input type="date" value={newExpense.tanggal} onChange={(e) => handleInputChange('tanggal', e.target.value)} className="w-full px-4 py-3 rounded-xl border-2 text-gray-900" />
            <textarea placeholder="Keterangan (opsional)" value={newExpense.keterangan} onChange={(e) => handleInputChange('keterangan', e.target.value)} className="w-full px-4 py-3 rounded-xl border-2 text-gray-900 h-24" />
          </div>
          <DialogFooter><Button onClick={handleAddExpense} disabled={isSubmitting} className="w-full bg-red-500 hover:bg-red-600">{isSubmitting ? 'Menyimpan...' : 'Simpan'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ringkasan Pengeluaran - collapsible, default collapsed, di dalam card Riwayat */}
      <div className="glassmorphic-card p-5 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="font-bold text-lg text-gray-800">Riwayat Pengeluaran</h2>
          <Button size="sm" variant="outline" className="border-green-300 bg-green-100 text-green-800 hover:bg-green-200" onClick={() => setShowExportModal(true)}>
            <Download className="w-4 h-4 mr-1" /> Export
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <label className="absolute -top-2 left-3 bg-white/10 px-1 text-xs text-gray-600">Dari Tanggal</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-2 text-gray-900" />
          </div>
          <div className="relative">
            <label className="absolute -top-2 left-3 bg-white/10 px-1 text-xs text-gray-600">Sampai Tanggal</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-2 text-gray-900" />
          </div>
        </div>

        {/* Ringkasan Pengeluaran - collapsible */}
        <div className="border rounded-xl overflow-hidden">
          <button
            onClick={() => setIsRingkasanOpen(prev => !prev)}
            className="w-full flex justify-between items-center px-4 py-3 bg-white/60 hover:bg-white/80 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-red-500" />
              <span className="font-semibold text-gray-800 text-sm">Ringkasan Pengeluaran</span>
              {dateRangeLabel && <span className="text-xs text-gray-400 hidden sm:inline">— {dateRangeLabel}</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-red-600">{formatRupiahLocal(totalPengeluaran)}</span>
              <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isRingkasanOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>
          <AnimatePresence initial={false}>
            {isRingkasanOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-3 pt-1 space-y-2 border-t bg-white/30">
                  {dateRangeLabel && <p className="text-xs text-gray-400">{dateRangeLabel}</p>}
                  {isCategoryLoading && (
                    <div className="flex justify-center py-3">
                      <Spinner className="w-5 h-5 text-blue-500" />
                    </div>
                  )}
                  {!isCategoryLoading && categorySummary && categorySummary.length > 0 && (
                    <div className="space-y-1.5">
                      {categorySummary.map((cat) => {
                        const lbl = cat.category && String(cat.category).trim() !== '' ? cat.category : 'Lainnya';
                        return (
                          <div
                            key={lbl}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleCategoryClick(cat)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCategoryClick(cat); } }}
                            className="flex justify-between items-center bg-white/50 px-3 py-2 rounded-lg cursor-pointer hover:bg-white/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          >
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-gray-800">{lbl}</span>
                              <span className="text-xs text-gray-500">{cat.transaction_count} transaksi</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900">{formatRupiahLocal(cat.total_amount)}</span>
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!isCategoryLoading && (!categorySummary || categorySummary.length === 0) && (
                    <p className="text-center text-sm text-gray-500 py-2">Tidak ada data untuk periode ini</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Error message */}
        {queryError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{queryError}</span>
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex justify-center py-8">
            <Spinner className="w-6 h-6 text-blue-500" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && expenses.length === 0 && !queryError && (
          <div className="text-center py-8">
            <Coins className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">Tidak ada data untuk filter ini</p>
          </div>
        )}

        {/* Expense list */}
        {!isLoading && expenses.length > 0 && (
          expenses.map(expense => (
            <motion.div key={expense.id} layout className="bg-white/50 p-4 rounded-2xl shadow-sm border relative">
              <AlertDialog>
                <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="absolute top-2 right-2 h-7 w-7 text-red-500"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                <AlertDialogContent className="bg-white"><AlertDialogHeader><AlertDialogTitle>Hapus Pengeluaran?</AlertDialogTitle><AlertDialogDescription>Data pengeluaran ini akan dihapus permanen.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(expense.id)} className="bg-red-600">Hapus</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
              </AlertDialog>
              <div className="flex justify-between items-start">
                <div className="pr-8">
                  <h3 className="font-bold text-gray-900">{expense.nama_pengeluaran}</h3>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {expense.category && <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">{expense.category}</span>}
                    {expense.apartment_location && <span className="inline-block px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">{expense.apartment_location}{expense.room_number ? ` - ${expense.room_number}` : ''}</span>}
                  </div>
                </div>
                <p className="font-bold text-red-600 whitespace-nowrap">{formatRupiahLocal(expense.jumlah)}</p>
              </div>
              <p className="text-xs text-gray-500 mt-1">{format(new Date(expense.tanggal), 'dd MMMM yyyy', { locale: idLocale })}</p>
              {expense.keterangan && <p className="text-sm text-gray-700 mt-2 border-t pt-2">{expense.keterangan}</p>}
            </motion.div>
          ))
        )}

        {/* Pagination controls */}
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
          itemsPerPage={pageSize}
          totalItems={totalItems}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Category detail popup */}
      <CategoryDetailPopup
        open={isCategoryPopupOpen}
        onOpenChange={setIsCategoryPopupOpen}
        category={selectedCategory?.category ?? ''}
        label={selectedCategory?.label}
        totalAmount={selectedCategory?.totalAmount || 0}
        filters={popupFilters}
      />
    </div>
  );
};

export default HalamanTagihan;