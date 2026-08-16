import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { financeApi } from '@/api/finance.api';

const NAMA_BULAN = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember',
];
// Mulai Senin
const NAMA_HARI = ['Sen','Sel','Rab','Kam','Jum','Sab','Min'];
const TAHUN_OPTIONS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 3 + i);

function toKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
// Hari dalam seminggu mulai Senin (0=Sen … 6=Min)
function getDowMon(year, month, day) {
  const dow = new Date(year, month, day).getDay(); // 0=Sun
  return dow === 0 ? 6 : dow - 1;
}

const KalenderLibur = ({ open, onOpenChange, showTagihan = false }) => {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [pickerMode, setPickerMode] = useState('calendar');
  const [tagihanList, setTagihanList] = useState([]);

  // Cache libur per tahun: { 2026: { "2026-01-01": "Nama Libur", ... }, ... }
  const liburCache = useRef({});
  const [liburMap, setLiburMap] = useState({});
  const [liburLoading, setLiburLoading] = useState(false);

  // Fetch data libur dari API saat viewYear berubah atau dialog dibuka
  useEffect(() => {
    if (!open) return;
    if (liburCache.current[viewYear]) {
      setLiburMap(liburCache.current[viewYear]);
      return;
    }
    setLiburLoading(true);
    fetch(`https://tanggalmerah.upset.dev/api/holidays?year=${viewYear}`)
      .then(r => r.json())
      .then(data => {
        // data.data: Array<{ date: "YYYY-MM-DD", day: string, name: string, type: "holiday"|"leave" }>
        const map = {};
        (data?.data || []).forEach(item => {
          if (item.date && item.name) map[item.date] = item.name;
        });
        liburCache.current[viewYear] = map;
        setLiburMap(map);
      })
      .catch(() => {
        // Fallback: cache kosong supaya tidak retry terus
        liburCache.current[viewYear] = {};
        setLiburMap({});
      })
      .finally(() => setLiburLoading(false));
  }, [open, viewYear]);

  // Fetch tagihan unpaid saat dialog dibuka — hanya untuk admin/super_admin
  useEffect(() => {
    if (!open || !showTagihan) {
      setTagihanList([]);
      return;
    }
    financeApi.listTagihanBulanan({ status: 'unpaid' })
      .then((data) => setTagihanList(data || []))
      .catch((error) => {
        console.error('Error fetching tagihan:', error);
        setTagihanList([]);
      });
  }, [open, showTagihan]);

  // Reset picker mode saat dialog ditutup
  useEffect(() => {
    if (!open) setPickerMode('calendar');
  }, [open]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  // Map due_date → label tagihan untuk bulan yang ditampilkan
  const tagihanMap = useMemo(() => {
    const map = {};
    tagihanList.forEach(t => {
      if (!t.due_date) return;
      const [y, m, d] = t.due_date.split('-').map(Number);
      if (y === viewYear && m - 1 === viewMonth) {
        const key = toKey(viewYear, viewMonth, d);
        if (!map[key]) map[key] = [];
        map[key].push(`${t.apartment_location}${t.room_number ? ' - ' + t.room_number : ''}`);
      }
    });
    return map;
  }, [tagihanList, viewYear, viewMonth]);

  const { days, liburBulanIni, tagihanBulanIni } = useMemo(() => {
    const firstDowMon = getDowMon(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDowMon; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    const liburList = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const key = toKey(viewYear, viewMonth, d);
      if (liburMap[key]) liburList.push({ tanggal: d, nama: liburMap[key] });
    }

    const tagihanList2 = [];
    Object.entries(tagihanMap).forEach(([key, units]) => {
      const d = parseInt(key.split('-')[2]);
      units.forEach(u => tagihanList2.push({ tanggal: d, unit: u }));
    });
    tagihanList2.sort((a, b) => a.tanggal - b.tanggal);

    return { days: cells, liburBulanIni: liburList, tagihanBulanIni: tagihanList2 };
  }, [viewYear, viewMonth, liburMap, tagihanMap]);

  const getDayColor = (day) => {
    if (!day) return '';
    const key = toKey(viewYear, viewMonth, day);
    if (liburMap[key]) return 'text-red-600 font-bold';
    const dow = getDowMon(viewYear, viewMonth, day);
    if (dow >= 5) return 'text-green-600 font-semibold';
    return 'text-gray-800';
  };

  const isToday = (day) =>
    day && today.getDate() === day &&
    today.getMonth() === viewMonth && today.getFullYear() === viewYear;

  const isLibur = (day) => day && !!liburMap[toKey(viewYear, viewMonth, day)];
  const hasTagihan = (day) => day && !!tagihanMap[toKey(viewYear, viewMonth, day)];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="bg-white w-[calc(100vw-2rem)] max-w-sm p-0 overflow-hidden rounded-2xl">
        <DialogTitle className="sr-only">Kalender Libur Nasional</DialogTitle>
        <DialogDescription className="sr-only">
          Kalender libur nasional Indonesia dan tagihan jatuh tempo
        </DialogDescription>

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-cyan-500 px-3 py-3 flex items-center gap-2">
          {pickerMode === 'calendar' ? (
            <button type="button" onClick={prevMonth}
              className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition text-white"
              aria-label="Bulan sebelumnya">
              <ChevronLeft className="w-4 h-4" />
            </button>
          ) : (
            <div className="w-8 shrink-0" />
          )}

          <div className="flex-1 flex items-center justify-center gap-1.5">
            <button type="button"
              onClick={() => setPickerMode(m => m === 'month' ? 'calendar' : 'month')}
              className="text-white font-bold text-base hover:underline">
              {NAMA_BULAN[viewMonth]}
            </button>
            <button type="button"
              onClick={() => setPickerMode(m => m === 'year' ? 'calendar' : 'year')}
              className="text-white font-bold text-base hover:underline">
              {viewYear}
            </button>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {pickerMode === 'calendar' && (
              <button type="button" onClick={nextMonth}
                className="h-8 w-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition text-white"
                aria-label="Bulan berikutnya">
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            <button type="button" onClick={() => onOpenChange(false)}
              className="h-8 w-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition text-white"
              aria-label="Tutup kalender">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Picker bulan */}
        {pickerMode === 'month' && (
          <div className="grid grid-cols-3 gap-2 p-4">
            {NAMA_BULAN.map((bln, i) => (
              <button key={bln} type="button"
                onClick={() => { setViewMonth(i); setPickerMode('calendar'); }}
                className={`py-2 rounded-xl text-sm font-semibold transition ${
                  i === viewMonth ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}>
                {bln}
              </button>
            ))}
          </div>
        )}

        {/* Picker tahun */}
        {pickerMode === 'year' && (
          <div className="grid grid-cols-3 gap-2 p-4 max-h-64 overflow-y-auto">
            {TAHUN_OPTIONS.map(y => (
              <button key={y} type="button"
                onClick={() => { setViewYear(y); setPickerMode('calendar'); }}
                className={`py-2 rounded-xl text-sm font-semibold transition ${
                  y === viewYear ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}>
                {y}
              </button>
            ))}
          </div>
        )}

        {/* Kalender */}
        {pickerMode === 'calendar' && (
          <div className="px-3 pb-4 pt-2 max-h-[70vh] overflow-y-auto">
            {/* Loading indicator */}
            {liburLoading && (
              <div className="text-center py-2 text-xs text-blue-500">Memuat data libur...</div>
            )}

            {/* Nama hari */}
            <div className="grid grid-cols-7 mb-1">
              {NAMA_HARI.map((h, i) => (
                <div key={h} className={`text-center text-xs font-semibold py-1 ${
                  i >= 5 ? 'text-green-600' : 'text-gray-500'
                }`}>{h}</div>
              ))}
            </div>

            {/* Grid tanggal */}
            <div className="grid grid-cols-7 gap-y-0.5">
              {days.map((day, idx) => (
                <div key={idx} className={[
                  'relative flex items-center justify-center h-9 w-full rounded-xl text-sm',
                  day ? 'hover:bg-gray-100 transition-colors' : '',
                  isToday(day) ? 'bg-blue-500 hover:bg-blue-600' : '',
                  isLibur(day) && !isToday(day) ? 'bg-red-50' : '',
                ].join(' ')}>
                  {day && (
                    <span className={isToday(day) ? 'text-white font-bold' : getDayColor(day)}>
                      {day}
                    </span>
                  )}
                  {day && !isToday(day) && (isLibur(day) || hasTagihan(day)) && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                      {isLibur(day) && <span className="w-1 h-1 rounded-full bg-red-400" />}
                      {hasTagihan(day) && <span className="w-1 h-1 rounded-full bg-orange-400" />}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Legenda */}
            <div className="flex flex-wrap items-center gap-3 mt-3 px-1 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Hari ini</span>
              <span className="flex items-center gap-1"><span className="text-green-600 font-semibold text-base leading-none">●</span> Weekend</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" /> Libur</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" /> Tagihan</span>
            </div>

            {/* Daftar libur */}
            {liburBulanIni.length > 0 && (
              <div className="mt-3 border-t pt-3 space-y-1.5">
                <p className="text-xs font-semibold text-gray-600">Libur {NAMA_BULAN[viewMonth]} {viewYear}</p>
                {liburBulanIni.map(({ tanggal, nama }) => (
                  <div key={`libur-${tanggal}-${nama}`} className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg bg-red-100 text-red-600 font-bold text-[11px]">
                      {tanggal}
                    </span>
                    <span className="text-gray-700 leading-tight pt-0.5">{nama}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Daftar tagihan */}
            {tagihanBulanIni.length > 0 && (
              <div className="mt-3 border-t pt-3 space-y-1.5">
                <p className="text-xs font-semibold text-gray-600">Tagihan Jatuh Tempo {NAMA_BULAN[viewMonth]} {viewYear}</p>
                {tagihanBulanIni.map(({ tanggal, unit }, i) => (
                  <div key={`tagihan-${i}`} className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg bg-orange-100 text-orange-600 font-bold text-[11px]">
                      {tanggal}
                    </span>
                    <span className="text-gray-700 leading-tight pt-0.5">Tagihan unit {unit}</span>
                  </div>
                ))}
              </div>
            )}

            {!liburLoading && liburBulanIni.length === 0 && tagihanBulanIni.length === 0 && (
              <p className="mt-3 text-xs text-center text-gray-400 border-t pt-3">
                Tidak ada libur atau tagihan bulan ini
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default KalenderLibur;
