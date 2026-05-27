import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Camera,
  TrendingUp,
  Send,
  DoorOpen,
  FileText,
  Trophy,
  PieChart,
  BarChart2,
  Settings,
} from 'lucide-react';
import { PIN_PROTECTED_TABS } from '@/config/authConfig';

/**
 * useTabRouting — Tab switching with localStorage persistence,
 * PIN gate for protected tabs, and role-based filtering.
 *
 * @param {string} userRole        - Current user role
 * @param {object} appState        - App state with modal setters
 * @param {string} [sessionUserId] - Current session user ID for localStorage key
 * @returns {{
 *   activeTab: string,
 *   setActiveTab: (tab: string) => void,
 *   filteredTabs: Array,
 *   primaryTabs: Array,
 *   secondaryTabs: Array,
 *   isTabAccessible: (tabId: string) => boolean,
 *   handleTabChange: (tabId: string) => void,
 * }}
 */
export function useTabRouting(userRole, appState, sessionUserId) {
  const { activeTab, setActiveTab, setShowPinModal } = appState;

  // --- Tab definitions ---
  const allTabs = useMemo(
    () => [
      { id: 'form', label: 'Input', icon: Camera },
      { id: 'dashboard', label: 'Laporan', icon: TrendingUp },
      { id: 'request', label: 'Permintaan', icon: Send },
      { id: 'kamar', label: 'Kamar', icon: DoorOpen },
      { id: 'finance', label: 'Keuangan', icon: FileText },
      { id: 'ranking', label: 'Ranking', icon: Trophy },
      { id: 'chart', label: 'Grafik', icon: PieChart },
      { id: 'analytics', label: 'Analitik', icon: BarChart2 },
      { id: 'pengaturan', label: 'Pengaturan', icon: Settings },
    ],
    []
  );

  const allowedTabsByRole = useMemo(
    () => ({
      karyawan: ['form', 'kamar', 'request'],
      admin: allTabs
        .filter((tab) => tab.id !== 'pengaturan')
        .map((tab) => tab.id),
      super_admin: allTabs.map((tab) => tab.id),
    }),
    [allTabs]
  );

  const visibleTabIds = useMemo(
    () => allowedTabsByRole[userRole] || allTabs.map((tab) => tab.id),
    [userRole, allowedTabsByRole, allTabs]
  );

  const filteredTabs = useMemo(
    () => allTabs.filter((tab) => visibleTabIds.includes(tab.id)),
    [allTabs, visibleTabIds]
  );

  const activeTabStorageKey = useMemo(() => {
    const userId = sessionUserId;
    return userId ? `kr_active_tab_${userId}` : 'kr_active_tab_guest';
  }, [sessionUserId]);

  // Restore persisted tab
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedTab = localStorage.getItem(activeTabStorageKey);
    if (storedTab && visibleTabIds.includes(storedTab)) {
      setActiveTab(storedTab);
      return;
    }
    setActiveTab('form');
  }, [activeTabStorageKey, visibleTabIds, setActiveTab]);

  // Persist active tab
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(activeTabStorageKey, activeTab);
    }
  }, [activeTab, activeTabStorageKey]);

  // Reset to 'form' if current tab becomes inaccessible
  useEffect(() => {
    if (!visibleTabIds.includes(activeTab)) {
      setActiveTab('form');
    }
  }, [activeTab, visibleTabIds, setActiveTab]);

  const isTabAccessible = useCallback(
    (tabId) => visibleTabIds.includes(tabId),
    [visibleTabIds]
  );

  const handleTabChange = useCallback(
    (tabId) => {
      appState.setShowMoreMenus?.(false);
      // Open PIN modal if tab is protected and user is admin (unlocked state checked in parent)
      if (PIN_PROTECTED_TABS.includes(tabId) && userRole === 'admin' && !appState.isTagihanUnlocked) {
        setShowPinModal(true);
        return;
      }
      setActiveTab(tabId);
    },
    [userRole, setShowPinModal, setActiveTab, appState]
  );

  // Primary/secondary tab split for bottom nav
  const primaryTabs = useMemo(() => {
    if (userRole === 'karyawan') {
      return ['kamar', 'request']
        .map((id) => filteredTabs.find((tab) => tab.id === id))
        .filter(Boolean);
    }
    const preferred = ['dashboard', 'kamar', 'finance'];
    return preferred
      .map((id) => filteredTabs.find((tab) => tab.id === id))
      .filter(Boolean);
  }, [userRole, filteredTabs]);

  const secondaryTabs = useMemo(() => {
    if (userRole === 'karyawan') return [];
    const hiddenFromPrimary = new Set([
      ...primaryTabs.map((tab) => tab.id),
      'form',
    ]);
    return filteredTabs.filter((tab) => !hiddenFromPrimary.has(tab.id));
  }, [userRole, filteredTabs, primaryTabs]);

  return {
    activeTab,
    setActiveTab,
    filteredTabs,
    primaryTabs,
    secondaryTabs,
    isTabAccessible,
    handleTabChange,
  };
}
