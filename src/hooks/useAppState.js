import { useState, useCallback } from 'react';

/**
 * useAppState — Centralised modal and UI state management.
 *
 * Consolidates all boolean toggles, active tab tracking,
 * and refresh key originally inline in App.jsx.
 *
 * @param {object} [options]
 * @param {string} [options.initialTab='form']
 * @returns {object} All app state values and setters
 */
export function useAppState(options = {}) {
  const { initialTab = 'form' } = options;

  // --- Tab routing ---
  const [activeTab, setActiveTab] = useState(initialTab);

  // --- Refresh key for forcing re-renders ---
  const [refreshKey, setRefreshKey] = useState(0);

  const handleDataUpdate = useCallback(
    () => setRefreshKey((prev) => prev + 1),
    []
  );

  // --- Modal visibility toggles ---
  const [showPinModal, setShowPinModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [showAllNotifications, setShowAllNotifications] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [showKalender, setShowKalender] = useState(false);
  const [showMoreMenus, setShowMoreMenus] = useState(false);

  // --- PIN unlock state ---
  const [isTagihanUnlocked, setIsTagihanUnlocked] = useState(false);

  return {
    // Tab
    activeTab,
    setActiveTab,

    // Refresh
    refreshKey,
    setRefreshKey,
    handleDataUpdate,

    // PIN
    showPinModal,
    setShowPinModal,
    isTagihanUnlocked,
    setIsTagihanUnlocked,

    // Logout
    showLogoutConfirm,
    setShowLogoutConfirm,

    // Inbox / Notifications
    showInbox,
    setShowInbox,
    showAllNotifications,
    setShowAllNotifications,

    // Account settings
    showAccountSettings,
    setShowAccountSettings,

    // Compose announcement
    showCompose,
    setShowCompose,

    // Kalender libur
    showKalender,
    setShowKalender,

    // More menus (bottom nav overflow)
    showMoreMenus,
    setShowMoreMenus,
  };
}
