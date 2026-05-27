import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PinModal } from '@/components/shared/PinModal';
import NotificationsInbox from '@/components/NotificationsInbox';
import AllNotifications from '@/components/AllNotifications';
import AccountSettings from '@/components/AccountSettings';
import ComposeAnnouncement from '@/components/ComposeAnnouncement';
import KalenderLibur from '@/components/KalenderLibur';

/**
 * AppModals — Renders all side modals and dialogs used across the app.
 *
 * Aggregates: PIN modal, logout confirm, inbox, all notifications,
 * account settings, compose announcement, and kalender libur.
 *
 * @param {object} props
 * @param {object} props.appState          – App state from useAppState
 * @param {string} props.userRole          – Current user role
 * @param {function} props.signOut         – Sign-out handler
 * @param {function} props.onPinValidated  – Callback(enteredPin) after PIN entered
 * @param {function} props.onOpenAllNotif  – Opens all-notifications modal
 */
export function AppModals({
  appState,
  userRole,
  signOut,
  onPinValidated,
  onOpenAllNotif,
}) {
  const {
    showPinModal,
    setShowPinModal,
    showLogoutConfirm,
    setShowLogoutConfirm,
    showInbox,
    setShowInbox,
    showAllNotifications,
    setShowAllNotifications,
    showAccountSettings,
    setShowAccountSettings,
    showCompose,
    setShowCompose,
    showKalender,
    setShowKalender,
  } = appState;

  return (
    <>
      {/* Notifications Inbox */}
      <NotificationsInbox
        open={showInbox}
        onOpenChange={setShowInbox}
        onOpenAll={() => {
          setShowInbox(false);
          onOpenAllNotif?.();
        }}
      />

      {/* All Notifications */}
      <AllNotifications
        open={showAllNotifications}
        onOpenChange={setShowAllNotifications}
      />

      {/* Account Settings */}
      <AccountSettings
        open={showAccountSettings}
        onOpenChange={setShowAccountSettings}
      />

      {/* Compose Announcement */}
      <ComposeAnnouncement
        open={showCompose}
        onOpenChange={setShowCompose}
      />

      {/* Kalender Libur */}
      <KalenderLibur
        open={showKalender}
        onOpenChange={setShowKalender}
        showTagihan={userRole === 'admin' || userRole === 'super_admin'}
      />

      {/* Logout Confirmation */}
      <AlertDialog
        open={showLogoutConfirm}
        onOpenChange={setShowLogoutConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Keluar dari akun?</AlertDialogTitle>
            <AlertDialogDescription>
              Anda perlu login lagi untuk mengakses aplikasi. Lanjutkan keluar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              onClick={() => signOut()}
            >
              Keluar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PIN Modal */}
      <PinModal
        open={showPinModal}
        onOpenChange={setShowPinModal}
        title="Masukkan PIN"
        description="Halaman ini dilindungi. Masukkan PIN 6 digit untuk melanjutkan."
        onPinComplete={(enteredPin) => {
          setShowPinModal(false);
          onPinValidated?.(enteredPin);
        }}
      />
    </>
  );
}
