import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useAppState } from '@/hooks/useAppState';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { useTabRouting } from '@/hooks/useTabRouting';
import { isValidFinancePin } from '@/config/authConfig';
import { toast } from '@/components/ui/use-toast';
import Auth from '@/components/Auth';
import { AppRouter } from '@/components/AppRouter';
import { AppHeader } from '@/components/AppHeader';
import { AppBottomNav } from '@/components/AppBottomNav';
import { AppModals } from '@/components/AppModals';
import { MaintenanceBanner } from '@/components/MaintenanceBanner';
import { LoadingScreen } from '@/components/shared/LoadingScreen';
import AnnouncementBanner from '@/components/AnnouncementBanner';

/**
 * App — Root orchestrator.
 *
 * Delegates to specialised hooks and components:
 *  - useAppState        → modal visibility, refresh key
 *  - useSystemSettings  → maintenance mode, app name
 *  - useTabRouting      → tab navigation, PIN gating, role filtering
 *
 * State management is lifted out; each child receives only the props it needs.
 */
function App() {
  const { session, loading, signOut, userRole, isSuperAdmin } = useAuth();
  const appState = useAppState();
  const { isMaintenance, appName } = useSystemSettings();
  const { activeTab, primaryTabs, secondaryTabs, handleTabChange } =
    useTabRouting(userRole, appState, session?.user?.id);

  /** PIN entry callback — validates and unlocks finance tab */
  const handlePinValidated = (enteredPin) => {
    if (isValidFinancePin(enteredPin)) {
      toast({
        title: 'Akses Diberikan!',
        description: 'Selamat datang di Menu Keuangan.',
        className: 'bg-green-500 text-white',
      });
      appState.setIsTagihanUnlocked(true);
      appState.setActiveTab('finance');
    } else {
      toast({
        title: 'PIN Salah!',
        description: 'Silakan coba lagi.',
        variant: 'destructive',
      });
    }
  };

  // --- Early return guards ---
  if (loading) return <LoadingScreen />;
  if (!session) return <Auth />;
  if (isMaintenance && !isSuperAdmin) {
    return <MaintenanceBanner signOut={signOut} />;
  }

  return (
    <>
      <AppHeader
        session={session}
        userRole={userRole}
        appName={appName}
        onOpenInbox={() => appState.setShowInbox(true)}
        onOpenAllNotif={() => appState.setShowAllNotifications(true)}
        onOpenCompose={() => appState.setShowCompose(true)}
        onOpenKalender={() => appState.setShowKalender(true)}
        onOpenSettings={() => appState.setShowAccountSettings(true)}
        onOpenLogout={() => appState.setShowLogoutConfirm(true)}
      />

      <div className="sticky top-[57px] z-40">
        <AnnouncementBanner />
      </div>

      <AppRouter
        activeTab={activeTab}
        refreshKey={appState.refreshKey}
        userRole={userRole}
        isSuperAdmin={isSuperAdmin}
        handleDataUpdate={appState.handleDataUpdate}
        onNavigateTab={appState.setActiveTab}
      />

      <AppBottomNav
        activeTab={activeTab}
        userRole={userRole}
        primaryTabs={primaryTabs}
        secondaryTabs={secondaryTabs}
        showMoreMenus={appState.showMoreMenus}
        onTabChange={handleTabChange}
        onToggleMore={() =>
          appState.setShowMoreMenus((prev) => !prev)
        }
      />

      <AppModals
        appState={appState}
        userRole={userRole}
        signOut={signOut}
        onPinValidated={handlePinValidated}
        onOpenAllNotif={() => appState.setShowAllNotifications(true)}
      />
    </>
  );
}

export default App;
