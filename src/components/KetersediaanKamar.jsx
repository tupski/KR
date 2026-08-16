import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Banknote,
  ChevronDown,
  ChevronUp,
  Clock,
  DoorOpen,
  Landmark,
  LogOut,
  MapPin,
  Phone,
  User,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { calcEndAt, getActiveTransaction, formatTimeWIB, capitalizeWords } from '@/lib/roomUtils';
import { locationsApi } from '@/api/locations.api';
import { transactionsApi } from '@/api/transactions.api';
import { api } from '@/api/client';

const INITIAL_VISIBLE_ROOMS = 8;
const REPORT_PAGE_SIZE = 10;

const formatTime = (date) =>
  date ? date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';
const formatDate = (date) =>
  date ? date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '';

const formatRupiah = (v) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(v || 0);

const getSewaDisplay = (tx) => {
  if (!tx) return '-';
  const hours = Number(tx.rental_duration || 0);
  const start = new Date(tx.checkin_at || tx.created_at);
  const end = tx.checkout_at ? new Date(tx.checkout_at) : new Date(start.getTime() + hours * 3600000);
  const isPerMalam = hours >= 12 && (end.getHours() === 12 || hours > 24);

  if (isPerMalam) {
    const nights = Math.max(Math.ceil(hours / 24), 1);
    const label = hours <= 15 ? 'Promo Malam' : 'Fullday';
    return `${nights} Malam (${label})`;
  }
  const map = { 3: '3 JAM', 6: '6 JAM', 9: '9 JAM', 12: '12 JAM', 24: '24 JAM' };
  return map[hours] || `${hours} JAM`;
};

