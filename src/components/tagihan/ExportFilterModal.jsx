import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * ExportFilterModal — Shared export dialog with category, location, and date filters.
 *
 * @param {object} props
 * @param {boolean} props.open - Controlled open state
 * @param {(open: boolean) => void} props.onOpenChange - Open state setter
 * @param {(filters: { categories: string[], locations: string[], dateStart: string|null, dateEnd: string|null }) => void} props.onExport - Export callback
 * @param {Array<{ label: string, value: string }>} [props.categories] - Available categories
 * @param {Array<{ label: string, value: string }>} [props.locations] - Available locations
 */
export function ExportFilterModal({
  open,
  onOpenChange,
  onExport,
  categories = [],
  locations = [],
}) {
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  /**
   * Toggle a category in the selection.
   * @param {string} cat - Category value
   */
  const handleCategoryToggle = (cat) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  /**
   * Toggle a location in the selection.
   * @param {string} loc - Location value
   */
  const handleLocationToggle = (loc) => {
    setSelectedLocations((prev) =>
      prev.includes(loc) ? prev.filter((l) => l !== loc) : [...prev, loc]
    );
  };

  /**
   * Trigger the export with current filter selections.
   */
  const handleExport = () => {
    onExport({
      categories: selectedCategories,
      locations: selectedLocations,
      dateStart: dateStart || null,
      dateEnd: dateEnd || null,
    });
    setSelectedCategories([]);
    setSelectedLocations([]);
    setDateStart('');
    setDateEnd('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Filter</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Category Multi-Select */}
          {categories.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-gray-700">Kategori</p>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => handleCategoryToggle(cat.value)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      selectedCategories.includes(cat.value)
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Location Multi-Select */}
          {locations.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-gray-700">Lokasi</p>
              <div className="flex flex-wrap gap-2">
                {locations.map((loc) => (
                  <button
                    key={loc.value}
                    type="button"
                    onClick={() => handleLocationToggle(loc.value)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      selectedLocations.includes(loc.value)
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {loc.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Date Range */}
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-700">Rentang Tanggal</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <span className="text-gray-500">—</span>
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button onClick={handleExport}>Export</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
