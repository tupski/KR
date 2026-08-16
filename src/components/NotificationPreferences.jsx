import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import { notificationsApi } from '@/api/notifications.api';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const TYPE_OPTIONS = [
  { type: 'announcement', label: 'Pengumuman' },
  { type: 'checkout_due', label: 'Checkout (Terlambat)' },
  { type: 'checkout_soon', label: 'Pengingat Checkout' },
  { type: 'rooms_low', label: 'Kamar Hampir Habis' },
  { type: 'rooms_sold_out', label: 'Kamar Habis' },
];

function normalizeTypesEnabled(jsonb) {
  if (!jsonb || typeof jsonb !== 'object') return {};
  return jsonb;
}

export default function NotificationPreferences({ open, onOpenChange }) {
  const { user } = useAuth();
  const userId = user?.id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [typesEnabled, setTypesEnabled] = useState({});

  const defaults = useMemo(() => {
    const out = {};
    TYPE_OPTIONS.forEach((x) => {
      out[x.type] = true;
    });
    return out;
  }, []);

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await notificationsApi.getPreferences();

      setPushEnabled(data?.push_enabled ?? true);
      const raw = normalizeTypesEnabled(data?.types_enabled);
      // key missing = enabled; supaya forward-compatible
      const merged = { ...defaults, ...raw };
      setTypesEnabled(merged);
    } catch (e) {
      toast({ title: 'Gagal memuat preferensi', description: e?.message || 'Coba lagi.', variant: 'destructive' });
      setPushEnabled(true);
      setTypesEnabled(defaults);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  const toggleType = (type) => {
    setTypesEnabled((prev) => ({ ...prev, [type]: !(prev?.[type] ?? true) }));
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      await notificationsApi.updatePreferences({
        push_enabled: !!pushEnabled,
        types_enabled: typesEnabled,
      });
      toast({ title: 'Preferensi disimpan ✅' });
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Gagal menyimpan', description: e?.message || 'Coba lagi.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white">
        <DialogHeader>
          <DialogTitle>Preferensi Notifikasi</DialogTitle>
          <DialogDescription>Atur jenis notifikasi yang ingin dikirim lewat push notification.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-slate-500">Memuat...</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border bg-slate-50 p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">Push Notification</p>
                <p className="text-xs text-slate-600">Jika dimatikan, tidak ada push yang akan dikirim.</p>
              </div>
              <Switch checked={pushEnabled} onCheckedChange={setPushEnabled} />
            </div>

            <div className={`space-y-2 ${pushEnabled ? '' : 'opacity-60'}`}>
              {TYPE_OPTIONS.map((opt) => (
                <div key={opt.type} className="flex items-center justify-between rounded-xl border p-3">
                  <p className="text-sm font-medium text-slate-800">{opt.label}</p>
                  <Switch
                    checked={typesEnabled?.[opt.type] ?? true}
                    onCheckedChange={() => toggleType(opt.type)}
                    disabled={!pushEnabled}
                  />
                </div>
              ))}
              <p className="text-[11px] text-slate-500">
                Catatan: jenis notifikasi baru yang belum ada di daftar akan dianggap aktif (enabled) secara default.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Batal
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Menyimpan...' : 'Simpan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

