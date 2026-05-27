import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useRoomAvailability } from '@/hooks/useRoomAvailability';
import { useRoomReport } from '@/hooks/useRoomReport';
import { supabase } from '@/lib/customSupabaseClient';
import { getActiveTransaction, calcEndAt } from '@/lib/roomUtils';
import { toast } from '@/components/ui/use-toast';
import { RoomAvailabilityView } from './RoomAvailabilityView';
import { RoomReportView } from './RoomReportView';
import { RoomDetailModal } from './RoomDetailModal';
import { ReportRoomDetailModal } from './ReportRoomDetailModal';

const REPORT_PAGE_SIZE = 10;

/**
 * Helper: get a canonical location key for room/transaction lookup.
 */
function roomKey(lokasi, name) {
  return `${lokasi || ''}__${name || ''}`;
}

/**
 * Normalize a room record into a consistent shape.
 * Handles both `lokasi`/`name` and `apartment_location`/`nomor_kamar` field names.
 */
function normalizeRoom(room, activeTx, feePaid) {
  const lokasi = room.lokasi || room.apartment_location || '';
  const name = room.name || room.nomor_kamar || '';

  if (activeTx) {
    const endAt = calcEndAt(activeTx);
    return {
      ...room,
      lokasi,
      name,
      tx: activeTx,
      transactionId: activeTx.id,
      transactionUserId: activeTx.user_id,
      status: 'terisi',
      readyAt: endAt,
      customerName: activeTx.customer_name,
      checkInTime: new Date(activeTx.checkin_at || activeTx.created_at),
      feePaid,
    };
  }

  return {
    ...room,
    lokasi,
    name,
    tx: null,
    transactionId: null,
    transactionUserId: null,
    status: 'tersedia',
    readyAt: null,
    customerName: null,
    checkInTime: null,
    feePaid: false,
  };
}

export function KetersediaanKamarPage() {
  const { user, userRole, isAdmin, isSuperAdmin } = useAuth();

  /* ── Hooks ── */
  const {
    rooms: rawRooms,
    transactions,
    paidFees: rawPaidFees,
    assignments,
    isLoading: availLoading,
    refresh: refreshAvailability,
  } = useRoomAvailability({ user }, userRole);

  const reportHook = useRoomReport();

  /* ── View toggle ── */
  const [activeView, setActiveView] = useState('ketersediaan');
  const [filterStatus, setFilterStatus] = useState('ALL');

  /* ── Modals ── */
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [selectedReportRoom, setSelectedReportRoom] = useState(null);

  /* ── Report local state ── */
  const [reportFilterType, setReportFilterType] = useState('bulan');
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reportStartDate, setReportStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [reportEndDate, setReportEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [reportLocationFilter, setReportLocationFilter] = useState('ALL');
  const [roomSearchTerm, setRoomSearchTerm] = useState('');
  const [reportPageByLocation, setReportPageByLocation] = useState({});

  const canCheckoutAll = isAdmin || isSuperAdmin;

  /* ── Process availability data into grouped rooms ── */
  const groupedRooms = useMemo(() => {
    const now = new Date();
    const paidFeeSet = new Set(
      (rawPaidFees || []).map((pf) => {
        const date = pf.paid_at ? new Date(pf.paid_at).toDateString() : '';
        return `${pf.marketing_name}__${date}`;
      }),
    );

    const roomStatus = (rawRooms || []).map((room) => {
      const lokasi = room.lokasi || room.apartment_location;
      const name = room.name || room.nomor_kamar;
      const activeTx = getActiveTransaction(lokasi, name, transactions, now);

      let feePaid = false;
      if (activeTx?.marketing_name) {
        const key = `${activeTx.marketing_name}__${new Date(activeTx.checkin_at || activeTx.created_at).toDateString()}`;
        feePaid = paidFeeSet.has(key);
      }

      return normalizeRoom(room, activeTx, feePaid);
    });

    const grouped = roomStatus.reduce((acc, room) => {
      const loc = room.lokasi || 'Lainnya';
      if (!acc[loc]) acc[loc] = [];
      acc[loc].push(room);
      return acc;
    }, {});

    Object.keys(grouped).forEach((loc) =>
      grouped[loc].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    );

    return grouped;
  }, [rawRooms, transactions, rawPaidFees]);

  /* ── Stats ── */
  const stats = useMemo(() => {
    const all = Object.values(groupedRooms).flat();
    const total = all.length;
    const occupied = all.filter((r) => r.status === 'terisi').length;
    return { total, occupied, available: total - occupied };
  }, [groupedRooms]);

  /* ── Process report data ──
   *  Use rawRooms (all rooms) as the base, then annotate with transaction
   *  aggregates from the reportHook. This matches the original behavior
   *  where rooms with zero transactions still appear in the report.
   */
  const { reportGroupedRooms, transactionsByRoom } = useMemo(() => {
    if (!rawRooms || rawRooms.length === 0) {
      return { reportGroupedRooms: {}, transactionsByRoom: {} };
    }

    // Aggregate transactions per room
    const txAggMap = new Map();   // key → { jumlahDigunakan, pendapatan }
    const txDetailMap = new Map(); // key → Transaction[]

    (reportHook.transactions || []).forEach((tx) => {
      const loc = tx.apartment_location || 'Lainnya';
      const key = roomKey(loc, tx.room_number);
      const agg = txAggMap.get(key) || { jumlahDigunakan: 0, pendapatan: 0 };
      agg.jumlahDigunakan += 1;
      agg.pendapatan += Number(tx.cash_amount || 0) + Number(tx.transfer_amount || 0);
      txAggMap.set(key, agg);

      const details = txDetailMap.get(key) || [];
      details.push(tx);
      txDetailMap.set(key, details);
    });

    // Build grouped rooms from the base room list
    const grouped = {};
    (rawRooms || []).forEach((room) => {
      const lokasi = room.lokasi || room.apartment_location || 'Lainnya';
      const name = room.name || room.nomor_kamar || '';
      const key = roomKey(lokasi, name);
      const agg = txAggMap.get(key) || { jumlahDigunakan: 0, pendapatan: 0 };

      if (!grouped[lokasi]) grouped[lokasi] = [];
      grouped[lokasi].push({
        id: room.id,
        lokasi,
        name,
        jumlahDigunakan: agg.jumlahDigunakan,
        pendapatan: agg.pendapatan,
      });
    });

    Object.keys(grouped).forEach((loc) =>
      grouped[loc].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    );

    return {
      reportGroupedRooms: grouped,
      transactionsByRoom: Object.fromEntries(txDetailMap),
    };
  }, [rawRooms, reportHook.transactions]);

  /* ── Report derived data ── */
  const reportLocations = useMemo(
    () => ['ALL', ...Object.keys(reportGroupedRooms).sort((a, b) => a.localeCompare(b))],
    [reportGroupedRooms],
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

  /* ── Realtime subscription ── */
  useEffect(() => {
    const channel = supabase
      .channel('realtime-kamar-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, refreshAvailability)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nomor_kamar' }, refreshAvailability)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [refreshAvailability]);

  /* ── Sync report filters to hook ── */
  const syncReportFilters = useCallback((type, value) => {
    if (type === 'bulan') {
      reportHook.setMultipleFilters({ bulan: value, startDate: null, endDate: null });
    } else {
      reportHook.setMultipleFilters({ bulan: null, startDate: value.startDate, endDate: value.endDate });
    }
  }, [reportHook]);

  const handleFilterTypeChange = useCallback((type) => {
    setReportFilterType(type);
    if (type === 'bulan') {
      syncReportFilters('bulan', reportMonth);
    } else {
      syncReportFilters('rentang', { startDate: reportStartDate, endDate: reportEndDate });
    }
  }, [reportMonth, reportStartDate, reportEndDate, syncReportFilters]);

  const handleMonthChange = useCallback((val) => {
    setReportMonth(val);
    syncReportFilters('bulan', val);
  }, [syncReportFilters]);

  const handleStartDateChange = useCallback((val) => {
    setReportStartDate(val);
    if (reportEndDate) syncReportFilters('rentang', { startDate: val, endDate: reportEndDate });
  }, [reportEndDate, syncReportFilters]);

  const handleEndDateChange = useCallback((val) => {
    setReportEndDate(val);
    if (reportStartDate) syncReportFilters('rentang', { startDate: reportStartDate, endDate: val });
  }, [reportStartDate, syncReportFilters]);

  const handleLocationFilterChange = useCallback((val) => {
    setReportLocationFilter(val);
  }, []);

  const handleSearchTermChange = useCallback((val) => {
    setRoomSearchTerm(val);
    reportHook.setFilters('searchQuery', val);
  }, [reportHook]);

  const handlePageChange = useCallback((location, page) => {
    setReportPageByLocation((prev) => ({ ...prev, [location]: page }));
  }, []);

  /* ── Checkout handler ── */
  const handleCheckOut = useCallback(async (room) => {
    if (!room.transactionId) return;

    const isOwner = room.transactionUserId === user?.id;
    if (!canCheckoutAll && !isOwner) {
      toast({ title: 'Akses ditolak', description: 'Karyawan hanya bisa checkout transaksi yang diinput sendiri.', variant: 'destructive' });
      return;
    }

    if (!window.confirm(`Yakin checkout ${room.name} (${room.lokasi})?`)) return;

    const { error } = await supabase
      .from('transactions')
      .update({ checkout_at: new Date().toISOString() })
      .eq('id', room.transactionId);

    if (error) {
      toast({ title: 'Gagal Check Out', description: error.message, variant: 'destructive' });
    } else {
      await supabase.rpc('log_activity', {
        p_action: 'Checkout Manual',
        p_details: `Customer: ${room.customerName}, Unit: ${room.lokasi} - ${room.name}`,
        p_metadata: { transaction_id: room.transactionId },
      });
      toast({ title: 'Check Out Berhasil ✅' });
      refreshAvailability();
    }
  }, [user?.id, canCheckoutAll, refreshAvailability]);

  const isKaryawanNoAssignment =
    userRole === 'karyawan' &&
    assignments !== null &&
    (!Array.isArray(assignments) || assignments.length === 0);

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

        {/* View toggle */}
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

        {/* Report view */}
        {activeView === 'laporan' && (
          <RoomReportView
            groupedRooms={reportGroupedRooms}
            transactionsByRoom={transactionsByRoom}
            loading={reportHook.isLoading}
            reportFilterType={reportFilterType}
            reportMonth={reportMonth}
            reportStartDate={reportStartDate}
            reportEndDate={reportEndDate}
            reportLocationFilter={reportLocationFilter}
            roomSearchTerm={roomSearchTerm}
            reportLocations={reportLocations}
            reportRoomOptions={reportRoomOptions}
            reportPageByLocation={reportPageByLocation}
            onFilterTypeChange={handleFilterTypeChange}
            onMonthChange={handleMonthChange}
            onStartDateChange={handleStartDateChange}
            onEndDateChange={handleEndDateChange}
            onLocationFilterChange={handleLocationFilterChange}
            onSearchTermChange={handleSearchTermChange}
            onPageChange={handlePageChange}
            onRoomSelect={setSelectedReportRoom}
          />
        )}

        {/* Availability view */}
        {activeView === 'ketersediaan' && (
          <RoomAvailabilityView
            groupedRooms={groupedRooms}
            stats={stats}
            loading={availLoading}
            filterStatus={filterStatus}
            onFilterStatusChange={setFilterStatus}
            onRoomSelect={setSelectedRoom}
            userRole={userRole}
            isKaryawanNoAssignment={isKaryawanNoAssignment}
          />
        )}
      </div>

      {/* Modals */}
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
            transactions={transactionsByRoom[roomKey(selectedReportRoom.lokasi, selectedReportRoom.name)] || []}
            onClose={() => setSelectedReportRoom(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
