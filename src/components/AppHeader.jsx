import React from 'react';
import {
  Bell,
  Megaphone,
  CalendarDays,
  Settings,
  LogOut,
} from 'lucide-react';
import { useLiveClock } from '@/hooks/useLiveClock';
import { useNotifications } from '@/hooks/useNotifications';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

/**
 * AppHeader — Sticky top header with live clock, notification bell
 * with badge, quick action buttons, and avatar dropdown.
 *
 * @param {object} props
 * @param {object} props.session          – Supabase auth session
 * @param {string} props.userRole         – Current user role
 * @param {string} props.appName          – Application display name
 * @param {function} props.onOpenInbox    – Open notifications inbox
 * @param {function} props.onOpenAllNotif – Open all notifications
 * @param {function} props.onOpenCompose  – Open compose announcement
 * @param {function} props.onOpenKalender – Open kalender libur
 * @param {function} props.onOpenSettings – Open account settings
 * @param {function} props.onOpenLogout   – Open logout confirmation
 */
export function AppHeader({
  session,
  userRole,
  appName,
  onOpenInbox,
  onOpenAllNotif,
  onOpenCompose,
  onOpenKalender,
  onOpenSettings,
  onOpenLogout,
}) {
  const { liveDateTime } = useLiveClock();
  const { unreadCount } = useNotifications(session, userRole);

  const displayRole =
    userRole === 'super_admin'
      ? 'Super Admin'
      : userRole === 'admin'
        ? 'Admin'
        : 'Karyawan';

  return (
    <header className="sticky top-0 z-50 bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-4 text-white shadow-lg">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        {/* Logo + App Name */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 p-1 shadow-sm ring-1 ring-white/40">
            <img
              src="/logo-kr-transparent-square.png"
              alt="KR"
              className="h-full w-full object-contain"
            />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold tracking-wide text-white sm:text-base">
              {appName}
            </span>
            <span className="text-[10px] font-medium text-white/80 sm:hidden">
              {liveDateTime}
            </span>
          </div>
        </div>

        {/* Desktop clock */}
        <div className="hidden sm:flex absolute left-1/2 -translate-x-1/2 items-center">
          <span className="text-sm font-semibold text-white/90 whitespace-nowrap tracking-wide">
            {liveDateTime}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Megaphone — admin/superadmin only */}
          {(userRole === 'admin' || userRole === 'super_admin') && (
            <button
              type="button"
              onClick={onOpenCompose}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-amber-400/20 ring-offset-2 transition hover:bg-amber-400/30 focus:outline-none focus:ring-2 focus:ring-amber-400"
              aria-label="Buat Pengumuman"
            >
              <Megaphone className="h-4 w-4 text-amber-300" />
            </button>
          )}

          {/* Kalender libur */}
          <button
            type="button"
            onClick={onOpenKalender}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 ring-offset-2 transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            aria-label="Kalender Libur"
          >
            <CalendarDays className="h-5 w-5 text-white" />
          </button>

          {/* Notification bell */}
          <button
            type="button"
            onClick={onOpenInbox}
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

          {/* Avatar dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full ring-offset-2 focus:outline-none focus:ring-2 focus:ring-cyan-500">
                <Avatar className="h-9 w-9">
                  <AvatarImage
                    src={session?.user?.user_metadata?.avatar_url}
                    alt={session?.user?.email}
                  />
                  <AvatarFallback>
                    {session?.user?.email?.charAt(0)?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="space-y-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {session?.user?.user_metadata?.full_name ||
                    session?.user?.email}
                </p>
                <p className="pt-0.5 text-xs text-slate-500">{displayRole}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  onOpenSettings();
                }}
              >
                <Settings className="mr-2 h-4 w-4" />
                Pengaturan
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  onOpenLogout();
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
  );
}
