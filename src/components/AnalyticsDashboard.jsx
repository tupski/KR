import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart2, Filter, Calendar, MapPin, AlertCircle } from 'lucide-react';
import {
  format,
  startOfMonth,
  subDays,
  subMonths,
  endOfMonth,
  differenceInDays,
  parseISO,
} from 'date-fns';
import { locationsApi } from '@/api/locations.api';

import KpiCardsHeader from './analytics/KpiCardsHeader';
import YoYComparisonSection from './analytics/YoYComparisonSection';
import MonthlyRevenueTrendSection from './analytics/MonthlyRevenueTrendSection';
import OutstandingBillsSection from './analytics/OutstandingBillsSection';
import OccupancyByLocationSection from './analytics/OccupancyByLocationSection';
import ProfitSection from './analytics/ProfitSection';
import CheckinHeatmapSection from './analytics/CheckinHeatmapSection';
import GuestSourceSection from './analytics/GuestSourceSection';
import RepeatGuestSection from './analytics/RepeatGuestSection';
import LocationFullnessSection from './analytics/LocationFullnessSection';
import StayDurationSection from './analytics/StayDurationSection';
import DailyRevenueTrendSection from './analytics/DailyRevenueTrendSection';
import NetProfitSection from './analytics/NetProfitSection';
import ExpenseBreakdownSection from './analytics/ExpenseBreakdownSection';
import PaymentMethodSection from './analytics/PaymentMethodSection';
import ShiftPerformanceSection from './analytics/ShiftPerformanceSection';
import EmployeePerformanceSection from './analytics/EmployeePerformanceSection';
import MarketingPerformanceSection from './analytics/MarketingPerformanceSection';
import UnderperformingRoomsSection from './analytics/UnderperformingRoomsSection';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const today = () => format(new Date(), 'yyyy-MM-dd');
const firstOfMonth = () => format(startOfMonth(new Date()), 'yyyy-MM-dd');

// ---------------------------------------------------------------------------
// GlobalFilterBar — internal component
// ---------------------------------------------------------------------------

/**
 * GlobalFilterBar
 *
 * Props:
 *   startDate, endDate, location, locationOptions,
 *   onStartDateChange, onEndDateChange, onLocationChange,
 *   onApply, error
 */
