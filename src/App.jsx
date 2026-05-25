import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Camera, CalendarDays, Megaphone, TrendingUp, Trophy, PieChart, DoorOpen, FileText, Send, MoreHorizontal, Settings, LogOut, BarChart2 } from 'lucide-react';
import FormTransaksi from '@/components/FormTransaksiModern';
import KaryawanTransaksi from '@/components/KaryawanTransaksi';
import DashboardPemasukan from '@/components/DashboardPemasukan';
import RankingMarketing from '@/components/RankingMarketing';
import OmsetChart from '@/components/OmsetChart';
import KetersediaanKamar from '@/components/KetersediaanKamar';
import HalamanTagihan from '@/components/HalamanTagihan';
import HalamanRequest from '@/components/HalamanRequest';
import SuperAdminDashboard from '@/components/SuperAdminDashboard';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import Auth from '@/components/Auth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import PinInput from '@/components/PinInput';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import NotificationsInbox from '@/components/NotificationsInbox';
import AllNotifications from '@/components/AllNotifications';
import AnnouncementBanner from '@/components/AnnouncementBanner';
import ComposeAnnouncement from '@/components/ComposeAnnouncement';
import { supabase } from '@/lib/customSupabaseClient';
import AccountSettings from '@/components/AccountSettings';
import KalenderLibur from '@/components/KalenderLibur';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
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

