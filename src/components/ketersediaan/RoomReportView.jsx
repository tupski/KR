import React from 'react';
import { formatRupiah } from '@/lib/formatRupiah';

const REPORT_PAGE_SIZE = 10;

export function RoomReportView({
  groupedRooms,
  transactionsByRoom,
  loading,
  reportFilterType,
  reportMonth,
  reportStartDate,
  reportEndDate,
  reportLocationFilter,
  roomSearchTerm,
  reportLocations,
  reportRoomOptions,
  reportPageByLocation,
  onFilterTypeChange,
  onMonthChange,
  onStartDateChange,
  onEndDateChange,
  onLocationFilterChange,
  onSearchTermChange,
  onPageChange,
  onRoomSelect,
}) {
  if (loading) {
    return <p className="py-10 text-center text-slate-500">Memuat laporan kamar...</p>;
  }

  if (Object.keys(groupedRooms).length === 0) {
    return <p className="py-10 text-center text-slate-500">Belum ada data kamar untuk laporan.</p>;
  }

  return (
    <>
      {/* Filter controls */}
      <div className="rounded-2xl border bg-white p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onFilterTypeChange('bulan')}
            className={`rounded-xl px-3 py-2 text-xs font-bold ${reportFilterType === 'bulan' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            Per Bulan
          </button>
          <button
            type="button"
            onClick={() => onFilterTypeChange('rentang')}
            className={`rounded-xl px-3 py-2 text-xs font-bold ${reportFilterType === 'rentang' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            Rentang Tanggal
          </button>
        </div>

        {reportFilterType === 'bulan' ? (
          <input
            type="month"
            value={reportMonth}
            onChange={(e) => onMonthChange(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={reportStartDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={reportEndDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-2">
          <select
            value={reportLocationFilter}
            onChange={(e) => onLocationFilterChange(e.target.value)}
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
              onChange={(e) => onSearchTermChange(e.target.value)}
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

      {/* Report rooms grouped by location */}
      {Object.keys(groupedRooms).sort().map((location) => {
        if (reportLocationFilter !== 'ALL' && reportLocationFilter !== location) return null;

        const term = roomSearchTerm.trim().toLowerCase();
        const rooms = groupedRooms[location].filter((room) => {
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
                <button
                  key={room.id}
                  type="button"
                  onClick={() => onRoomSelect(room)}
                  className="w-full rounded-xl border px-3 py-2 text-left hover:bg-slate-50"
                >
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
                  onClick={() => onPageChange(location, currentPage - 1)}
                  className="rounded-lg border px-2 py-1 disabled:opacity-40"
                >
                  Sebelumnya
                </button>
                <span className="text-slate-500">Hal {currentPage}/{totalPages}</span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => onPageChange(location, currentPage + 1)}
                  className="rounded-lg border px-2 py-1 disabled:opacity-40"
                >
                  Berikutnya
                </button>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