function GlobalFilterBar({
  startDate,
  endDate,
  location,
  locationOptions,
  onStartDateChange,
  onEndDateChange,
  onLocationChange,
  onApply,
  error,
}) {
  // ---- Preset handlers ----

  const handlePresetToday = () => {
    const t = today();
    onStartDateChange(t);
    onEndDateChange(t);
  };

  const handlePreset7Days = () => {
    onStartDateChange(format(subDays(new Date(), 6), 'yyyy-MM-dd'));
    onEndDateChange(today());
  };

  const handlePresetThisMonth = () => {
    onStartDateChange(firstOfMonth());
    onEndDateChange(today());
  };

  const handlePresetLastMonth = () => {
    const lastMonth = subMonths(new Date(), 1);
    onStartDateChange(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
    onEndDateChange(format(endOfMonth(lastMonth), 'yyyy-MM-dd'));
  };

  const presets = [
    { label: 'Hari Ini', handler: handlePresetToday },
    { label: '7 Hari Terakhir', handler: handlePreset7Days },
    { label: 'Bulan Ini', handler: handlePresetThisMonth },
    { label: 'Bulan Lalu', handler: handlePresetLastMonth },
  ];

  return (
    <div className="glassmorphic-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Filter className="w-5 h-5 text-blue-500" />
        <h2 className="font-bold text-gray-800">Filter Laporan</h2>
      </div>

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset.label}
            onClick={preset.handler}
            className="px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Date inputs */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="analytics-filter-start-date"
            className="block text-xs font-semibold text-gray-600 mb-1"
          >
            <Calendar className="w-3 h-3 inline mr-1" />
            Tanggal Mulai
          </label>
          <input
            id="analytics-filter-start-date"
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 bg-white/70 text-gray-900 text-sm focus:outline-none focus:border-blue-400"
          />
        </div>
        <div>
          <label
            htmlFor="analytics-filter-end-date"
            className="block text-xs font-semibold text-gray-600 mb-1"
          >
            <Calendar className="w-3 h-3 inline mr-1" />
            Tanggal Selesai
          </label>
          <input
            id="analytics-filter-end-date"
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 bg-white/70 text-gray-900 text-sm focus:outline-none focus:border-blue-400"
          />
        </div>
      </div>

      {/* Location dropdown */}
      <div>
        <label
          htmlFor="analytics-filter-location"
          className="block text-xs font-semibold text-gray-600 mb-1"
        >
          <MapPin className="w-3 h-3 inline mr-1" />
          Lokasi
        </label>
        <select
          id="analytics-filter-location"
          value={location ?? ''}
          onChange={(e) => onLocationChange(e.target.value || null)}
          className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 bg-white/70 text-gray-900 text-sm focus:outline-none focus:border-blue-400"
        >
          <option value="">Semua Lokasi</option>
          {locationOptions.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
        </select>
      </div>

      {/* Validation error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Apply button */}
      <button
        onClick={onApply}
        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold text-sm shadow hover:opacity-90 transition-opacity"
      >
        Terapkan Filter
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AnalyticsDashboard — main component
// ---------------------------------------------------------------------------

const AnalyticsDashboard = () => {
  // ---- Filter state ----
  const [startDate, setStartDate] = useState(firstOfMonth());
  const [endDate, setEndDate] = useState(today());
  const [location, setLocation] = useState(null);

  // appliedFilter initial value matches defaults so data loads immediately on mount
  const [appliedFilter, setAppliedFilter] = useState({
    startDate: firstOfMonth(),
    endDate: today(),
    location: null,
  });

  // Bumped on global refresh; passed as `key` to remount semua section
  // sehingga refetch dijalankan ulang.
  const [refreshKey, setRefreshKey] = useState(0);
  const handleGlobalRefresh = () => {
    setRefreshKey((k) => k + 1);
  };

  const [locationOptions, setLocationOptions] = useState([]);
  const [filterError, setFilterError] = useState(null);

  // ---- Fetch location options on mount ----
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const data = await locationsApi.list();
        setLocationOptions((data || []).map((row) => row.name));
      } catch (error) {
        console.error('Error fetching locations:', error);
      }
    };
    fetchLocations();
  }, []);

  // ---- Apply filter handler with validation ----
  const handleApply = () => {
    // Validate: startDate must not be greater than endDate
    if (startDate > endDate) {
      setFilterError('Tanggal mulai tidak boleh lebih besar dari tanggal selesai');
      return;
    }

    // Validate: range must not exceed 366 days
    const diffDays = differenceInDays(parseISO(endDate), parseISO(startDate));
    if (diffDays > 366) {
      setFilterError('Rentang tanggal maksimal 366 hari');
      return;
    }

    setFilterError(null);
    setAppliedFilter({ startDate, endDate, location });
  };

  // ---- Render ----
  return (
    <div className="min-h-screen p-4 pt-6 pb-28">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto space-y-5"
      >
        {/* Page header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-6 py-3 rounded-full shadow-lg">
            <BarChart2 className="w-6 h-6" />
            <h1 className="text-xl font-bold">Analytics Dashboard</h1>
          </div>
        </div>

        {/* Global filter bar */}
        <GlobalFilterBar
          startDate={startDate}
          endDate={endDate}
          location={location}
          locationOptions={locationOptions}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onLocationChange={setLocation}
          onApply={handleApply}
          error={filterError}
        />

        {/* ----------------------------------------------------------------
            Section: Finance
        ---------------------------------------------------------------- */}
        {/* ----------------------------------------------------------------
            KPI Cards Header (Tier 4) — ringkasan + delta vs periode sebelumnya
        ---------------------------------------------------------------- */}
        <KpiCardsHeader
          key={`kpi-${refreshKey}`}
          filter={appliedFilter}
          onGlobalRefresh={handleGlobalRefresh}
        />

        {/* ----------------------------------------------------------------
            Section: Finance
        ---------------------------------------------------------------- */}
        <SectionGroupHeader title="Keuangan" />
        <NetProfitSection key={`np-${refreshKey}`} filter={appliedFilter} />
        <YoYComparisonSection key={`yoy-${refreshKey}`} filter={appliedFilter} />
        <ProfitSection key={`p-${refreshKey}`} filter={appliedFilter} />
        <ExpenseBreakdownSection key={`eb-${refreshKey}`} filter={appliedFilter} />
        <PaymentMethodSection key={`pm-${refreshKey}`} filter={appliedFilter} />
        <DailyRevenueTrendSection key={`drt-${refreshKey}`} filter={appliedFilter} />
        <MonthlyRevenueTrendSection key={`mrt-${refreshKey}`} filter={appliedFilter} />
        <OutstandingBillsSection key={`ob-${refreshKey}`} filter={appliedFilter} />

        {/* ----------------------------------------------------------------
            Section: Okupansi
        ---------------------------------------------------------------- */}
        <SectionGroupHeader title="Okupansi & Kamar" />
        <OccupancyByLocationSection key={`obl-${refreshKey}`} filter={appliedFilter} />
        <LocationFullnessSection key={`lf-${refreshKey}`} filter={appliedFilter} />
        <UnderperformingRoomsSection key={`ur-${refreshKey}`} filter={appliedFilter} />

        {/* ----------------------------------------------------------------
            Section: Operasional
        ---------------------------------------------------------------- */}
        <SectionGroupHeader title="Operasional" />
        <ShiftPerformanceSection key={`sp-${refreshKey}`} filter={appliedFilter} />
        <EmployeePerformanceSection key={`ep-${refreshKey}`} filter={appliedFilter} />
        <CheckinHeatmapSection key={`ch-${refreshKey}`} filter={appliedFilter} />

        {/* ----------------------------------------------------------------
            Section: Marketing & Tamu
        ---------------------------------------------------------------- */}
        <SectionGroupHeader title="Marketing & Tamu" />
        <MarketingPerformanceSection key={`mp-${refreshKey}`} filter={appliedFilter} />
        <GuestSourceSection key={`gs-${refreshKey}`} filter={appliedFilter} />
        <RepeatGuestSection key={`rg-${refreshKey}`} filter={appliedFilter} />
        <StayDurationSection key={`sd-${refreshKey}`} filter={appliedFilter} />

      </motion.div>
    </div>
  );
};

/**
 * SectionGroupHeader — pemisah visual antar grup section.
 */
function SectionGroupHeader({ title }) {
  return (
    <div className="pt-4 pb-1 px-1">
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
        {title}
      </h3>
      <div className="h-px bg-gradient-to-r from-blue-200 via-gray-200 to-transparent mt-1" />
    </div>
  );
}

export default AnalyticsDashboard;
