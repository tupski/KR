import React from 'react';
import { Settings, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * MaintenanceBanner — Full-screen maintenance mode overlay.
 *
 * Displayed when isMaintenance is true and the user is not a super admin.
 *
 * @param {object} props
 * @param {function} props.signOut – Sign-out handler
 */
export function MaintenanceBanner({ signOut }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-6">
      <div className="text-center space-y-4 max-w-sm">
        <div className="bg-amber-500/20 text-amber-500 p-4 rounded-3xl inline-block mb-2">
          <Settings className="h-12 w-12 animate-spin-slow" />
        </div>
        <h1 className="text-2xl font-bold text-white">Sedang Pemeliharaan</h1>
        <p className="text-slate-400 text-sm">
          Aplikasi sedang dalam proses update rutin untuk meningkatkan performa.
          Silakan coba lagi beberapa saat lagi.
        </p>
        <Button
          variant="outline"
          className="text-white border-slate-700 hover:bg-slate-800"
          onClick={() => signOut()}
        >
          <LogOut className="mr-2 h-4 w-4" /> Keluar
        </Button>
      </div>
    </div>
  );
}
