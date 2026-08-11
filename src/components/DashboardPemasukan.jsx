import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Calendar, Share2, Edit, Trash2, UserCheck, Image as ImageIcon, Download, Lock, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';
import EditTransaksiModal from '@/components/EditTransaksiModal';
import ManajemenDeposit from '@/components/ManajemenDeposit';
import { addDays, addMonths, format, startOfDay, startOfMonth } from 'date-fns';
import * as XLSX from 'xlsx';
import PinInput from '@/components/PinInput';
import { resolveStorageUrl } from '@/lib/storageUrl';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { formatPaymentLines, formatRupiahNumber } from '@/lib/formatPaymentText';

const ITEMS_PER_PAGE = 6;

const DashboardPemasukan = () => {
  const { user, userRole } = useAuth();
  const [activeMainTab, setActiveMainTab] = useState('umum'); // 'umum', 'deposit'
  const [filterType, setFilterType] = useState('harian');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');
  const [lokasi, setLokasi] = useState('semua');
  const [shift, setShift] = useState('semua');
  const [transaksiList, setTransaksiList] = useState([]);
  const [stats, setStats] = useState({ tunai: 0, transfer: 0, total: 0, jumlahTransaksi: 0, transaksiHariIni: 0 });
  const [lokasiOptions, setLokasiOptions] = useState(['Semua Lokasi']);
  const [editingTransaksi, setEditingTransaksi] = useState(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingEdit, setPendingEdit] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const monthInputValue = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate.slice(0, 7) : format(new Date(), 'yyyy-MM');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(searchKeyword), 300);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  const formatRupiah = (angka) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka || 0);

  const capitalizeWords = (str) => {
    if (!str) return '-';
    return str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const getSewaDisplay = (transaksi) => {
    const durationHours = Number(transaksi.rental_duration || 0);
    const checkInAt = transaksi.checkin_at || transaksi.created_at;
    const checkoutAt = transaksi.checkout_at || new Date(new Date(checkInAt).getTime() + (durationHours || 1) * 3600000).toISOString();
    const isPerMalam = durationHours >= 12 && (new Date(checkoutAt).getHours() === 12 || durationHours > 24);

    if (isPerMalam) {
      const nights = Math.max(Math.ceil(durationHours / 24), 1);
      const label = durationHours <= 15 ? 'Promo Malam' : 'Fullday';
      return `${nights} Malam (${label})`;
    }
    return formatRentalDuration(durationHours);
  };
  const formatDateTime = (iso) => new Date(iso).toLocaleString('id-ID');
  const formatWhatsappDateTime = (iso) => {
    const parts = new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(iso));
    const getPart = (type) => parts.find((part) => part.type === type)?.value || '';
    return `${getPart('day')} ${getPart('month')} ${getPart('year')}, ${getPart('hour')}:${getPart('minute')} WIB`;
  };
  const getCurrentDate = () =>
    new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const formatRentalDuration = (hours) => {
    if (!hours) return '1 JAM';
    const durationMap = { 3: '3 JAM', 6: '6 JAM', 9: '9 JAM', 12: '12 JAM', 24: '24 JAM' };
    return durationMap[hours] || `${hours} JAM`;
  };

  const parseLocalDateInput = (value) => {
    if (!value) return new Date();
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return new Date(value);
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  };

  const loadTransaksi = useCallback(async () => {
    try {
      let fromDate;
      let toDate;

      switch (filterType) {
        case 'harian':
          fromDate = startOfDay(parseLocalDateInput(startDate));
          toDate = addDays(fromDate, 1);
          break;
        case 'bulanan': {
          const monthDate = parseLocalDateInput(startDate);
          fromDate = startOfMonth(monthDate);
          toDate = addMonths(fromDate, 1);
          break;
        }
        case 'rentang':
          fromDate = new Date(`${startDate}T${startTime || '00:00'}:00`);
          // Pakai batas akhir eksklusif untuk menghindari edge-case detik/ms.
          toDate = new Date(new Date(`${endDate}T${endTime || '23:59'}:59`).getTime() + 1000);
          break;
        default:
          fromDate = startOfDay(new Date());
          toDate = addDays(fromDate, 1);
      }

      const fromIso = fromDate.toISOString();
      const toIso = toDate.toISOString();
      let query = supabase
        .from('transactions')
        .select('*')
        .or(`and(checkin_at.gte.${fromIso},checkin_at.lt.${toIso}),and(checkin_at.is.null,created_at.gte.${fromIso},created_at.lt.${toIso})`);

      if (lokasi !== 'semua') query = query.eq('apartment_location', lokasi);
      if (shift !== 'semua') query = query.eq('shift', shift);
      const keyword = debouncedKeyword.trim();
      if (keyword) {
        query = query.or(
          `customer_name.ilike.%${keyword}%,marketing_name.ilike.%${keyword}%,input_by.ilike.%${keyword}%,apartment_location.ilike.%${keyword}%,room_number.ilike.%${keyword}%`
        );
      }

      const { data: filteredData, error } = await query;
      if (error) throw error;

      const list = (filteredData || []).sort((a, b) => new Date(b.checkin_at || b.created_at) - new Date(a.checkin_at || a.created_at));
      // Deposit TIDAK masuk ke omset
      const totalTunai = list.reduce((sum, t) => sum + (t.cash_amount || 0), 0);
      const totalTransfer = list.reduce((sum, t) => sum + (t.transfer_amount || 0), 0);

      setStats((prev) => ({
        ...prev,
        tunai: totalTunai,
        transfer: totalTransfer,
        total: totalTunai + totalTransfer,
        jumlahTransaksi: list.length,
      }));
      setTransaksiList(list);
      setCurrentPage(1);
    } catch (error) {
      setTransaksiList([]);
      setStats((prev) => ({ ...prev, tunai: 0, transfer: 0, total: 0, jumlahTransaksi: 0 }));
      toast({ title: 'Gagal memuat transaksi', description: error.message, variant: 'destructive' });
    }
  }, [filterType, startDate, endDate, startTime, endTime, lokasi, shift, debouncedKeyword]);

  const loadInitialData = useCallback(async () => {
    const { data: lokasiData } = await supabase.from('lokasi_apartemen').select('name').order('name');
    if (lokasiData) {
      setLokasiOptions(['Semua Lokasi', ...lokasiData.map((l) => l.name)]);
    }

    const start = startOfDay(new Date());
    const endExclusive = addDays(start, 1);
    const { count, error } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .or(`and(checkin_at.gte.${start.toISOString()},checkin_at.lt.${endExclusive.toISOString()}),and(checkin_at.is.null,created_at.gte.${start.toISOString()},created_at.lt.${endExclusive.toISOString()})`);

    if (!error) {
      setStats((prev) => ({ ...prev, transaksiHariIni: count || 0 }));
    }
  }, []);

  const refreshDashboardData = useCallback(async () => {
    await Promise.all([loadTransaksi(), loadInitialData()]);
  }, [loadTransaksi, loadInitialData]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    refreshDashboardData();
    const channel = supabase
      .channel('realtime-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, refreshDashboardData)
      .subscribe();

    // Fallback mobile: beberapa browser mobile/PWA kadang suspend websocket realtime.
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshDashboardData();
      }
    }, 15000);

    // Debounce visibility refetch agar tidak trigger instan saat alt+tab
    let visibilityTimer = null;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (visibilityTimer) clearTimeout(visibilityTimer);
        // Tunda 3 detik agar user tidak lihat flicker saat kembali ke tab
        visibilityTimer = setTimeout(() => {
          refreshDashboardData();
        }, 3000);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      if (visibilityTimer) clearTimeout(visibilityTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [refreshDashboardData]);

  const handleEditClick = (transaksi) => {
    if (userRole === 'super_admin') {
      setEditingTransaksi(transaksi);
      return;
    }
    setPendingEdit(transaksi);
    setShowPinModal(true);
  };

  const handlePinComplete = (pin) => {
    if (pin === '212198') {
      setShowPinModal(false);
      setEditingTransaksi(pendingEdit);
      setPendingEdit(null);
      toast({ title: 'Akses diberikan', className: 'bg-green-500 text-white' });
    } else {
      setShowPinModal(false);
      toast({ title: 'PIN Salah', variant: 'destructive' });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Yakin ingin menghapus transaksi ini?')) return;
    const { data, error } = await supabase.rpc('delete_transaction_cascade', { p_transaction_id: id });
    if (error) {
      toast({ title: 'Gagal menghapus', description: error.message, variant: 'destructive' });
    } else {
      setTransaksiList((prev) => prev.filter((t) => t.id !== id));
      setStats((prev) => ({ ...prev, jumlahTransaksi: Math.max((prev.jumlahTransaksi || 1) - 1, 0) }));
      const removedInfo = data?.removed_fee_rows ? `, komisi terhapus ${data.removed_fee_rows}` : '';
      const { data: stillExists, error: verifyError } = await supabase
        .from('transactions')
        .select('id')
        .eq('id', id)
        .maybeSingle();
      if (verifyError) {
        toast({ title: 'Transaksi dihapus, verifikasi gagal', description: verifyError.message, variant: 'destructive' });
      } else if (stillExists?.id) {
        toast({ title: 'Penghapusan belum sinkron', description: 'Data masih terdeteksi di database, coba muat ulang.', variant: 'destructive' });
      } else {
        toast({ title: `Transaksi dihapus${removedInfo}` });
      }
      loadTransaksi();
    }
  };

  const handleSaveEdit = async (updatedTransaksi) => {
    // Hanya field yang ada di tabel transactions
    const ALLOWED_FIELDS = [
      'customer_name', 'apartment_location', 'room_number', 'marketing_name',
      'rental_duration', 'shift', 'input_by', 'cash_amount', 'transfer_amount',
      'transfer_to', 'marketing_fee', 'deposit_cash', 'deposit_transfer',
      'ktp_image_url', 'transfer_proof_url', 'checkin_at', 'checkout_at', 'user_id', 'created_at',
    ];

    const updateData = Object.fromEntries(
      ALLOWED_FIELDS
        .filter((k) => updatedTransaksi[k] !== undefined)
        .map((k) => [k, updatedTransaksi[k]])
    );

    if (updateData.customer_name) {
      updateData.customer_name = capitalizeWords(updateData.customer_name);
    }

    const { error, count } = await supabase
      .from('transactions')
      .update(updateData, { count: 'exact' })
      .eq('id', updatedTransaksi.id);

    if (error) {
      toast({ title: 'Gagal menyimpan', description: error.message, variant: 'destructive' });
      return;
    }

    if (count === 0) {
      // 0 rows updated = RLS menolak diam-diam
      toast({
        title: 'Gagal menyimpan',
        description: 'Akses ditolak oleh kebijakan database. Jalankan SQL migration untuk mengizinkan admin mengedit semua transaksi.',
        variant: 'destructive',
      });
      return;
    }

    toast({ title: 'Transaksi diperbarui ✅' });
    setEditingTransaksi(null);
    loadTransaksi();
  };

  const handleShare = async (transaksi) => {
    const { total, lines } = formatPaymentLines({
      cashAmount: transaksi.cash_amount || 0,
      transferAmount: transaksi.transfer_amount || 0,
      transferTo: transaksi.transfer_to || null,
    });
    const komisi = formatRupiahNumber(Number(transaksi.marketing_fee || 0));
    const depositCash = Number(transaksi.deposit_cash || 0);
    const depositTransfer = Number(transaksi.deposit_transfer || 0);

    const depositLine = depositCash > 0 || depositTransfer > 0
      ? `${depositCash > 0 ? `Tunai ${formatRupiahNumber(depositCash)} ` : ''}${depositTransfer > 0 ? `Transfer ${formatRupiahNumber(depositTransfer)}` : ''}`.trim()
      : null;

    const checkInAt = transaksi.checkin_at || transaksi.created_at;
    const checkoutAt = transaksi.checkout_at || new Date(new Date(checkInAt).getTime() + (Number(transaksi.rental_duration) || 1) * 60 * 60 * 1000).toISOString();

    const customerName = capitalizeWords(transaksi.customer_name);
    const sewaDisplay = getSewaDisplay(transaksi);

    const message = `*TRANSAKSI KAKARAMA GROUP*
-------------------
*Marketing:* ${transaksi.marketing_name || '-'}
*Komisi:* ${komisi}
-------------------
*Customer:* ${customerName}
*Lokasi:* ${transaksi.apartment_location} - ${transaksi.room_number}
*Check-in:* ${formatWhatsappDateTime(checkInAt)}
*Checkout:* ${formatWhatsappDateTime(checkoutAt)}
*Sewa:* ${sewaDisplay}
-------------------
*Total Bayar:* ${formatRupiahNumber(total)}
*Pembayaran:* ${lines.join('\n')}
${depositLine ? `*Deposit:* ${depositLine}\n` : ''}-------------------
Diinput oleh: ${transaksi.input_by || '-'} (Shift: ${transaksi.shift || '-'})`;

    try {
      await navigator.clipboard.writeText(message);
      toast({ title: 'Pesan disalin', description: 'Buka WhatsApp dan tempel pesan.' });
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank');
    } catch (_error) {
      toast({ title: 'Gagal membagikan', description: 'Silakan coba lagi.', variant: 'destructive' });
    }
  };

  const handleExport = () => {
    const dataToExport = transaksiList.map((t) => ({
      'Waktu Check-in': formatDateTime(t.checkin_at || t.created_at),
      'Nama Customer': t.customer_name,
      'Nama Marketing': t.marketing_name,
      Lokasi: t.apartment_location,
      Kamar: t.room_number,
      'Lama Sewa': formatRentalDuration(t.rental_duration),
      Shift: t.shift,
      Tunai: t.cash_amount,
      Transfer: t.transfer_amount,
      Total: (t.cash_amount || 0) + (t.transfer_amount || 0),
      'Fee Marketing': t.marketing_fee,
      'Diinput Oleh': t.input_by,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transaksi');
    XLSX.writeFile(workbook, `Laporan_Transaksi_${startDate}_${endDate}.xlsx`);
  };

  const totalPages = Math.max(1, Math.ceil(transaksiList.length / ITEMS_PER_PAGE));
  const paginatedTransaksi = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return transaksiList.slice(start, start + ITEMS_PER_PAGE);
  }, [transaksiList, currentPage]);

  return (
    <>
      <Dialog open={showPinModal} onOpenChange={setShowPinModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Lock /> Akses Terbatas</DialogTitle>
            <DialogDescription>Masukkan PIN untuk mengubah data transaksi.</DialogDescription>
          </DialogHeader>
          <PinInput onComplete={handlePinComplete} />
        </DialogContent>
      </Dialog>
      {editingTransaksi && (
        <EditTransaksiModal transaksi={editingTransaksi} onClose={() => setEditingTransaksi(null)} onSave={handleSaveEdit} />
      )}

      <div className="min-h-screen p-4 pb-28 pt-6">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto max-w-md space-y-5">
          <div className="text-center">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 px-6 py-3 text-white shadow-lg">
              <TrendingUp className="h-5 w-5" />
              <h1 className="text-xl font-bold">Laporan & Deposit</h1>
            </div>
          </div>

          <div className="flex gap-2 rounded-2xl bg-slate-200/50 p-1">
            <button
              onClick={() => setActiveMainTab('umum')}
              className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all ${activeMainTab === 'umum' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Riwayat Transaksi
            </button>
            <button
              onClick={() => setActiveMainTab('deposit')}
              className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all ${activeMainTab === 'deposit' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Manajemen Deposit
            </button>
          </div>

          {activeMainTab === 'umum' && (
            <>
              <div className="glassmorphic-card space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 font-bold text-gray-800"><Calendar className="h-5 w-5 text-blue-500" /> Filter Data</h2>
                  <Button onClick={handleExport} size="sm" variant="outline" className="border-green-300 bg-green-100 text-green-800 hover:bg-green-200">
                    <Download className="mr-2 h-4 w-4" /> Ekspor
                  </Button>
                </div>
                <div className="flex gap-2">
                  {['harian', 'bulanan', 'rentang'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setFilterType(tab)}
                      className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold ${filterType === tab ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white' : 'bg-gray-100 text-gray-900'}`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>

                {filterType === 'harian' && <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-xl border-2 px-4 py-2.5 text-gray-900" />}
                {filterType === 'bulanan' && <input type="month" value={monthInputValue} onChange={(e) => setStartDate(`${e.target.value}-01`)} className="w-full rounded-xl border-2 px-4 py-2.5 text-gray-900" />}
                {filterType === 'rentang' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-xl border-2 px-3 py-2.5 text-gray-900" />
                      <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-xl border-2 px-3 py-2.5 text-gray-900" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full rounded-xl border-2 px-2 py-2.5 text-sm text-gray-900" />
                      <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full rounded-xl border-2 px-2 py-2.5 text-sm text-gray-900" />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <select value={lokasi} onChange={(e) => setLokasi(e.target.value)} className="w-full rounded-xl border-2 bg-white px-3 py-2.5 text-sm text-gray-900">
                    {lokasiOptions.map((lok) => (
                      <option key={lok} value={lok === 'Semua Lokasi' ? 'semua' : lok}>{lok}</option>
                    ))}
                  </select>
                  <select value={shift} onChange={(e) => setShift(e.target.value)} className="w-full rounded-xl border-2 bg-white px-3 py-2.5 text-sm text-gray-900">
                    {['Semua Shift', 'Pagi', 'Malam', 'Long Shift'].map((s) => (
                      <option key={s} value={s === 'Semua Shift' ? 'semua' : s}>{s}</option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="w-full rounded-xl border-2 px-3 py-2.5 text-sm text-gray-900"
                  placeholder="Cari customer, marketing, input oleh, lokasi atau kamar..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="glassmorphic-card col-span-2 p-5">
                  <h3 className="text-base font-bold text-blue-900">Total Transaksi Hari Ini</h3>
                  <p className="text-2xl font-extrabold leading-tight text-blue-700 sm:text-3xl">{stats.transaksiHariIni} <span className="text-base">transaksi</span></p>
                </div>
                <div className="glassmorphic-card p-4">
                  <h3 className="text-base font-bold text-green-900">Tunai (Filter)</h3>
                  <p className="break-all text-xl font-extrabold leading-tight text-green-700 sm:text-2xl">{formatRupiah(stats.tunai)}</p>
                </div>
                <div className="glassmorphic-card p-4">
                  <h3 className="text-base font-bold text-cyan-900">Transfer (Filter)</h3>
                  <p className="break-all text-xl font-extrabold leading-tight text-cyan-700 sm:text-2xl">{formatRupiah(stats.transfer)}</p>
                </div>
              </div>

              <div className="glassmorphic-card p-5">
                <h3 className="text-base font-bold text-red-900">Total Pemasukan (Filter)</h3>
                <p className="break-all text-2xl font-extrabold leading-tight text-red-700 sm:text-3xl">{formatRupiah(stats.total)}</p>
                <p className="mt-1 text-sm">{stats.jumlahTransaksi} total transaksi</p>
              </div>

              <div className="glassmorphic-card p-5">
                <h2 className="mb-4 font-bold text-gray-800">Detail Transaksi</h2>
                <div className="space-y-3">
                  {paginatedTransaksi.map((transaksi) => (
                    <div key={transaksi.id} className="rounded-2xl border bg-white/70 p-4">
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <h3 className="font-bold text-gray-800">{capitalizeWords(transaksi.customer_name)}</h3>
                        <p className="text-right text-base font-extrabold text-orange-600 sm:text-lg">{formatRupiah((transaksi.cash_amount || 0) + (transaksi.transfer_amount || 0))}</p>
                      </div>
                      <div className="mb-3 space-y-1 border-y py-2 text-xs text-gray-700">
                        <p>Lokasi: {transaksi.apartment_location} - Kamar {transaksi.room_number}</p>
                        <p>Sewa: {getSewaDisplay(transaksi)}</p>
                        <p>Check-in: {formatWhatsappDateTime(transaksi.checkin_at || transaksi.created_at)}</p>
                        {transaksi.marketing_name && <p>Marketing: {transaksi.marketing_name}</p>}
                        {transaksi.marketing_fee > 0 && <p>Fee: {formatRupiah(transaksi.marketing_fee)}</p>}
                        {transaksi.input_by && (
                          <p>
                            <UserCheck className="mr-1 inline h-3 w-3" />
                            Diinput oleh: {transaksi.input_by} (Shift: {transaksi.shift || '-'})
                          </p>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-1 text-xs">
                          {(transaksi.cash_amount || 0) > 0 && <p className="font-semibold text-green-600">Tunai: {formatRupiah(transaksi.cash_amount)}</p>}
                          {(transaksi.transfer_amount || 0) > 0 && <p className="font-semibold text-blue-600">Transfer: {formatRupiah(transaksi.transfer_amount)} {transaksi.transfer_to ? `(ke ${transaksi.transfer_to})` : ''}</p>}
                        </div>
                        <div className="flex gap-1">
                          {transaksi.transfer_proof_url && (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button size="icon" variant="outline" className="h-8 w-8"><ImageIcon className="h-4 w-4" /></Button>
                              </DialogTrigger>
                              <DialogContent className="bg-black/80">
                                <DialogHeader>
                                  <DialogTitle className="text-white">Bukti Transfer</DialogTitle>
                                  <DialogDescription className="text-gray-300">Pratinjau gambar bukti transfer transaksi.</DialogDescription>
                                </DialogHeader>
                                <img src={resolveStorageUrl(transaksi.transfer_proof_url)} alt="Bukti Transfer" className="w-full rounded-lg" />
                              </DialogContent>
                            </Dialog>
                          )}
                          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => handleEditClick(transaksi)}><Edit className="h-4 w-4" /></Button>
                          <Button size="icon" variant="destructive" className="h-8 w-8" onClick={() => handleDelete(transaksi.id)}><Trash2 className="h-4 w-4" /></Button>
                          <Button size="icon" onClick={() => handleShare(transaksi)} className="h-8 w-8 bg-green-500"><Share2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {paginatedTransaksi.length === 0 && (
                    <p className="py-6 text-center text-sm text-gray-500">Tidak ada transaksi pada filter ini.</p>
                  )}
                </div>

                {totalPages > 1 && activeMainTab === 'umum' && (
                  <div className="mt-4 flex items-center justify-between">
                    <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}>
                      <ChevronLeft className="mr-1 h-4 w-4" /> Sebelumnya
                    </Button>
                    <p className="text-xs text-gray-600">Halaman {currentPage} dari {totalPages}</p>
                    <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}>
                      Berikutnya <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                )}

              </div>
            </>
          )}

          {activeMainTab === 'deposit' && (
            <ManajemenDeposit />
          )}

        </motion.div>
      </div>
    </>
  );
};

export default DashboardPemasukan;