function App() {
  const currentYear = new Date().getFullYear();
  const [activeTab, setActiveTab] = useState('form');
  const [refreshKey, setRefreshKey] = useState(0);
  const { session, loading, signOut, userRole, isSuperAdmin } = useAuth();
  const [showPinModal, setShowPinModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [showAllNotifications, setShowAllNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [isTagihanUnlocked, setIsTagihanUnlocked] = useState(false);
  const [showMoreMenus, setShowMoreMenus] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [showKalender, setShowKalender] = useState(false);
  const correctPin = '212198';

  const [isMaintenance, setIsMaintenance] = useState(false);
  const [appName, setAppName] = useState('Kakarama Room');

  // Live clock — ticks every second
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const liveDateTime = useMemo(() => {
    const opts = { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    const dateStr = now.toLocaleDateString('id-ID', opts);
    const timeStr = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
    return `${dateStr} — ${timeStr} WIB`;
  }, [now]);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from('system_settings').select('*');
      if (data) {
        const m = data.find(s => s.key === 'maintenance_mode');
        const n = data.find(s => s.key === 'app_name');
        if (m) setIsMaintenance(m.value === true);
        if (n) {
          setAppName(n.value);
          document.title = n.value;
        }
      }
    };
    fetchSettings();

    // Realtime settings
    const channel = supabase
      .channel('system_settings_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings' }, fetchSettings)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const audienceFilter = useMemo(() => {
    const userId = session?.user?.id;
    if (!userId) return null;
    if (userRole === 'super_admin') return `audience_user_id.eq.${userId},audience_role.eq.super_admin,audience_role.eq.admin,audience_role.eq.all`;
    if (userRole === 'admin') return `audience_user_id.eq.${userId},audience_role.eq.admin,audience_role.eq.all`;
    return `audience_user_id.eq.${userId},audience_role.eq.all`;
  }, [session?.user?.id, userRole]);

  const refreshUnread = async () => {
    const userId = session?.user?.id;
    if (!userId || !audienceFilter) return;
    try {
      // Ambil semua notifikasi yang relevan (tanpa limit untuk akurasi badge)
      const { data: notif, error: nErr } = await supabase
        .from('notifications')
        .select('id')
        .or(audienceFilter)
        .order('created_at', { ascending: false });
      if (nErr) throw nErr;

      const ids = (notif || []).map((n) => n.id);
      if (!ids.length) {
        setUnreadCount(0);
        return;
      }

      const [{ data: reads, error: rErr }, { data: hidden, error: hErr }] = await Promise.all([
        supabase
          .from('notification_reads')
          .select('notification_id')
          .eq('user_id', userId)
          .in('notification_id', ids),
        supabase
          .from('notification_hidden')
          .select('notification_id')
          .eq('user_id', userId)
          .in('notification_id', ids),
      ]);
      if (rErr) throw rErr;
      if (hErr) throw hErr;

      const readSet = new Set((reads || []).map((r) => r.notification_id));
      const hiddenSet = new Set((hidden || []).map((h) => h.notification_id));
      const visibleIds = ids.filter((id) => !hiddenSet.has(id));
      setUnreadCount(visibleIds.filter((id) => !readSet.has(id)).length);
    } catch (_error) {
      setUnreadCount(0);
    }
  };

  useEffect(() => {
    if (!session?.user?.id) return;
    refreshUnread();
    const channel = supabase
      .channel(`notif_badge_${session.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, refreshUnread)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_reads' }, refreshUnread)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_hidden' }, refreshUnread)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [session?.user?.id, audienceFilter]);

  const handleDataUpdate = () => setRefreshKey((prevKey) => prevKey + 1);

  const handleTabClick = (tabId) => {
    setShowMoreMenus(false);
    if (tabId === 'finance' && userRole === 'admin' && !isTagihanUnlocked) {
      setShowPinModal(true);
      return;
    }
    setActiveTab(tabId);
  };

  const handlePinComplete = (enteredPin) => {
    if (enteredPin === correctPin) {
      toast({ title: 'Akses Diberikan!', description: 'Selamat datang di Menu Keuangan.', className: 'bg-green-500 text-white' });
      setIsTagihanUnlocked(true);
      setActiveTab('finance');
      setShowPinModal(false);
    } else {
      toast({ title: 'PIN Salah!', description: 'Silakan coba lagi.', variant: 'destructive' });
      setShowPinModal(false);
    }
  };

  const allTabs = [
    { id: 'form', label: 'Input', icon: Camera },
    { id: 'dashboard', label: 'Laporan', icon: TrendingUp },
    { id: 'request', label: 'Permintaan', icon: Send },
    { id: 'kamar', label: 'Kamar', icon: DoorOpen },
    { id: 'finance', label: 'Keuangan', icon: FileText },
    { id: 'ranking', label: 'Ranking', icon: Trophy },
    { id: 'chart', label: 'Grafik', icon: PieChart },
    { id: 'analytics', label: 'Analitik', icon: BarChart2 },
    { id: 'pengaturan', label: 'Pengaturan', icon: Settings },
  ];

  const allowedTabsByRole = {
    karyawan: ['form', 'kamar', 'request'],
    admin: allTabs.filter((tab) => tab.id !== 'pengaturan').map((tab) => tab.id),
    super_admin: allTabs.map((tab) => tab.id),
  };

  const visibleTabIds = allowedTabsByRole[userRole] || allTabs.map((tab) => tab.id);
  const visibleTabs = allTabs.filter((tab) => visibleTabIds.includes(tab.id));
  const activeTabStorageKey = useMemo(() => {
    const userId = session?.user?.id;
    return userId ? `kr_active_tab_${userId}` : 'kr_active_tab_guest';
  }, [session?.user?.id]);

  const primaryTabs = useMemo(() => {
    if (userRole === 'karyawan') {
      return ['kamar', 'request']
        .map((id) => visibleTabs.find((tab) => tab.id === id))
        .filter(Boolean);
    }
    const preferred = ['dashboard', 'kamar', 'finance'];
    return preferred
      .map((id) => visibleTabs.find((tab) => tab.id === id))
      .filter(Boolean);
  }, [userRole, visibleTabs]);

  const secondaryTabs = useMemo(() => {
    if (userRole === 'karyawan') return [];
    const hiddenFromPrimary = new Set([...primaryTabs.map((tab) => tab.id), 'form']);
    return visibleTabs.filter((tab) => !hiddenFromPrimary.has(tab.id));
  }, [userRole, visibleTabs, primaryTabs]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedTab = localStorage.getItem(activeTabStorageKey);
    if (storedTab) {
      setActiveTab(storedTab);
      return;
    }
    setActiveTab('form');
  }, [activeTabStorageKey]);

  useEffect(() => {
    if (!visibleTabIds.includes(activeTab)) {
      setActiveTab('form');
    }
  }, [activeTab, visibleTabIds]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(activeTabStorageKey, activeTab);
    }
  }, [activeTab, activeTabStorageKey]);

  const renderContent = () => {
    const key = `${activeTab}-${refreshKey}`;
    switch (activeTab) {
      case 'form':
        return userRole === 'karyawan'
          ? <KaryawanTransaksi key={key} onRequestNavigate={() => setActiveTab('request')} />
          : <FormTransaksi key={key} onDataUpdate={handleDataUpdate} />;
      case 'dashboard':
        return <DashboardPemasukan key={key} />;
      case 'request':
        return <HalamanRequest key={key} />;
      case 'kamar':
        return <KetersediaanKamar key={key} />;
      case 'finance':
        return userRole === 'super_admin' || isTagihanUnlocked ? <HalamanTagihan key={key} /> : null;
      case 'ranking':
        return <RankingMarketing key={key} />;
      case 'chart':
        return <OmsetChart key={key} />;
      case 'analytics':
        return (userRole === 'admin' || userRole === 'super_admin')
          ? <AnalyticsDashboard key={key} />
          : null;
      case 'pengaturan':
        return isSuperAdmin ? <SuperAdminDashboard key={key} /> : <FormTransaksi key={key} onDataUpdate={handleDataUpdate} />;
      default:
        return <FormTransaksi key={key} onDataUpdate={handleDataUpdate} />;
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-cyan-200 to-blue-300">
        <div className="flex flex-col items-center gap-4 text-blue-900">
          <motion.div
            initial={{ scale: 0.9, opacity: 0.75 }}
            animate={{ scale: [0.9, 1.05, 0.9], opacity: [0.75, 1, 0.75] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white shadow-lg ring-1 ring-blue-200"
          >
            <img src="/logo-kr-transparent-square.png" alt="KR" className="h-14 w-14 object-contain" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0.5 }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
            className="text-base font-semibold sm:text-lg"
          >
            Memuat...
          </motion.div>
        </div>
      </div>
    );
  }

  if (!session) return <Auth />;

  if (isMaintenance && !isSuperAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="bg-amber-500/20 text-amber-500 p-4 rounded-3xl inline-block mb-2">
            <Settings className="h-12 w-12 animate-spin-slow" />
          </div>
          <h1 className="text-2xl font-bold text-white">Sedang Pemeliharaan</h1>
          <p className="text-slate-400 text-sm">Aplikasi sedang dalam proses update rutin untuk meningkatkan performa. Silakan coba lagi beberapa saat lagi.</p>
          <Button variant="outline" className="text-white border-slate-700 hover:bg-slate-800" onClick={() => signOut()}>
            <LogOut className="mr-2 h-4 w-4" /> Keluar
          </Button>
        </div>
      </div>
    );
  }

  const displayRole = userRole === 'super_admin' ? 'Super Admin' : userRole === 'admin' ? 'Admin' : 'Karyawan';

  return (
    <>
      <header className="sticky top-0 z-50 bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-4 text-white shadow-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          {/* Logo + App Name (always visible) */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 p-1 shadow-sm ring-1 ring-white/40">
              <img src="/logo-kr-transparent-square.png" alt="KR" className="h-full w-full object-contain" />
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold tracking-wide text-white sm:text-base">{appName}</span>
              {/* Mobile: tanggal & jam di bawah nama app */}
              <span className="text-[10px] font-medium text-white/80 sm:hidden">{liveDateTime}</span>
            </div>
          </div>

          {/* Desktop: tanggal & jam di tengah */}
          <div className="hidden sm:flex absolute left-1/2 -translate-x-1/2 items-center">
            <span className="text-sm font-semibold text-white/90 whitespace-nowrap tracking-wide">{liveDateTime}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Megaphone: hanya admin/superadmin */}
            {(userRole === 'admin' || userRole === 'super_admin') && (
              <button
                type="button"
                onClick={() => setShowCompose(true)}
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-amber-400/20 ring-offset-2 transition hover:bg-amber-400/30 focus:outline-none focus:ring-2 focus:ring-amber-400"
                aria-label="Buat Pengumuman"
              >
                <Megaphone className="h-4 w-4 text-amber-300" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowKalender(true)}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 ring-offset-2 transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              aria-label="Kalender Libur"
            >
              <CalendarDays className="h-5 w-5 text-white" />
            </button>
            <button
              type="button"
              onClick={() => setShowInbox(true)}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 ring-offset-2 transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              aria-label="Notifikasi"
            >
              <Bell className="h-5 w-5 text-white" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full ring-offset-2 focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={session?.user?.user_metadata?.avatar_url} alt={session?.user?.email} />
                    <AvatarFallback>{session?.user?.email?.charAt(0)?.toUpperCase() || 'U'}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="space-y-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {session?.user?.user_metadata?.full_name || session?.user?.email}
                  </p>
                  <p className="pt-0.5 text-xs text-slate-500">{displayRole}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setShowAccountSettings(true);
                  }}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Pengaturan
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setShowLogoutConfirm(true);
                  }}
                  className="text-red-600 focus:text-red-600"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Keluar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Announcement banner — below sticky header, visible to all */}
      <div className="sticky top-[57px] z-40">
        <AnnouncementBanner />
      </div>

      <NotificationsInbox
        open={showInbox}
        onOpenChange={setShowInbox}
        onOpenAll={() => setShowAllNotifications(true)}
      />
      <AllNotifications open={showAllNotifications} onOpenChange={setShowAllNotifications} />
      <AccountSettings open={showAccountSettings} onOpenChange={setShowAccountSettings} />
      <ComposeAnnouncement open={showCompose} onOpenChange={setShowCompose} />
      <KalenderLibur open={showKalender} onOpenChange={setShowKalender} showTagihan={userRole === 'admin' || userRole === 'super_admin'} />

      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
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

      <Dialog open={showPinModal} onOpenChange={setShowPinModal}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl font-bold">Masukkan PIN</DialogTitle>
            <DialogDescription className="text-center">
              Halaman ini dilindungi. Masukkan PIN 6 digit untuk melanjutkan.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6">
            <PinInput onComplete={handlePinComplete} />
          </div>
        </DialogContent>
      </Dialog>

      <div className="min-h-screen pb-28 sm:pb-32">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}>
            {renderContent()}
          </motion.div>
        </AnimatePresence>

        <div className="fixed bottom-0 left-0 right-0 z-50 px-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2">
          <div className="mx-auto w-full max-w-md rounded-3xl border-2 border-slate-300 bg-white/95 shadow-xl backdrop-blur">
            <div className="relative flex items-end justify-between gap-1 px-2 py-2">
              {primaryTabs.slice(0, userRole === 'karyawan' ? 1 : 2).map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabClick(tab.id)}
                    className={`flex h-12 w-14 flex-col items-center justify-center rounded-xl border ${isActive ? 'border-cyan-600 bg-cyan-600 text-white' : 'border-slate-300 text-slate-700'}`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="mt-1 text-[10px]">{tab.label}</span>
                  </button>
                );
              })}

              <button
                onClick={() => handleTabClick('form')}
                className={`-mt-7 flex h-16 w-16 flex-col items-center justify-center rounded-2xl border-4 border-white text-white shadow-lg ${activeTab === 'form' ? 'bg-blue-600' : 'bg-cyan-500'
                  }`}
              >
                <Camera className="h-6 w-6" />
                <span className="mt-0.5 text-[9px] font-semibold">Input</span>
              </button>

              {primaryTabs.slice(userRole === 'karyawan' ? 1 : 2, userRole === 'karyawan' ? 2 : 4).map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabClick(tab.id)}
                    className={`flex h-12 w-14 flex-col items-center justify-center rounded-xl border ${isActive ? 'border-cyan-600 bg-cyan-600 text-white' : 'border-slate-300 text-slate-700'}`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="mt-1 text-[10px]">{tab.label}</span>
                  </button>
                );
              })}

              {secondaryTabs.length > 0 && (
                <button
                  onClick={() => setShowMoreMenus((prev) => !prev)}
                  className="flex h-12 w-10 items-center justify-center rounded-xl text-slate-700"
                  aria-label="Menu lainnya"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
              )}
            </div>
            {showMoreMenus && secondaryTabs.length > 0 && (
              <div className="border-t border-slate-200 p-2">
                <div className="grid grid-cols-3 gap-1">
                  {secondaryTabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => handleTabClick(tab.id)}
                        className={`flex h-12 flex-col items-center justify-center rounded-lg text-[10px] font-semibold ${isActive ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-700'
                          }`}
                      >
                        <Icon className="mb-1 h-3.5 w-3.5" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="mx-auto mt-2 w-full max-w-md px-2 text-center text-[11px] text-slate-600">
            © {currentYear} - Kakarama Room. All rights reserved.
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
