import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, KeyRound, LogOut, Phone, Save, User2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { usersApi } from '@/api/users.api';
import { authApi } from '@/api/auth.api';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { uploadToVercelBlob } from '@/lib/vercelBlobUpload';
import { compressImageFile } from '@/lib/compressImage';
import { isPushSupported, registerPushSubscription, saveSubscriptionToSupabase } from '@/lib/pushClient';

const DEFAULT_AVATAR = '/logo-kr-transparent-square.png';

export default function AccountSettings({ open, onOpenChange }) {
  const { user, userRole, refreshSession } = useAuth();
  const userId = user?.id;
  const avatarInputRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState(''); // tanpa +62
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const displayAvatar = avatarUrl || user?.user_metadata?.avatar_url || DEFAULT_AVATAR;
  const roleLabel = userRole === 'super_admin' ? 'Super Admin' : userRole === 'admin' ? 'Admin' : 'Karyawan';

  const vapidPublicKey = useMemo(() => import.meta.env.VITE_VAPID_PUBLIC_KEY || '', []);

  const loadProfile = async () => {
    if (!userId) return;
    try {
      const data = await usersApi.getMe();
      const p = data || null;
      setProfile(p);
      setFullName(p?.full_name || user?.user_metadata?.full_name || '');
      setEmail(p?.email || user?.email || '');
      setAvatarUrl(p?.avatar_url || '');

      const rawPhone = String(p?.phone || '').trim();
      const normalized = rawPhone.replace(/\\s+/g, '');
      if (normalized.startsWith('+62')) setPhone(normalized.slice(3));
      else if (normalized.startsWith('62')) setPhone(normalized.slice(2));
      else if (normalized.startsWith('0')) setPhone(normalized.slice(1));
      else setPhone(normalized);
    } catch (error) {
      toast({ title: 'Gagal memuat profil', description: error.message, variant: 'destructive' });
    }
  };

  useEffect(() => {
    if (open) {
      loadProfile();
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  const handlePickAvatar = async (file) => {
    if (!file) return;
    setLoading(true);
    try {
      const compressed = await compressImageFile(file, { maxWidth: 1024, maxHeight: 1024, quality: 0.85 });
      const url = await uploadToVercelBlob(compressed, 'avatars');
      setAvatarUrl(url);
      // Simpan ke user_profiles via REST API
      await usersApi.updateMyProfile({ avatar_url: url });
      // Update metadata agar header langsung ikut
      await authApi.updateMetadata({ avatar_url: url });
      await refreshSession?.();
      toast({ title: 'Foto profil diperbarui' });
    } catch (e) {
      toast({ title: 'Gagal upload foto profil', description: e?.message || 'Coba lagi.', variant: 'destructive' });
    } finally {
      setLoading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleSaveProfile = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const cleanedPhone = String(phone || '').replace(/\\D/g, '');
      const phoneWithPrefix = cleanedPhone ? `+62${cleanedPhone}` : null;
      await usersApi.updateMyProfile({
        full_name: String(fullName || '').trim() || null,
        phone: phoneWithPrefix,
      });
      // Update metadata agar header langsung ikut
      await authApi.updateMetadata({ full_name: String(fullName || '').trim() || '' });
      await refreshSession?.();
      toast({ title: 'Profil disimpan' });
      await loadProfile();
    } catch (e) {
      toast({ title: 'Gagal menyimpan profil', description: e?.message || 'Coba lagi.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    const userEmail = user?.email || '';
    if (!userEmail) return;
    if (!oldPassword || !newPassword || !confirmPassword) {
      toast({ title: 'Lengkapi semua field password', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Konfirmasi password tidak sama', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: 'Password minimal 8 karakter', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      await authApi.changePassword(oldPassword, newPassword);
      toast({ title: 'Password berhasil diganti' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      toast({ title: 'Gagal ganti password', description: e?.message || 'Coba lagi.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOutAllDevices = async () => {
    setSigningOut(true);
    try {
      await authApi.signOutAllDevices();
      toast({ title: 'Semua perangkat telah logout' });
      setSignOutDialogOpen(false);
    } catch (e) {
      toast({ title: 'Gagal logout perangkat', description: e?.message || 'Coba lagi.', variant: 'destructive' });
    } finally {
      setSigningOut(false);
    }
  };

  const handleEnablePush = async () => {
    if (!userId) return;
    if (!isPushSupported()) {
      toast({
        title: 'Push tidak didukung',
        description: 'Gunakan Chrome atau Edge terbaru (bukan Safari/Firefox mobile) dan pastikan notifikasi diizinkan di pengaturan browser.',
        variant: 'destructive',
      });
      return;
    }
    if (!vapidPublicKey) {
      toast({
        title: 'VAPID Public Key belum tersedia',
        description: 'Set env frontend VITE_VAPID_PUBLIC_KEY di Vercel (nilainya sama dengan VAPID_PUBLIC_KEY).',
        variant: 'destructive',
      });
      return;
    }
    try {
      // Minta izin notifikasi terlebih dahulu
      const permission = await Notification.requestPermission();
      if (permission === 'denied') {
        toast({
          title: 'Notifikasi diblokir',
          description: 'Izinkan notifikasi di pengaturan browser lalu coba lagi.',
          variant: 'destructive',
        });
        return;
      }
      if (permission !== 'granted') {
        toast({ title: 'Izin notifikasi belum diberikan', variant: 'destructive' });
        return;
      }
      const sub = await registerPushSubscription({ vapidPublicKey });
      await saveSubscriptionToSupabase(sub, userId);
      toast({ title: 'Notifikasi diaktifkan! ✅', description: 'Anda akan menerima notifikasi penting dari aplikasi.' });
    } catch (e) {
      toast({ title: 'Gagal mengaktifkan notifikasi', description: e?.message || 'Coba lagi.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pengaturan Akun</DialogTitle>
          <DialogDescription>Kelola profil, keamanan, dan notifikasi.</DialogDescription>
        </DialogHeader>

        <section className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="relative h-14 w-14 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
              <img src={displayAvatar} alt="Foto profil" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{fullName || user?.email}</p>
              <p className="text-xs text-slate-500">{roleLabel}</p>
            </div>
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => avatarInputRef.current?.click()}
              >
                <Camera className="mr-2 h-4 w-4" />
                Ganti
              </Button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handlePickAvatar(e.target.files?.[0] || null)}
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border bg-white p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <User2 className="h-4 w-4" /> Profil
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">Nama</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
                placeholder="Nama"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Nomor telepon</label>
              <div className="flex overflow-hidden rounded-lg border border-slate-300">
                <div className="flex items-center gap-2 bg-slate-50 px-3 text-sm text-slate-700">
                  <Phone className="h-4 w-4" /> +62
                </div>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-10 w-full px-3 text-sm outline-none"
                  inputMode="numeric"
                  placeholder="8123456789"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none disabled:bg-slate-100"
              />
              <p className="mt-1 text-[11px] text-slate-500">Email hanya bisa diubah oleh admin.</p>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" className="bg-slate-900 hover:bg-slate-800" onClick={handleSaveProfile} disabled={loading}>
              <Save className="mr-2 h-4 w-4" /> Update Profil
            </Button>
          </DialogFooter>
        </section>

        <section className="rounded-xl border bg-white p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <KeyRound className="h-4 w-4" /> Ganti Password
          </h3>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Password lama</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Password baru</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Konfirmasi password baru</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
              />
            </div>
            <Button type="button" variant="outline" onClick={handleChangePassword} disabled={loading}>
              Ganti Password
            </Button>
          </div>
        </section>

        <section className="rounded-xl border bg-white p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <LogOut className="h-4 w-4" /> Keamanan
          </h3>
          <p className="text-xs text-slate-600">
            Logout dari semua perangkat. Semua sesi aktif akan ditutup, termasuk perangkat ini. Anda harus login ulang.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => setSignOutDialogOpen(true)}
            disabled={signingOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {signingOut ? 'Logging out...' : 'Logout Semua Perangkat'}
          </Button>
        </section>

        <section className="rounded-xl border bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Notifikasi</h3>
          <p className="text-xs text-slate-600">Aktifkan push notification agar Anda menerima pemberitahuan penting.</p>
          <Button type="button" className="mt-3 w-full bg-blue-700 hover:bg-blue-800" onClick={handleEnablePush}>
            Aktifkan Notifikasi
          </Button>
          {!vapidPublicKey && (
            <p className="mt-2 text-[11px] text-slate-500">
              Catatan: `VITE_VAPID_PUBLIC_KEY` belum diset di environment.
            </p>
          )}
        </section>

        <p className="text-center text-[11px] text-slate-500">
          © {new Date().getFullYear()} - Kakarama Room. All rights reserved.
        </p>
      </DialogContent>

      <AlertDialog open={signOutDialogOpen} onOpenChange={setSignOutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Logout Semua Perangkat?</AlertDialogTitle>
            <AlertDialogDescription>
              Keluar dari semua perangkat? Semua sesi aktif Anda akan ditutup, termasuk perangkat ini. Anda harus login ulang.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={signingOut}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleSignOutAllDevices} disabled={signingOut} className="bg-red-600 hover:bg-red-700 text-white">
              {signingOut ? 'Logging out...' : 'Ya, Logout'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

