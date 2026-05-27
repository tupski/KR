import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useDepositFilters } from '@/hooks/useDepositFilters';
import { useDepositData } from '@/hooks/useDepositData';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { DepositFilterBar } from './DepositFilterBar';
import { DepositSummaryCard } from './DepositSummaryCard';
import { DepositList } from './DepositList';
import { DepositReturnModal } from './DepositReturnModal';

/**
 * DepositPage — Parent orchestrator for the deposit management feature.
 *
 * Wires useDepositFilters, useDepositData, and useAuth together,
 * rendering the filter bar, summary card, deposit list, and return modal.
 */
export function DepositPage() {
  const { session } = useAuth();

  // Filter state (client-side filter values + Supabase filter builder)
  const {
    filters,
    activeTab,
    setFilter,
    handleQuickDateFilter,
    clearFilters,
    getSupabaseFilters,
    setActiveTab,
  } = useDepositFilters();

  // Build Supabase-compatible filter object for server-side queries
  const supabaseFilters = getSupabaseFilters();

  // Server-side paginated data
  const {
    deposits,
    totalItems,
    totalPages,
    currentPage,
    isLoading,
    error,
    setPage,
    refresh,
  } = useDepositData(supabaseFilters);

  // Selected transaction for return modal
  const [selectedTx, setSelectedTx] = useState(null);

  // Handle return button click from DepositList
  const handleReturnClick = useCallback((tx) => {
    setSelectedTx(tx);
  }, []);

  // Handle modal close
  const handleModalClose = useCallback(() => {
    setSelectedTx(null);
  }, []);

  // Handle successful return (refresh data)
  const handleReturnSuccess = useCallback(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="min-h-screen p-4 pt-6 pb-28">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-md space-y-5"
      >
        {/* Header */}
        <div className="mb-2 text-center">
          <h1 className="text-xl font-bold text-slate-800">Manajemen Deposit</h1>
        </div>

        {/* Filter Bar (includes tabs) */}
        <DepositFilterBar
          filters={filters}
          activeTab={activeTab}
          setFilter={setFilter}
          handleQuickDateFilter={handleQuickDateFilter}
          clearFilters={clearFilters}
          setActiveTab={setActiveTab}
        />

        {/* Error state */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 text-center">
            {error}
          </div>
        )}

        {/* Summary Card */}
        {!error && (
          <DepositSummaryCard
            deposits={deposits}
            activeTab={activeTab}
            dateFrom={filters.dateFrom}
            dateTo={filters.dateTo}
          />
        )}

        {/* Deposit List */}
        <DepositList
          deposits={deposits}
          isLoading={isLoading}
          activeTab={activeTab}
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          onPageChange={setPage}
          onReturnClick={handleReturnClick}
        />
      </motion.div>

      {/* Return Deposit Modal */}
      <DepositReturnModal
        selectedTx={selectedTx}
        onClose={handleModalClose}
        onSuccess={handleReturnSuccess}
        session={session}
      />
    </div>
  );
}
