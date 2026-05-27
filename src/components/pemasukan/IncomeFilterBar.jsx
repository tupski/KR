import React from 'react';
import { Calendar, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SHIFT_OPTIONS = ['Semua Shift', 'Pagi', 'Malam', 'Long Shift'];
const FILTER_TYPE_OPTIONS = ['harian', 'bulanan', 'rentang'];

/**
 * IncomeFilterBar — Date range, location, shift, and search filter controls.
 *
 * Parent supplies filter values and setters from useIncomeFilters hook.
 *
 * @param {object} props
 * @param {object} props.filters - Filter state from useIncomeFilters
 * @param {(field: string, value: any) => void} props.setFilter - Set a single filter field
 * @param {string[]} props.locationOptions - Available location names
 * @param {() => void} [props.onExport] - Export button click handler
 */
export function IncomeFilterBar({ filters, setFilter, locationOptions = [], onExport }) {
  const monthInputValue =
    filters.filterType === 'bulanan' && filters.month
      ? filters.month
      : filters.date
        ? filters.date.slice(0, 7)
        : new Date().toISOString().slice(0, 7);

  return (
    <div className="glassmorphic-card space-y-4 p-5">
      {/* Header row with export button */}
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-bold text-gray-800">
          <Calendar className="h-5 w-5 text-blue-500" />
          Filter Data
        </h2>
        {onExport && (
          <Button
            onClick={onExport}
            size="sm"
            variant="outline"
            className="border-green-300 bg-green-100 text-green-800 hover:bg-green-200"
          >
            <Download className="mr-2 h-4 w-4" />
            Ekspor
          </Button>
        )}
      </div>

      {/* Filter type tabs */}
      <div className="flex gap-2">
        {FILTER_TYPE_OPTIONS.map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter('filterType', tab)}
            className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold ${
              filters.filterType === tab
                ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                : 'bg-gray-100 text-gray-900'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Date inputs based on filter type */}
      {filters.filterType === 'harian' && (
        <input
          type="date"
          value={filters.date || ''}
          onChange={(e) => setFilter('date', e.target.value)}
          className="w-full rounded-xl border-2 px-4 py-2.5 text-gray-900"
        />
      )}

      {filters.filterType === 'bulanan' && (
        <input
          type="month"
          value={monthInputValue}
          onChange={(e) => setFilter('month', e.target.value)}
          className="w-full rounded-xl border-2 px-4 py-2.5 text-gray-900"
        />
      )}

      {filters.filterType === 'rentang' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              value={filters.dateStart || ''}
              onChange={(e) => setFilter('dateStart', e.target.value)}
              className="w-full rounded-xl border-2 px-3 py-2.5 text-gray-900"
            />
            <input
              type="date"
              value={filters.dateEnd || ''}
              onChange={(e) => setFilter('dateEnd', e.target.value)}
              className="w-full rounded-xl border-2 px-3 py-2.5 text-gray-900"
            />
          </div>
        </div>
      )}

      {/* Location and shift selects */}
      <div className="grid grid-cols-2 gap-3">
        <select
          value={filters.location || ''}
          onChange={(e) => setFilter('location', e.target.value)}
          className="w-full rounded-xl border-2 bg-white px-3 py-2.5 text-sm text-gray-900"
        >
          <option value="">Semua Lokasi</option>
          {locationOptions.map((lok) => (
            <option key={lok} value={lok}>
              {lok}
            </option>
          ))}
        </select>

        <select
          value={filters.shift || ''}
          onChange={(e) => setFilter('shift', e.target.value)}
          className="w-full rounded-xl border-2 bg-white px-3 py-2.5 text-sm text-gray-900"
        >
          {SHIFT_OPTIONS.map((s) => (
            <option key={s} value={s === 'Semua Shift' ? '' : s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Search input */}
      <input
        type="text"
        value={filters.searchQuery || ''}
        onChange={(e) => setFilter('searchQuery', e.target.value)}
        className="w-full rounded-xl border-2 px-3 py-2.5 text-sm text-gray-900"
        placeholder="Cari customer, marketing, input oleh, lokasi atau kamar..."
      />
    </div>
  );
}
