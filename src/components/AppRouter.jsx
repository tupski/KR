import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FormTransaksiPage } from '@/components/transaksi/FormTransaksiPage';
import { DashboardPemasukanPage } from '@/components/pemasukan/DashboardPemasukanPage';
import { KetersediaanKamarPage } from '@/components/ketersediaan/KetersediaanKamarPage';
import { TagihanPage } from '@/components/tagihan/TagihanPage';
import KaryawanTransaksi from '@/components/KaryawanTransaksi';
import HalamanRequest from '@/components/HalamanRequest';
import RankingMarketing from '@/components/RankingMarketing';
import OmsetChart from '@/components/OmsetChart';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';
import SuperAdminDashboard from '@/components/SuperAdminDashboard';

/**
 * AppRouter — Renders the active tab's page content.
 *
 * Uses AnimatePresence for smooth tab transitions.
 *
 * @param {object} props
 * @param {string} props.activeTab          – Current active tab ID
 * @param {number} props.refreshKey         – Forced re-render key
 * @param {string} props.userRole           – Current user role
 * @param {boolean} props.isSuperAdmin      – Whether user is super admin
 * @param {function} props.handleDataUpdate – Called after data mutation
 * @param {function} props.onNavigateTab    – Navigate to a specific tab
 */
export function AppRouter({
  activeTab,
  refreshKey,
  userRole,
  isSuperAdmin,
  handleDataUpdate,
  onNavigateTab,
}) {
  const key = `${activeTab}-${refreshKey}`;

  const renderContent = () => {
    switch (activeTab) {
      case 'form':
        return userRole === 'karyawan' ? (
          <KaryawanTransaksi
            key={key}
            onRequestNavigate={() => onNavigateTab?.('request')}
          />
        ) : (
          <FormTransaksiPage key={key} onDataUpdate={handleDataUpdate} />
        );

      case 'dashboard':
        return <DashboardPemasukanPage key={key} />;

      case 'request':
        return <HalamanRequest key={key} />;

      case 'kamar':
        return <KetersediaanKamarPage key={key} />;

      case 'finance':
        return <TagihanPage key={key} />;

      case 'ranking':
        return <RankingMarketing key={key} />;

      case 'chart':
        return <OmsetChart key={key} />;

      case 'analytics':
        return userRole === 'admin' || userRole === 'super_admin' ? (
          <AnalyticsDashboard key={key} />
        ) : null;

      case 'pengaturan':
        return isSuperAdmin ? (
          <SuperAdminDashboard key={key} />
        ) : (
          <FormTransaksiPage key={key} onDataUpdate={handleDataUpdate} />
        );

      default:
        return <FormTransaksiPage key={key} onDataUpdate={handleDataUpdate} />;
    }
  };

  return (
    <div className="min-h-screen pb-28 sm:pb-32">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