// ── Detail Modal ───────────────────────────────────────
const RoomDetailModal = ({ room, onClose, onCheckOut, canCheckout }) => {
  if (!room) return null;
  const isOccupied = room.status === 'terisi';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 pb-24 pt-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 22, stiffness: 300 }}
        className="w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{room.lokasi}</p>
            <h2 className="text-2xl font-bold text-slate-900">{room.name}</h2>
          </div>
          <div className="flex items-center gap-2">
            {isOccupied ? (
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">Terisi</span>
            ) : (
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">Tersedia</span>
            )}
            <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {isOccupied ? (
          <div className="space-y-4">
            {/* Customer info */}
            <div className="rounded-2xl bg-slate-50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <User className="h-4 w-4 text-slate-400" />
                <span className="font-semibold text-slate-900">{capitalizeWords(room.customerName)}</span>
              </div>
              {room.tx?.marketing_name && (
                <div className="space-y-1 pl-6">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <span>Marketing: <span className="font-medium">{room.tx.marketing_name}</span></span>
                  </div>
                  <div className="text-xs">
                    <span className="text-slate-500">Komisi: </span>
                    <span className={`font-semibold ${room.feePaid ? 'text-green-600' : 'text-amber-600'}`}>
                      {room.tx.marketing_fee > 0 
                        ? `${formatRupiah(room.tx.marketing_fee)} (${room.feePaid ? 'Sudah dibayar' : 'Belum dibayar'})`
                        : 'Rp 0 (Tanpa komisi)'}
                    </span>
                  </div>
                </div>
              )}
              {room.tx?.input_by && (
                <div className="flex items-center gap-2 text-xs text-slate-500 pl-6 italic">
                  <span>Diinput oleh: {room.tx.input_by} (shift: {room.tx.shift?.toLowerCase() || '-'})</span>
                </div>
              )}
            </div>

            {/* Time info */}
            <div className="rounded-2xl bg-slate-50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-700">
                <Clock className="h-4 w-4 text-slate-400" />
                <div className="space-y-1">
                  <p>Check-in: <span className="font-semibold">{formatTimeWIB(room.checkInTime)}</span></p>
                  <p>Check-out: <span className="font-semibold">{formatTimeWIB(room.readyAt)}</span></p>
                  <p>Durasi: <span className="font-semibold">{getSewaDisplay(room.tx)}</span></p>
                </div>
              </div>
            </div>

            {/* Payment info */}
            <div className="rounded-2xl bg-slate-50 p-4 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pembayaran Sewa</p>
              {(room.tx?.cash_amount || 0) > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Banknote className="h-4 w-4 text-green-500" />
                  <span className="text-slate-700">Tunai: <span className="font-semibold text-green-700">{formatRupiah(room.tx.cash_amount)}</span></span>
                </div>
              )}
              {(room.tx?.transfer_amount || 0) > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Landmark className="h-4 w-4 text-blue-500" />
                  <span className="text-slate-700">Transfer: <span className="font-semibold text-blue-700">{formatRupiah(room.tx.transfer_amount)}</span>{room.tx.transfer_to ? ` → ${room.tx.transfer_to}` : ''}</span>
                </div>
              )}
              <p className="text-sm font-bold text-slate-800 pt-1 border-t">
                Total: {formatRupiah((room.tx?.cash_amount || 0) + (room.tx?.transfer_amount || 0))}
              </p>
            </div>

            {/* Deposit info */}
            {((room.tx?.deposit_cash || 0) > 0 || (room.tx?.deposit_transfer || 0) > 0) && (
              <div className={`rounded-2xl border p-4 space-y-1.5 ${room.tx?.deposit_returned_at ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex justify-between items-center">
                  <p className={`text-xs font-semibold uppercase tracking-wide ${room.tx?.deposit_returned_at ? 'text-green-700' : 'text-amber-600'}`}>
                    💰 Deposit {room.tx?.deposit_returned_at && '(Sudah Dikembalikan)'}
                  </p>
                </div>
                {(room.tx?.deposit_cash || 0) > 0 && (
                  <p className={`text-sm ${room.tx?.deposit_returned_at ? 'text-green-800' : 'text-amber-800'}`}>Tunai: <span className="font-semibold">{formatRupiah(room.tx.deposit_cash)}</span></p>
                )}
                {(room.tx?.deposit_transfer || 0) > 0 && (
                  <p className={`text-sm ${room.tx?.deposit_returned_at ? 'text-green-800' : 'text-amber-800'}`}>Transfer: <span className="font-semibold">{formatRupiah(room.tx.deposit_transfer)}</span></p>
                )}
              </div>
            )}

            {/* Checkout button */}
            {canCheckout && (
              <Button
                onClick={() => { onCheckOut(room); onClose(); }}
                className="h-12 w-full rounded-2xl bg-red-500 text-white hover:bg-red-600"
              >
                <LogOut className="mr-2 h-4 w-4" /> Check Out Sekarang
              </Button>
            )}
            {!canCheckout && (
              <p className="text-center text-xs text-slate-500">Hanya admin atau karyawan yang input transaksi ini yang bisa checkout.</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center py-8 gap-3">
            <div className="rounded-full bg-green-100 p-4">
              <DoorOpen className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-sm text-slate-500">Kamar ini sedang kosong dan siap disewa.</p>
          </div>
        )}
      </motion.div>
    </div>
  );
};

const ReportRoomDetailModal = ({ room, transactions, onClose }) => {
  if (!room) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 pb-24 pt-6 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl max-h-[75vh]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{room.lokasi}</p>
            <h2 className="text-xl font-bold text-slate-900">{room.name}</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mb-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
          Transaksi: <span className="font-bold text-slate-900">{room.jumlahDigunakan || 0}</span> · Pendapatan:{' '}
          <span className="font-bold text-emerald-700">{formatRupiah(room.pendapatan || 0)}</span>
        </div>
        <div className="space-y-2">
          {transactions.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-4">Tidak ada transaksi pada periode ini.</p>
          ) : (
            transactions.map((tx) => (
              <div key={tx.id} className="rounded-xl border p-3 space-y-1">
                <p className="text-xs text-slate-500">{formatTimeWIB(new Date(tx.checkin_at || tx.created_at))}</p>
                <p className="text-sm font-semibold text-slate-800">{capitalizeWords(tx.customer_name || 'Tanpa nama')}</p>
                <p className="text-xs text-slate-600">Tunai: {formatRupiah(tx.cash_amount || 0)} · Transfer: {formatRupiah(tx.transfer_amount || 0)}</p>
                <p className="text-xs font-semibold text-slate-800">Total: {formatRupiah((tx.cash_amount || 0) + (tx.transfer_amount || 0))}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────
const KetersediaanKamar = () => {
  const { user, userRole, isAdmin, isSuperAdmin } = useAuth();
  const [activeView, setActiveView] = useState('ketersediaan');
  const [groupedRooms, setGroupedRooms] = useState({});
  const [reportGroupedRooms, setReportGroupedRooms] = useState({});
  const [expandedLocations, setExpandedLocations] = useState({});
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [filterStatus, setFilterStatus] = useState('ALL'); // 'ALL', 'OCCUPIED', 'AVAILABLE'
  const [reportFilterType, setReportFilterType] = useState('bulan');
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reportStartDate, setReportStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [reportEndDate, setReportEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [reportLocationFilter, setReportLocationFilter] = useState('ALL');
  const [roomSearchTerm, setRoomSearchTerm] = useState('');
  const [reportTransactionsByRoom, setReportTransactionsByRoom] = useState({});
  const [reportPageByLocation, setReportPageByLocation] = useState({});
  const [selectedReportRoom, setSelectedReportRoom] = useState(null);

  const canCheckoutAll = isAdmin || isSuperAdmin;

  const fetchRoomStatus = useCallback(async () => {
    setLoading(true);

    try {
      // Use the REST API to fetch rooms with occupancy data
      const response = await locationsApi.listRoomsWithOccupancy({});
      const { rooms, transactions, paidFees } = response;

      const now = new Date();

      // Rooms are already filtered by the backend based on user role
      const allRooms = rooms || [];
      const allTransactions = transactions || [];
      const allPaidFees = paidFees || [];

      const roomStatus = allRooms.map((room) => {
        const activeTx = getActiveTransaction(room.lokasi, room.name, allTransactions, now);

        if (activeTx) {
          const endAt = calcEndAt(activeTx);
          return {
            ...room,
            tx: activeTx,
            transactionId: activeTx.id,
            transactionUserId: activeTx.user_id,
            status: 'terisi',
            readyAt: endAt,
            customerName: activeTx.customer_name,
            checkInTime: new Date(activeTx.checkin_at || activeTx.created_at),
            feePaid: allPaidFees.some(pf =>
              pf.marketing_name === activeTx.marketing_name &&
              new Date(pf.paid_at).toDateString() === new Date(activeTx.checkin_at || activeTx.created_at).toDateString()
            ),
          };
        }
        return { ...room, tx: null, transactionId: null, transactionUserId: null, status: 'tersedia', readyAt: null, customerName: null, checkInTime: null };
      });

      const grouped = roomStatus.reduce((acc, room) => {
        const loc = room.lokasi || 'Lainnya';
        if (!acc[loc]) acc[loc] = [];
        acc[loc].push(room);
        return acc;
      }, {});
      Object.keys(grouped).forEach((loc) =>
        grouped[loc].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      );

      setGroupedRooms(grouped);
    } catch (error) {
      toast({ title: 'Gagal memuat data kamar', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoomStatus();
    // Note: Realtime subscription removed during REST API migration
    // Consider using WebSocket or polling for real-time updates if needed
  }, [fetchRoomStatus]);

  const loadRoomReport = useCallback(async () => {
    setReportLoading(true);
    let fromDate;
    let toDate;

    if (reportFilterType === 'bulan') {
      const [year, month] = (reportMonth || '').split('-').map(Number);
      fromDate = new Date(year || new Date().getFullYear(), (month || 1) - 1, 1, 0, 0, 0, 0);
      toDate = new Date(fromDate.getFullYear(), fromDate.getMonth() + 1, 1, 0, 0, 0, 0);
    } else {
      fromDate = new Date(`${reportStartDate}T00:00:00`);
      toDate = new Date(new Date(`${reportEndDate}T23:59:59`).getTime() + 1000);
    }

    const fromIso = fromDate.toISOString();
    const toIso = toDate.toISOString();

    try {
      // Use REST API to fetch rooms for report
      const response = await locationsApi.listRoomsForReport({
        startDate: fromIso,
        endDate: toIso,
      });
      const { rooms, transactions } = response;

      const allRooms = rooms || [];
      const allTransactions = transactions || [];

      const txMap = new Map();
      const txDetailMap = new Map();
      allTransactions.forEach((tx) => {
        const key = `${tx.apartment_location || ''}__${tx.room_number || ''}`;
        const current = txMap.get(key) || { jumlahDigunakan: 0, pendapatan: 0 };
        current.jumlahDigunakan += 1;
        current.pendapatan += Number(tx.cash_amount || 0) + Number(tx.transfer_amount || 0);
        txMap.set(key, current);
        const detailList = txDetailMap.get(key) || [];
        detailList.push(tx);
        txDetailMap.set(key, detailList);
      });

      const grouped = allRooms.reduce((acc, room) => {
        const loc = room.lokasi || 'Lainnya';
        if (!acc[loc]) acc[loc] = [];
        const key = `${room.lokasi || ''}__${room.name || ''}`;
        const agg = txMap.get(key) || { jumlahDigunakan: 0, pendapatan: 0 };
        acc[loc].push({
          ...room,
          jumlahDigunakan: agg.jumlahDigunakan,
          pendapatan: agg.pendapatan,
        });
        return acc;
      }, {});

      Object.keys(grouped).forEach((loc) => {
        grouped[loc].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      });

      setReportGroupedRooms(grouped);
      setReportTransactionsByRoom(Object.fromEntries(txDetailMap));
      setReportPageByLocation({});
    } catch (error) {
      toast({ title: 'Gagal memuat laporan kamar', description: error.message, variant: 'destructive' });
    } finally {
      setReportLoading(false);
    }
  }, [reportFilterType, reportMonth, reportStartDate, reportEndDate]);

  const reportLocations = useMemo(
    () => ['ALL', ...Object.keys(reportGroupedRooms).sort((a, b) => a.localeCompare(b))],
    [reportGroupedRooms]
  );

  const reportRoomOptions = useMemo(() => {
    const options = [];
    Object.keys(reportGroupedRooms).forEach((location) => {
      reportGroupedRooms[location].forEach((room) => {
        options.push(`${location} - ${room.name}`);
      });
    });
    return options;
  }, [reportGroupedRooms]);

  useEffect(() => {
    loadRoomReport();
  }, [loadRoomReport]);

  const handleCheckOut = async (room) => {
    if (!room.transactionId) return;
    const isOwner = room.transactionUserId === user?.id;
    if (!canCheckoutAll && !isOwner) {
      toast({ title: 'Akses ditolak', description: 'Karyawan hanya bisa checkout transaksi yang diinput sendiri.', variant: 'destructive' });
      return;
    }
    if (!window.confirm(`Yakin checkout ${room.name} (${room.lokasi})?`)) return;

    try {
      // Use REST API for checkout
      await transactionsApi.checkout(room.transactionId);

      // Log activity via API
      await api.post('/api/activity-logs', {
        action: 'Checkout Manual',
        details: `Customer: ${room.customerName}, Unit: ${room.lokasi} - ${room.name}`,
        metadata: { transaction_id: room.transactionId }
      });

      toast({ title: 'Check Out Berhasil ✅' });
      fetchRoomStatus();
    } catch (error) {
      toast({ title: 'Gagal Check Out', description: error.message, variant: 'destructive' });
    }
  };

  const stats = useMemo(() => {
    const all = Object.values(groupedRooms).flat();
    const total = all.length;
    const occupied = all.filter((r) => r.status === 'terisi').length;
    return { total, occupied, available: total - occupied };
  }, [groupedRooms]);

  return (
    <div className="min-h-screen p-3 pb-28 pt-5">
      <div className="mx-auto max-w-md space-y-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-cyan-500 p-6 rounded-2xl text-white shadow-lg relative overflow-hidden">
          <div className="relative z-10">
            <h1 className="text-xl font-black tracking-tight uppercase">Ketersediaan Kamar</h1>
            <p className="text-blue-100 text-xs mt-1">Pantau status unit dan kelola checkout tamu.</p>
          </div>
        </div>

        <div className={`rounded-2xl bg-white p-1 shadow-sm border ${userRole === 'karyawan' ? 'grid grid-cols-1' : 'grid grid-cols-2'}`}>
          <button
            type="button"
            onClick={() => setActiveView('ketersediaan')}
            className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
              activeView === 'ketersediaan' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Ketersediaan
          </button>
          {userRole !== 'karyawan' && (
            <button
              type="button"
              onClick={() => setActiveView('laporan')}
              className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                activeView === 'laporan' ? 'bg-cyan-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Laporan Kamar
            </button>
          )}
        </div>

        {activeView === 'laporan' && (
          <>
            <div className="rounded-2xl border bg-white p-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setReportFilterType('bulan')}
                  className={`rounded-xl px-3 py-2 text-xs font-bold ${reportFilterType === 'bulan' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'}`}
                >
                  Per Bulan
                </button>
                <button
                  type="button"
                  onClick={() => setReportFilterType('rentang')}
                  className={`rounded-xl px-3 py-2 text-xs font-bold ${reportFilterType === 'rentang' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'}`}
                >
                  Rentang Tanggal
                </button>
              </div>
              {reportFilterType === 'bulan' ? (
                <input
                  type="month"
                  value={reportMonth}
                  onChange={(e) => setReportMonth(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={reportStartDate}
                    onChange={(e) => setReportStartDate(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  />
                  <input
                    type="date"
                    value={reportEndDate}
                    onChange={(e) => setReportEndDate(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 gap-2">
                <select
                  value={reportLocationFilter}
                  onChange={(e) => setReportLocationFilter(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
                >
                  {reportLocations.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc === 'ALL' ? 'Semua Apartemen' : loc}
                    </option>
                  ))}
                </select>
                <div>
                  <input
                    type="text"
                    list="report-room-autocomplete"
                    value={roomSearchTerm}
                    onChange={(e) => setRoomSearchTerm(e.target.value)}
                    placeholder="Cari kamar (autocomplete)..."
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  />
                  <datalist id="report-room-autocomplete">
                    {reportRoomOptions.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>

            {reportLoading ? (
              <p className="py-10 text-center text-slate-500">Memuat laporan kamar...</p>
            ) : Object.keys(reportGroupedRooms).length === 0 ? (
              <p className="py-10 text-center text-slate-500">Belum ada data kamar untuk laporan.</p>
            ) : (
              Object.keys(reportGroupedRooms).sort().map((location) => {
                if (reportLocationFilter !== 'ALL' && reportLocationFilter !== location) return null;
                const term = roomSearchTerm.trim().toLowerCase();
                const rooms = reportGroupedRooms[location].filter((room) => {
                  if (!term) return true;
                  const scoped = `${location} - ${room.name}`.toLowerCase();
                  return room.name.toLowerCase().includes(term) || scoped.includes(term);
                });
                if (rooms.length === 0) return null;
                const totalTransaksi = rooms.reduce((sum, r) => sum + (r.jumlahDigunakan || 0), 0);
                const totalPendapatan = rooms.reduce((sum, r) => sum + (r.pendapatan || 0), 0);
                const currentPage = reportPageByLocation[location] || 1;
                const totalPages = Math.max(1, Math.ceil(rooms.length / REPORT_PAGE_SIZE));
                const pageStart = (currentPage - 1) * REPORT_PAGE_SIZE;
                const visibleRooms = rooms.slice(pageStart, pageStart + REPORT_PAGE_SIZE);
                return (
                  <div key={location} className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-sm font-bold text-slate-800">{location}</h2>
                      <p className="text-[11px] text-slate-500">{rooms.length} kamar</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      Transaksi: <span className="font-bold text-slate-800">{totalTransaksi}</span> · Pendapatan: <span className="font-bold text-emerald-700">{formatRupiah(totalPendapatan)}</span>
                    </div>
                    <div className="space-y-2">
                      {visibleRooms.map((room) => (
                        <button key={room.id} type="button" onClick={() => setSelectedReportRoom(room)} className="w-full rounded-xl border px-3 py-2 text-left hover:bg-slate-50">
                          <p className="text-sm font-bold text-slate-800">{room.name}</p>
                          <p className="text-xs text-slate-600">Digunakan: <span className="font-semibold text-slate-800">{room.jumlahDigunakan || 0}x</span></p>
                          <p className="text-xs text-slate-600">Pendapatan: <span className="font-semibold text-emerald-700">{formatRupiah(room.pendapatan || 0)}</span></p>
                        </button>
                      ))}
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between text-xs pt-1">
                        <button
                          type="button"
                          disabled={currentPage <= 1}
                          onClick={() => setReportPageByLocation((prev) => ({ ...prev, [location]: Math.max(1, currentPage - 1) }))}
                          className="rounded-lg border px-2 py-1 disabled:opacity-40"
                        >
                          Sebelumnya
                        </button>
                        <span className="text-slate-500">Hal {currentPage}/{totalPages}</span>
                        <button
                          type="button"
                          disabled={currentPage >= totalPages}
                          onClick={() => setReportPageByLocation((prev) => ({ ...prev, [location]: Math.min(totalPages, currentPage + 1) }))}
                          className="rounded-lg border px-2 py-1 disabled:opacity-40"
                        >
                          Berikutnya
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}

        {activeView === 'ketersediaan' && (
          <>
        {/* Stats bar */}
        {!loading && userRole === 'karyawan' && Object.keys(groupedRooms).length === 0 && (
          <div className="bg-white rounded-[2rem] p-10 border-2 border-orange-100 shadow-xl text-center space-y-6 mt-8">
            <div className="h-24 w-24 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-2 animate-pulse">
              <AlertTriangle className="h-12 w-12" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900">Penempatan Belum Diatur</h2>
              <p className="text-slate-600 mt-3 leading-relaxed">
                Akun Anda belum ditempatkan di lokasi apartemen manapun. 
                <br /><br />
                Silakan hubungi <span className="font-bold text-blue-600">Admin/Superadmin</span> untuk mengatur penempatan kerja akun Anda agar bisa memantau status kamar.
              </p>
            </div>
          </div>
        )}

        {!loading && (Object.keys(groupedRooms).length > 0 || userRole !== 'karyawan') && (
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setFilterStatus('ALL')}
              className={`rounded-2xl p-3 text-center transition shadow-sm border ${
                filterStatus === 'ALL' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-800 hover:bg-slate-50'
              }`}
            >
              <p className="text-xl font-bold">{stats.total}</p>
              <p className={`text-[10px] mt-0.5 ${filterStatus === 'ALL' ? 'text-slate-300' : 'text-slate-500'}`}>Total</p>
            </button>
            <button
              onClick={() => setFilterStatus('OCCUPIED')}
              className={`rounded-2xl p-3 text-center transition shadow-sm border ${
                filterStatus === 'OCCUPIED' ? 'bg-red-600 text-white border-red-600' : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100'
              }`}
            >
              <p className="text-xl font-bold">{stats.occupied}</p>
              <p className={`text-[10px] mt-0.5 ${filterStatus === 'OCCUPIED' ? 'text-red-200' : 'text-red-500'}`}>Terisi</p>
            </button>
            <button
              onClick={() => setFilterStatus('AVAILABLE')}
              className={`rounded-2xl p-3 text-center transition shadow-sm border ${
                filterStatus === 'AVAILABLE' ? 'bg-green-600 text-white border-green-600' : 'bg-green-50 text-green-600 border-green-100 hover:bg-green-100'
              }`}
            >
              <p className="text-xl font-bold">{stats.available}</p>
              <p className={`text-[10px] mt-0.5 ${filterStatus === 'AVAILABLE' ? 'text-green-200' : 'text-green-500'}`}>Tersedia</p>
            </button>
          </div>
        )}

        {loading ? (
          <p className="py-12 text-center text-slate-500">Memuat data kamar...</p>
        ) : Object.keys(groupedRooms).length === 0 ? (
          <p className="py-12 text-center text-slate-500">Belum ada kamar terdaftar.</p>
        ) : (
          Object.keys(groupedRooms).sort().map((location) => {
            const allRooms = groupedRooms[location];
            const allFilteredRooms = allRooms.filter(room => {
              if (filterStatus === 'OCCUPIED') return room.status === 'terisi';
              if (filterStatus === 'AVAILABLE') return room.status === 'tersedia';
              return true;
            });
            if (allFilteredRooms.length === 0) return null;

            const expanded = !!expandedLocations[location];
            const visibleRooms = expanded ? allFilteredRooms : allFilteredRooms.slice(0, INITIAL_VISIBLE_ROOMS);
            const hasMore = allFilteredRooms.length > INITIAL_VISIBLE_ROOMS;
            const occupiedCount = allRooms.filter((r) => r.status === 'terisi').length;

            return (
              <motion.div key={location} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                    <MapPin className="h-4 w-4 text-cyan-600" />
                    {location}
                  </h2>
                  <span className="text-xs text-slate-400">{occupiedCount}/{allRooms.length} terisi total</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {visibleRooms.map((room) => {
                    const isOccupied = room.status === 'terisi';
                    const s_depCash = room.tx?.deposit_cash || 0;
                    const s_depTrans = room.tx?.deposit_transfer || 0;
                    const hasDeposit = s_depCash > 0 || s_depTrans > 0;
                    const depLabel = s_depCash > 0 && s_depTrans > 0 ? 'Mix' : (s_depCash > 0 ? 'CASH' : 'TF');

                    return (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => setSelectedRoom(room)}
                        className={`relative rounded-xl border-2 p-2.5 text-left transition active:scale-95 ${
                          isOccupied
                            ? 'border-red-200 bg-red-50 hover:bg-red-100'
                            : 'border-green-200 bg-green-50 hover:bg-green-100'
                        }`}
                      >
                         {/* Deposit badge */}
                         {hasDeposit && (
                           <span className={`absolute right-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[9px] font-extrabold shadow-sm border ${
                             room.tx?.deposit_returned_at 
                               ? 'bg-green-500 text-white border-green-600'
                               : depLabel === 'CASH'
                                 ? 'bg-green-500 text-white border-green-600'
                                 : depLabel === 'TF'
                                   ? 'bg-blue-500 text-white border-blue-600'
                                   : depLabel === 'Mix'
                                     ? 'bg-purple-500 text-white border-purple-600'
                                     : 'bg-yellow-400 text-red-700 border-yellow-500'
                           }`}>
                             Dep: {depLabel}
                           </span>
                         )}

                        <p className="text-sm font-bold text-slate-800 truncate pr-8">{room.name}</p>

                        {isOccupied ? (
                          <div className="mt-1 space-y-0.5">
                            <p className="truncate text-[11px] font-semibold text-red-700 flex items-center gap-1">
                              <User className="inline h-2.5 w-2.5 flex-shrink-0" />
                              {room.customerName}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              In: {formatTime(room.checkInTime)}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              Out: {formatTime(room.readyAt)} ({formatDate(room.readyAt)})
                            </p>
                          </div>
                        ) : (
                          <p className="mt-1 text-[11px] font-semibold text-green-600">Tersedia</p>
                        )}
                      </button>
                    );
                  })}
                </div>

                {hasMore && (
                  <button
                    type="button"
                    onClick={() => setExpandedLocations((prev) => ({ ...prev, [location]: !prev[location] }))}
                    className="mt-3 inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {expanded ? 'Lebih sedikit' : `+${allRooms.length - INITIAL_VISIBLE_ROOMS} kamar lainnya`}
                  </button>
                )}
              </motion.div>
            );
          })
        )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedRoom && (
          <RoomDetailModal
            room={selectedRoom}
            onClose={() => setSelectedRoom(null)}
            onCheckOut={handleCheckOut}
            canCheckout={
              selectedRoom.status === 'terisi' &&
              (canCheckoutAll || selectedRoom.transactionUserId === user?.id)
            }
          />
        )}
        {selectedReportRoom && (
          <ReportRoomDetailModal
            room={selectedReportRoom}
            transactions={reportTransactionsByRoom[`${selectedReportRoom.lokasi || ''}__${selectedReportRoom.name || ''}`] || []}
            onClose={() => setSelectedReportRoom(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default KetersediaanKamar;
