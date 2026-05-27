import React, { useState, useEffect, useMemo } from 'react';
import { Search, X, Clock, CheckCircle } from 'lucide-react';
import Select from 'react-select';
import { supabase } from '@/lib/customSupabaseClient';

/**
 * Quick-date preset configuration.
 */
const QUICK_PRESETS = [
  { key: 'hariini', label: 'Hari Ini' },
  { key: 'kemarin', label: 'Kemarin' },
  { key: '7hari', label: '7 Hari' },
  { key: '30hari', label: '30 Hari' },
  { key: 'custom', label: 'Custom' },
];

/**
 * React-select base styles (compact).
 */
const SELECT_STYLES = {
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

/**
 * DepositFilterBar — Filter controls for deposit page.
 *
 * @param {object}   props
 * @param {object}   props.filters        - Current filter values from useDepositFilters
 * @param {string}   props.activeTab      - 'belum' | 'sudah'
 * @param {function} props.setFilter     - (field, value) => void
 * @param {function} props.handleQuickDateFilter - (preset) => void
 * @param {function} props.clearFilters  - () => void
 * @param {function} props.setActiveTab  - (tab) => void
 */
export function DepositFilterBar({
  filters,
  activeTab,
  setFilter,
  handleQuickDateFilter,
  clearFilters,
  setActiveTab,
}) {
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [showLocationRoomFilter, setShowLocationRoomFilter] = useState(false);
  const [locationOptions, setLocationOptions] = useState([]);
  const [rooms, setRooms] = useState([]);

  // Load all location options once on mount
  useEffect(() => {
    const loadLocations = async () => {
      const { data } = await supabase.from('nomor_kamar').select('lokasi');
      const locs = [...new Set((data || []).map((r) => r.lokasi).filter(Boolean))].sort();
      setLocationOptions(locs.map((l) => ({ value: l, label: l })));
    };
    loadLocations();
  }, []);

  // Load rooms filtered by selected locations
  useEffect(() => {
    if (filters.selectedLocations.length === 0) {
      setRooms([]);
      return;
    }
    const loadRooms = async () => {
      let query = supabase.from('nomor_kamar').select('name, lokasi');
      if (filters.selectedLocations.length > 0) {
        query = query.in('lokasi', filters.selectedLocations);
      }
      const { data } = await query.order('name');
      setRooms(data || []);
    };
    loadRooms();
  }, [filters.selectedLocations]);

  // Room options derived from loaded rooms
  const roomOptions = useMemo(() => {
    return [...new Set(rooms.map((r) => r.name))].sort().map((r) => ({ value: r, label: r }));
  }, [rooms]);

  const hasActiveFilters =
    filters.searchName ||
    filters.depositType !== 'semua' ||
    filters.selectedLocations.length > 0 ||
    filters.selectedRooms.length > 0 ||
    filters.quickDateFilter;

  const handleLocationChange = (selected) => {
    const locations = selected ? selected.map((s) => s.value) : [];
    setFilter('selectedLocations', locations);
    setFilter('selectedRooms', []);
  };

  const handleRoomChange = (selected) => {
    setFilter('selectedRooms', selected ? selected.map((s) => s.value) : []);
  };

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('belum')}
          className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
            activeTab === 'belum'
              ? 'bg-amber-500 text-white shadow-md'
              : 'bg-white text-amber-700 hover:bg-amber-50'
          }`}
        >
          <Clock className="mb-1 inline h-4 w-4" /> Belum Dikembalikan
        </button>
        <button
          onClick={() => setActiveTab('sudah')}
          className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
            activeTab === 'sudah'
              ? 'bg-green-600 text-white shadow-md'
              : 'bg-white text-green-700 hover:bg-green-50'
          }`}
        >
          <CheckCircle className="mb-1 inline h-4 w-4" /> Dikembalikan
        </button>
      </div>

      {/* Filter Panel */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
            <Search className="h-4 w-4" /> Filter
          </h3>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Reset
            </button>
          )}
        </div>

        {/* Row 1: Nama + Jenis Deposit */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">
              Nama / Marketing
            </label>
            <input
              type="text"
              value={filters.searchName}
              onChange={(e) => setFilter('searchName', e.target.value)}
              placeholder="Cari nama tamu atau marketing..."
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">
              Jenis Deposit
            </label>
            <select
              value={filters.depositType}
              onChange={(e) => setFilter('depositType', e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
            >
              <option value="semua">Semua</option>
              <option value="TUNAI">Tunai</option>
              <option value="TRANSFER">Transfer</option>
            </select>
          </div>
        </div>

        {/* Rentang Tanggal Filter */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-[11px] font-semibold text-slate-500">
              Rentang Tanggal
            </label>
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
                {QUICK_PRESETS.map((btn) => (
                  <button
                    key={btn.key}
                    onClick={() => handleQuickDateFilter(btn.key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      filters.quickDateFilter === btn.key
                        ? 'bg-indigo-500 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
              {filters.quickDateFilter === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] text-slate-400">Dari</label>
                    <input
                      type="date"
                      value={filters.dateFrom || ''}
                      onChange={(e) => setFilter('dateFrom', e.target.value)}
                      className="w-full rounded-lg border px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] text-slate-400">Sampai</label>
                    <input
                      type="date"
                      value={filters.dateTo || ''}
                      onChange={(e) => setFilter('dateTo', e.target.value)}
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
            <label className="block text-[11px] font-semibold text-slate-500">
              Lokasi & Kamar
            </label>
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
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                  Lokasi Apartemen
                </label>
                <Select
                  isMulti
                  options={locationOptions}
                  value={locationOptions.filter((o) =>
                    filters.selectedLocations.includes(o.value)
                  )}
                  onChange={handleLocationChange}
                  styles={SELECT_STYLES}
                  placeholder="Semua Lokasi"
                  isSearchable
                  className="text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                  Nomor Kamar
                </label>
                <Select
                  isMulti
                  options={roomOptions}
                  value={roomOptions.filter((o) => filters.selectedRooms.includes(o.value))}
                  onChange={handleRoomChange}
                  styles={SELECT_STYLES}
                  placeholder="Pilih kamar..."
                  isSearchable
                  isDisabled={filters.selectedLocations.length === 0}
                  className="text-sm"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
