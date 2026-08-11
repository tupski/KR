import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Clock, Upload, Search, X, Banknote, Landmark, Wallet } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';
import { resolveStorageUrl } from '@/lib/storageUrl';
import Select from 'react-select';
import { Image as ImageIcon } from 'lucide-react';

// Format date to local date string (YYYY-MM-DD)
const formatDate = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getLocalDate = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const DATE_TODAY = formatDate(getLocalDate());
const YESTERDAY = formatDate(new Date(getLocalDate().getTime() - 86400000));
const SEVEN_DAYS_AGO = formatDate(new Date(getLocalDate().getTime() - 7 * 86400000));
const THIRTY_DAYS_AGO = formatDate(new Date(getLocalDate().getTime() - 30 * 86400000));

const ManajemenDeposit = () => {
  const [tabDeposit, setTabDeposit] = useState('belum');
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);
  const [fileBukti, setFileBukti] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [rooms, setRooms] = useState([]);

  // Filter states
  const [searchName, setSearchName] = useState('');
  const [depositType, setDepositType] = useState('ALL');
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [selectedRooms, setSelectedRooms] = useState([]);
  const [quickDateFilter, setQuickDateFilter] = useState('30hari');
  const [dateFrom, setDateFrom] = useState(THIRTY_DAYS_AGO);
  const [dateTo, setDateTo] = useState(DATE_TODAY);
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [showLocationRoomFilter, setShowLocationRoomFilter] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Reset pagination when filters or tab change
  useEffect(() => {
    setCurrentPage(1);
  }, [tabDeposit, searchName, depositType, selectedLocations, selectedRooms, dateFrom, dateTo]);

  // Quick date filter button click
  const handleQuickDateFilter = (filter) => {
    setQuickDateFilter(filter);
    // Selalu hitung tanggal saat tombol diklik, bukan dari state
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (filter) {
      case 'hariini': {
        const todayStr = formatDate(today);
        setDateFrom(todayStr);
        setDateTo(todayStr);
        break;
      }
      case 'kemarin': {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = formatDate(yesterday);
        setDateFrom(yesterdayStr);
        setDateTo(yesterdayStr);
        break;
      }
      case '7hari': {
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // 7 hari termasuk hari ini
        setDateFrom(formatDate(sevenDaysAgo));
        setDateTo(formatDate(today));
        break;
      }
      case '30hari': {
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29); // 30 hari termasuk hari ini
        setDateFrom(formatDate(thirtyDaysAgo));
        setDateTo(formatDate(today));
        break;
      }
      case 'custom':
        // Keep current dateFrom/dateTo values
        break;
      default:
        break;
    }
  };

  const loadDeposits = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('transactions')
      .select('id, customer_name, room_number, apartment_location, deposit_cash, deposit_transfer, created_at, deposit_returned_at, deposit_refund_proof_url, marketing_name, input_by')
      .or('deposit_cash.gt.0,deposit_transfer.gt.0')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Gagal memuat deposit', description: error.message, variant: 'destructive' });
    } else {
      setDeposits(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDeposits();
  }, [loadDeposits]);

  // Load rooms when locations change
  useEffect(() => {
    if (selectedLocations.length === 0) {
      setRooms([]);
      setSelectedRooms([]);
      return;
    }
    const loaded = async () => {
      let query = supabase.from('nomor_kamar').select('name, lokasi');
      if (selectedLocations.length > 0) {
        query = query.in('lokasi', selectedLocations);
      }
      const { data } = await query.order('name');
      setRooms(data || []);
    };
    loaded();
  }, [selectedLocations]);

  // Available locations for multi-select
  const locationOptions = useMemo(() => {
    const locs = [...new Set(deposits.map((t) => t.apartment_location).filter(Boolean))].sort();
    return [{ value: '', label: 'Semua Lokasi' }, ...locs.map((l) => ({ value: l, label: l }))];
  }, [deposits]);

  // Room options for multi-select (filter by selected locations)
  const roomOptions = useMemo(() => {
    return [...new Set(rooms.map((r) => r.name))].sort().map((r) => ({ value: r, label: r }));
  }, [rooms]);

  // React-select custom styles
  const selectStyles = {
    control: (base) => ({
      ...base,
      minHeight: '36px',
      fontSize: '12px',
      borderRadius: '0.5rem',
    }),
    menu: (base) => ({
      ...base,
      fontSize: '12px',
    }),
    multiValue: (base) => ({
      ...base,
      borderRadius: '0.375rem',
    }),
    placeholder: (base) => ({
      ...base,
      fontSize: '12px',
      color: '#94a3b8',
    }),
  };

  // Handle location change
  const handleLocationChange = (selected) => {
    if (!selected || selected.length === 0) {
      setSelectedLocations([]);
      setSelectedRooms([]);
    } else {
      setSelectedLocations(selected.map((s) => s.value));
      setSelectedRooms([]);
    }
  };

  // Handle room change
  const handleRoomChange = (selected) => {
    setSelectedRooms(selected ? selected.map((s) => s.value) : []);
  };

  const filteredDeposits = useMemo(() => {
    return deposits.filter((t) => {
      // Tab filter
      if (tabDeposit === 'belum' && t.deposit_returned_at !== null) return false;
      if (tabDeposit === 'sudah' && t.deposit_returned_at === null) return false;

      // Name search (customer_name or marketing_name)
      if (searchName.trim()) {
        const search = searchName.trim().toLowerCase();
        const matchCustomer = (t.customer_name || '').toLowerCase().includes(search);
        const matchMarketing = (t.marketing_name || '').toLowerCase().includes(search);
        if (!matchCustomer && !matchMarketing) return false;
      }

      // Deposit type filter
      const hasCash = (t.deposit_cash || 0) > 0;
      const hasTransfer = (t.deposit_transfer || 0) > 0;
      if (depositType === 'TUNAI' && !hasCash) return false;
      if (depositType === 'TRANSFER' && !hasTransfer) return false;

      // Location filter (multi-select)
      if (selectedLocations.length > 0 && !selectedLocations.includes(t.apartment_location)) return false;

      // Room filter (multi-select)
      if (selectedRooms.length > 0 && !selectedRooms.includes(t.room_number)) return false;

      // Date range filter - untuk tab 'belum' gunakan created_at, untuk tab 'sudah' gunakan deposit_returned_at
      if (tabDeposit === 'belum') {
        const comparisonDate = new Date(t.created_at);
        const fromDate = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
        const toDate = dateTo ? new Date(dateTo + 'T23:59:59') : null;
        
        if (fromDate && comparisonDate < fromDate) return false;
        if (toDate && comparisonDate > toDate) return false;
      } else if (tabDeposit === 'sudah') {
        // Pastikan deposit_returned_at tidak null
        if (!t.deposit_returned_at) return false;
        
        const comparisonDate = new Date(t.deposit_returned_at);
        const fromDate = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
        const toDate = dateTo ? new Date(dateTo + 'T23:59:59') : null;
        
        if (fromDate && comparisonDate < fromDate) return false;
        if (toDate && comparisonDate > toDate) return false;
      }

      return true;
    });
  }, [deposits, tabDeposit, searchName, depositType, selectedLocations, selectedRooms, dateFrom, dateTo]);

  // Pagination logic
  const paginatedDeposits = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredDeposits.slice(startIndex, endIndex);
  }, [filteredDeposits, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredDeposits.length / itemsPerPage);

  // Summary totals
  const summary = useMemo(() => {
    let totalCash = 0;
    let totalTransfer = 0;
    filteredDeposits.forEach((t) => {
      totalCash += t.deposit_cash || 0;
      totalTransfer += t.deposit_transfer || 0;
    });
    return {
      totalCash,
      totalTransfer,
      totalAll: totalCash + totalTransfer,
      count: filteredDeposits.length,
    };
  }, [filteredDeposits]);

  // Format tanggal untuk ditampilkan
  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    return new Intl.DateTimeFormat('id-ID', options).format(date);
  };

  // Quick date label
  const quickDateLabel = {
    hariini: 'Hari Ini',
    kemarin: 'Kemarin',
    '7hari': '7 Hari Terakhir',
    custom: 'Custom',
  };

  // Judul ringkasan dinamis
  const summaryTitle = useMemo(() => {
    if (quickDateFilter !== 'custom') {
      const fromFormatted = formatDateDisplay(dateFrom);
      const toFormatted = formatDateDisplay(dateTo);
      if (dateFrom === dateTo) {
        return `Tanggal: ${fromFormatted}`;
      }
      return `Tanggal: ${fromFormatted} - ${toFormatted}`;
    }
    const fromFormatted = formatDateDisplay(dateFrom);
    const toFormatted = formatDateDisplay(dateTo);
    if (dateFrom === dateTo) {
      return `Tanggal: ${fromFormatted}`;
    }
    return `Tanggal: ${fromFormatted} - ${toFormatted}`;
  }, [dateFrom, dateTo, quickDateFilter]);

  const formatRupiah = (val) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val || 0);

  const formatTime = (iso) => new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const handleReturnDeposit = async () => {
    if (!selectedTx) return;
    setUploading(true);
    let proofUrl = null;

    try {
      if (fileBukti) {
        const fileExt = fileBukti.name.split('.').pop();
        const fileName = `refund-${selectedTx.id}-${Date.now()}.${fileExt}`;
        const filePath = `refund_proofs/${fileName}`;
        const { data: uploadedUrl, error: uploadError } = await supabase.storage.from('transaction_receipts').upload(filePath, fileBukti);
        if (uploadError) throw uploadError;
        proofUrl = uploadedUrl || filePath;
      }

      const { error } = await supabase
        .from('transactions')
        .update({
          deposit_returned_at: new Date().toISOString(),
          deposit_refund_proof_url: proofUrl,
        })
        .eq('id', selectedTx.id);

      if (error) throw error;

      toast({ title: 'Deposit berhasil dikembalikan ✅' });
      setSelectedTx(null);
      setFileBukti(null);
      loadDeposits();
    } catch (err) {
      toast({ title: 'Gagal mengembalikan deposit', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const clearFilters = () => {
    setSearchName('');
    setDepositType('ALL');
    setSelectedLocations([]);
    setSelectedRooms([]);
    setQuickDateFilter('30hari');
    setDateFrom(THIRTY_DAYS_AGO);
    setDateTo(DATE_TODAY);
  };

  const hasActiveFilters = searchName || depositType !== 'ALL' || selectedLocations.length > 0 || selectedRooms.length > 0 || quickDateFilter !== '30hari';

  return (
    <div className="space-y-4">
      {/* Tab */}
      <div className="flex gap-2">
        <button
          onClick={() => setTabDeposit('belum')}
          className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
            tabDeposit === 'belum' ? 'bg-amber-500 text-white shadow-md' : 'bg-white text-amber-700 hover:bg-amber-50'
          }`}
        >
          <Clock className="mb-1 inline h-4 w-4" /> Belum Dikembalikan
        </button>
        <button
          onClick={() => setTabDeposit('sudah')}
          className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
            tabDeposit === 'sudah' ? 'bg-green-600 text-white shadow-md' : 'bg-white text-green-700 hover:bg-green-50'
          }`}
        >
          <CheckCircle className="mb-1 inline h-4 w-4" /> Dikembalikan
        </button>
      </div>

      {/* Filter Section */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
            <Search className="h-4 w-4" /> Filter
          </h3>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
              <X className="h-3 w-3" /> Reset
            </button>
          )}
        </div>

        {/* Row 1: Nama + Jenis Deposit (50:50) */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">Nama / Marketing</label>
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="Cari nama tamu atau marketing..."
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">Jenis Deposit</label>
            <select
              value={depositType}
              onChange={(e) => setDepositType(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
            >
              <option value="ALL">Semua</option>
              <option value="TUNAI">Tunai</option>
              <option value="TRANSFER">Transfer</option>
            </select>
          </div>
        </div>

        {/* Rentang Tanggal Filter */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-[11px] font-semibold text-slate-500">Rentang Tanggal</label>
            <button
              onClick={() => setShowDateFilter(!showDateFilter)}
              className="text-[10px] text-slate-500 hover:text-slate-700"
            >
              {showDateFilter ? 'Sembunyikan' : 'Tampilkan'} ↑
            </button>
          </div>
          {showDateFilter && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: 'hariini', label: 'Hari Ini' },
                  { key: 'kemarin', label: 'Kemarin' },
                  { key: '7hari', label: '7 Hari' },
                  { key: '30hari', label: '30 Hari' },
                  { key: 'custom', label: 'Custom' },
                ].map((btn) => (
                  <button
                    key={btn.key}
                    onClick={() => handleQuickDateFilter(btn.key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      quickDateFilter === btn.key
                        ? 'bg-indigo-500 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
              {/* Custom date inputs (only show when Custom is selected) */}
              {quickDateFilter === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] text-slate-400">Dari</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full rounded-lg border px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] text-slate-400">Sampai</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full rounded-lg border px-3 py-1.5 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lokasi + Nomor Kamar Filter */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-[11px] font-semibold text-slate-500">Rentang Tanggal</label>
            <button
              onClick={() => setShowLocationRoomFilter(!showLocationRoomFilter)}
              className="text-[10px] text-slate-500 hover:text-slate-700"
            >
              {showLocationRoomFilter ? 'Sembunyikan' : 'Tampilkan'} ↑
            </button>
          </div>
          {showLocationRoomFilter && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">Lokasi Apartemen</label>
                <Select
                  isMulti
                  options={locationOptions.filter(o => o.value !== '')}
                  value={locationOptions.filter((o) => o.value !== '' && selectedLocations.includes(o.value))}
                  onChange={handleLocationChange}
                  styles={selectStyles}
                  placeholder="Semua Lokasi"
                  isSearchable
                  className="text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">Nomor Kamar</label>
                <Select
                  isMulti
                  options={roomOptions}
                  value={roomOptions.filter((o) => selectedRooms.includes(o.value))}
                  onChange={handleRoomChange}
                  styles={selectStyles}
                  placeholder="Pilih kamar..."
                  isSearchable
                  isDisabled={selectedLocations.length === 0}
                  className="text-sm"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Summary Card */}
      <div className={`rounded-2xl border overflow-hidden ${
        tabDeposit === 'belum' ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
      }`}>
        <div className="p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
            {tabDeposit === 'belum' ? `Ringkasan Total Deposit (${summary.count} cs)` : `Total Deposit Dikembalikan (${summary.count} cs)`}
          </h3>
          <p className="text-[10px] text-slate-500 mb-3">{summaryTitle}</p>
          
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white p-2 text-center border border-slate-200 overflow-hidden">
              <Wallet className="h-4 w-4 mx-auto mb-1 text-slate-500" />
              <p className="text-[10px] text-slate-400 truncate">Total</p>
              <p className={`text-xs font-extrabold leading-tight ${tabDeposit === 'belum' ? 'text-amber-700' : 'text-green-700'}`}>
                {formatRupiah(summary.totalAll)}
              </p>
            </div>
            <div className="rounded-xl bg-green-50 p-2 text-center border border-green-100 overflow-hidden">
              <Banknote className="h-4 w-4 mx-auto mb-1 text-green-500" />
              <p className="text-[10px] text-green-600 truncate">Tunai</p>
              <p className="text-xs font-extrabold text-green-700 leading-tight truncate">
                {formatRupiah(summary.totalCash)}
              </p>
            </div>
            <div className="rounded-xl bg-blue-50 p-2 text-center border border-blue-100 overflow-hidden">
              <Landmark className="h-4 w-4 mx-auto mb-1 text-blue-500" />
              <p className="text-[10px] text-blue-600 truncate">Transfer</p>
              <p className="text-xs font-extrabold text-blue-700 leading-tight truncate">
                {formatRupiah(summary.totalTransfer)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Deposit List */}
      <div className="space-y-3">
        {loading ? (
          <p className="py-10 text-center text-sm text-slate-500">Memuat data deposit...</p>
        ) : filteredDeposits.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">Tidak ada deposit di kategori ini.</p>
        ) : (
          paginatedDeposits.map((tx) => {
            const totalDep = (tx.deposit_cash || 0) + (tx.deposit_transfer || 0);
            const hasCash = (tx.deposit_cash || 0) > 0;
            const hasTransfer = (tx.deposit_transfer || 0) > 0;

            // Determine card style based on deposit type
            let cardBorder = 'border-slate-200';
            let cardBg = 'bg-white';
            let typeBadge = null;
            if (hasCash && hasTransfer) {
              cardBorder = 'border-purple-200';
              cardBg = 'bg-purple-50';
              typeBadge = <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-200">Tunai + Transfer</span>;
            } else if (hasCash) {
              cardBorder = 'border-green-200';
              cardBg = 'bg-green-50';
              typeBadge = <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700 border border-green-200">💵 Tunai</span>;
            } else if (hasTransfer) {
              cardBorder = 'border-blue-200';
              cardBg = 'bg-blue-50';
              typeBadge = <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">🏦 Transfer</span>;
            }

            return (
              <motion.div
                key={tx.id}
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
                    <p className="text-xs text-slate-500 truncate">Kamar {tx.room_number} ({tx.apartment_location})</p>
                    <p className="text-xs text-slate-500">Masuk: {formatTime(tx.created_at)}</p>
                    {tx.marketing_name && (
                      <p className="text-xs text-slate-400 truncate">Marketing: {tx.marketing_name}</p>
                    )}
                  </div>
                  <div className="text-right min-w-0">
                    <p className={`text-lg font-extrabold ${tabDeposit === 'belum' ? 'text-amber-600' : 'text-green-600'} truncate`}>
                      {formatRupiah(totalDep)}
                    </p>
                  </div>
                </div>

                {tabDeposit === 'belum' && (
                  <Button
                    onClick={() => setSelectedTx(tx)}
                    className="mt-4 w-full bg-amber-500 text-white hover:bg-amber-600 font-bold"
                  >
                    Kembalikan Deposit
                  </Button>
                )}
                {tabDeposit === 'sudah' && (
                  <div className="mt-4 rounded-xl bg-green-50 px-3 py-2 text-xs text-green-800 border border-green-100 flex justify-between items-center overflow-hidden">
                    <span className="truncate">Dikembalikan: {formatTime(tx.deposit_returned_at)}</span>
                    {tx.deposit_refund_proof_url && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-green-700 hover:text-green-800 hover:bg-green-100 flex items-center gap-1">
                            <ImageIcon className="h-3 w-3" /> Lihat Bukti
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-sm rounded-3xl bg-black/90">
                          <DialogHeader>
                            <DialogTitle className="text-white">Bukti Pengembalian</DialogTitle>
                            <DialogDescription className="text-slate-300">Bukti refund deposit customer {tx.customer_name}.</DialogDescription>
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
          })
        )}
      </div>

      {/* Pagination Controls */}
      {!loading && filteredDeposits.length > 0 && (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Items per page dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600 font-medium">Tampilkan:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-xs text-slate-600">
                dari <span className="font-bold text-slate-900">{filteredDeposits.length}</span> data
              </span>
            </div>

            {/* Page navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-all ${
                  currentPage === 1
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-sm'
                }`}
              >
                ← Prev
              </button>

              {/* Page numbers */}
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-all ${
                        currentPage === pageNum
                          ? 'bg-indigo-500 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-all ${
                  currentPage === totalPages
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-sm'
                }`}
              >
                Next →
              </button>
            </div>

            {/* Current page info */}
            <div className="text-xs text-slate-600">
              Halaman <span className="font-bold text-slate-900">{currentPage}</span> dari <span className="font-bold text-slate-900">{totalPages}</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal Kembalikan Deposit */}
      <Dialog open={!!selectedTx} onOpenChange={(open) => !open && setSelectedTx(null)}>
        <DialogContent className="max-w-sm rounded-3xl bg-white">
          <DialogHeader>
            <DialogTitle>Kembalikan Deposit</DialogTitle>
            <DialogDescription>Customer: {selectedTx?.customer_name}</DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="mb-4 rounded-xl bg-amber-50 p-3 text-center border border-amber-200">
              <p className="text-xs font-semibold text-amber-700">Total Deposit</p>
              <p className="text-2xl font-extrabold text-amber-600">
                {formatRupiah((selectedTx?.deposit_cash || 0) + (selectedTx?.deposit_transfer || 0))}
              </p>
              <div className="flex justify-center gap-3 mt-1 text-xs">
                {(selectedTx?.deposit_cash || 0) > 0 && (
                  <span className="text-green-700 font-medium">💵 Tunai: {formatRupiah(selectedTx.deposit_cash)}</span>
                )}
                {(selectedTx?.deposit_transfer || 0) > 0 && (
                  <span className="text-blue-700 font-medium">🏦 Transfer: {formatRupiah(selectedTx.deposit_transfer)}</span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Bukti Transfer / Pengembalian (Opsional)</label>
              <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-slate-300 p-4">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFileBukti(e.target.files[0])}
                  className="w-full text-sm text-slate-500 file:mr-4 file:rounded-full file:border-0 file:bg-amber-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-amber-700 hover:file:bg-amber-100"
                />
              </div>
              {fileBukti && <p className="text-xs text-green-600 font-medium">File terpilih: {fileBukti.name}</p>}
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:justify-center flex-col sm:flex-row">
            <Button variant="outline" className="w-full" onClick={() => { setSelectedTx(null); setFileBukti(null); }} disabled={uploading}>
              Batal
            </Button>
            <Button className="w-full bg-amber-500 hover:bg-amber-600 font-bold text-white" onClick={handleReturnDeposit} disabled={uploading}>
              {uploading ? 'Memproses...' : 'Kembalikan Deposit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManajemenDeposit;