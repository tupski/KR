import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle, ChevronDown, ChevronUp, MapPin, User,
} from 'lucide-react';
import { formatTimeWIB, formatDate } from '@/lib/roomUtils';

const INITIAL_VISIBLE_ROOMS = 8;

export function RoomAvailabilityView({
  groupedRooms,
  stats,
  loading,
  filterStatus,
  onFilterStatusChange,
  onRoomSelect,
  userRole,
  isKaryawanNoAssignment,
}) {
  const [expandedLocations, setExpandedLocations] = useState({});

  const toggleExpand = (location) => {
    setExpandedLocations((prev) => ({ ...prev, [location]: !prev[location] }));
  };

  const formatTimeSimple = (date) =>
    date ? date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';

  const formatDateSimple = (date) =>
    date ? date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '';

  /* ── Karyawan no-assignment placeholder ── */
  if (!loading && userRole === 'karyawan' && isKaryawanNoAssignment) {
    return (
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
    );
  }

  /* ── Stats bar ── */
  const showStats = !loading && (Object.keys(groupedRooms).length > 0 || userRole !== 'karyawan');

  return (
    <>
      {showStats && (
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => onFilterStatusChange('ALL')}
            className={`rounded-2xl p-3 text-center transition shadow-sm border ${
              filterStatus === 'ALL' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-800 hover:bg-slate-50'
            }`}
          >
            <p className="text-xl font-bold">{stats.total}</p>
            <p className={`text-[10px] mt-0.5 ${filterStatus === 'ALL' ? 'text-slate-300' : 'text-slate-500'}`}>Total</p>
          </button>
          <button
            onClick={() => onFilterStatusChange('OCCUPIED')}
            className={`rounded-2xl p-3 text-center transition shadow-sm border ${
              filterStatus === 'OCCUPIED' ? 'bg-red-600 text-white border-red-600' : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100'
            }`}
          >
            <p className="text-xl font-bold">{stats.occupied}</p>
            <p className={`text-[10px] mt-0.5 ${filterStatus === 'OCCUPIED' ? 'text-red-200' : 'text-red-500'}`}>Terisi</p>
          </button>
          <button
            onClick={() => onFilterStatusChange('AVAILABLE')}
            className={`rounded-2xl p-3 text-center transition shadow-sm border ${
              filterStatus === 'AVAILABLE' ? 'bg-green-600 text-white border-green-600' : 'bg-green-50 text-green-600 border-green-100 hover:bg-green-100'
            }`}
          >
            <p className="text-xl font-bold">{stats.available}</p>
            <p className={`text-[10px] mt-0.5 ${filterStatus === 'AVAILABLE' ? 'text-green-200' : 'text-green-500'}`}>Tersedia</p>
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <p className="py-12 text-center text-slate-500">Memuat data kamar...</p>
      )}

      {/* Empty state */}
      {!loading && Object.keys(groupedRooms).length === 0 && (
        <p className="py-12 text-center text-slate-500">Belum ada kamar terdaftar.</p>
      )}

      {/* Room grid grouped by location */}
      {!loading && Object.keys(groupedRooms).length > 0 && (
        Object.keys(groupedRooms).sort().map((location) => {
          const allRooms = groupedRooms[location];
          const allFilteredRooms = allRooms.filter((room) => {
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
                      key={room.id || room.nomor_kamar}
                      type="button"
                      onClick={() => onRoomSelect(room)}
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
                            In: {formatTimeSimple(room.checkInTime)}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            Out: {formatTimeSimple(room.readyAt)} ({formatDateSimple(room.readyAt)})
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
                  onClick={() => toggleExpand(location)}
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
  );
}
