import React, { useState, useEffect } from 'react';
import { supabase, customSupabaseClient } from '../lib/customSupabaseClient';
import { IS_SELF_HOST } from '@/lib/config';
import {
  Settings, Save, RefreshCw, Smartphone,
  AlertTriangle, CheckCircle, Megaphone,
  Info, ShieldCheck, Globe, HardDrive, Wrench
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Switch } from './ui/switch';
import { Textarea } from './ui/textarea';
import { motion } from 'framer-motion';
import { toast } from '@/components/ui/use-toast';

const GlobalSettings = () => {
  const [settings, setSettings] = useState({
    app_name: 'Kakarama Room',
    wa_admin: '',
    maintenance_mode: false,
    global_announcement: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storage, setStorage] = useState({
    provider: 'r2',
    r2_bucket: '',
    r2_endpoint: '',
    r2_public_url: '',
    supabase_storage_bucket: '',
  });
  const [storageTest, setStorageTest] = useState(null);
  const [testingStorage, setTestingStorage] = useState(false);

  const PROVIDER_META = {
    r2: { label: 'Cloudflare R2', fields: ['r2_bucket', 'r2_endpoint', 'r2_public_url'], secretHint: 'R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY' },
    vercel_blob: { label: 'Vercel Blob', fields: [], secretHint: 'BLOB_READ_WRITE_TOKEN' },
    supabase: { label: 'Supabase Storage', fields: ['supabase_storage_bucket'], secretHint: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' },
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('system_settings')
        .select('*');

      if (error) throw error;

      if (data) {
        const settingsObj = {};
        data.forEach(item => {
          settingsObj[item.key] = item.value;
        });
        setSettings(prev => ({ ...prev, ...settingsObj }));
        setStorage(prev => ({
          ...prev,
          provider: settingsObj.storage_provider || prev.provider,
          ...(typeof settingsObj.storage_config === 'object' ? settingsObj.storage_config : {}),
        }));
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast({ title: "Gagal memuat pengaturan", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      const updates = Object.keys(settings).map(key => ({
        key,
        value: settings[key],
        updated_at: new Date().toISOString()
      }));

      const { error } = await supabase
        .from('system_settings')
        .upsert(updates, { onConflict: 'key' });

      if (error) throw error;

      toast({ title: "Pengaturan disimpan! ✅", description: "Perubahan telah diterapkan ke seluruh sistem." });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({ title: "Gagal menyimpan", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // F2: Storage provider config (non-secret only, K4). Secret via server env.
  const handleSaveStorage = async () => {
    try {
      setSaving(true);
      const { r2_bucket, r2_endpoint, r2_public_url, supabase_storage_bucket } = storage;
      const config = {};
      if (r2_bucket) config.r2_bucket = r2_bucket;
      if (r2_endpoint) config.r2_endpoint = r2_endpoint;
      if (r2_public_url) config.r2_public_url = r2_public_url;
      if (supabase_storage_bucket) config.supabase_storage_bucket = supabase_storage_bucket;

      const updates = [
        { key: 'storage_provider', value: storage.provider, updated_at: new Date().toISOString() },
        { key: 'storage_config', value: config, updated_at: new Date().toISOString() },
      ];
      const { error } = await supabase.from('system_settings').upsert(updates, { onConflict: 'key' });
      if (error) throw error;
      setStorageTest(null);
      toast({ title: 'Penyimpanan disimpan', description: 'Konfigurasi storage non-secret tersimpan.' });
    } catch (error) {
      console.error('Error saving storage:', error);
      toast({ title: 'Gagal menyimpan storage', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestStorage = async () => {
    try {
      setTestingStorage(true);
      setStorageTest(null);
      const provider = storage.provider;
      if (IS_SELF_HOST && customSupabaseClient?.http) {
        const { data, error } = await customSupabaseClient.http('GET', `/api/storage/test?provider=${encodeURIComponent(provider)}`);
        if (error) setStorageTest({ ok: false, message: error.message });
        else setStorageTest({ ok: data?.ok || false, message: data?.detail || 'OK' });
      } else {
        const res = await fetch(`/api/storage/test?provider=${encodeURIComponent(provider)}`, {
          method: 'GET', credentials: 'include',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) setStorageTest({ ok: false, message: j.error || `HTTP ${res.status}` });
        else setStorageTest({ ok: j.ok || false, message: j.detail || 'OK' });
      }
    } catch (e) {
      setStorageTest({ ok: false, message: e.message });
    } finally {
      setTestingStorage(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
        <RefreshCw className="h-8 w-8 text-blue-600 animate-spin" />
        <p className="text-slate-500 text-sm font-medium">Memuat konfigurasi...</p>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-8 px-4 py-8 sm:px-0"
    >
      <div className="flex items-center justify-between bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Settings className="h-5 w-5 text-slate-400" /> Konfigurasi Global
          </h2>
          <p className="text-sm text-slate-500 mt-1">Atur parameter sistem yang berlaku untuk semua pengguna.</p>
        </div>
        <Button 
          onClick={handleSave} 
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl px-6 shadow-lg shadow-blue-100"
        >
          {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Simpan Perubahan
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Branding Section */}
        <Card className="rounded-[2rem] border-slate-100 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-500" /> Branding & Sistem
            </CardTitle>
            <CardDescription>Nama aplikasi dan identitas sistem.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="app_name">Nama Aplikasi</Label>
              <Input 
                id="app_name" 
                value={settings.app_name} 
                onChange={(e) => setSettings({...settings, app_name: e.target.value})}
                placeholder="Kakarama Room"
                className="rounded-xl border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wa_admin">Nomor WA Admin (Laporan)</Label>
              <div className="relative">
                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  id="wa_admin" 
                  value={settings.wa_admin} 
                  onChange={(e) => setSettings({...settings, wa_admin: e.target.value})}
                  placeholder="628..."
                  className="pl-10 rounded-xl border-slate-200"
                />
              </div>
              <p className="text-[10px] text-slate-400 italic">Gunakan format internasional (628...)</p>
            </div>
          </CardContent>
        </Card>

        {/* Operational Section */}
        <Card className="rounded-[2rem] border-slate-100 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Operasional
            </CardTitle>
            <CardDescription>Kontrol akses dan status sistem.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="space-y-0.5">
                <Label htmlFor="maintenance" className="text-slate-900 font-bold">Mode Pemeliharaan</Label>
                <p className="text-xs text-slate-500">Batasi akses hanya untuk Super Admin.</p>
              </div>
              <Switch 
                id="maintenance" 
                checked={settings.maintenance_mode} 
                onCheckedChange={(v) => setSettings({...settings, maintenance_mode: v})}
              />
            </div>
            {settings.maintenance_mode && (
              <div className="p-3 bg-amber-50 text-amber-700 rounded-xl flex items-start gap-2 text-xs border border-amber-100">
                <Info className="h-4 w-4 shrink-0" />
                <span>Saat aktif, karyawan dan admin biasa tidak dapat login ke sistem.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Announcement Section */}
        <Card className="md:col-span-2 rounded-[2rem] border-slate-100 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50">
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-purple-500" /> Pengumuman Global
            </CardTitle>
            <CardDescription>Pesan ini akan muncul di dasbor seluruh karyawan.</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <Textarea
              value={settings.global_announcement}
              onChange={(e) => setSettings({...settings, global_announcement: e.target.value})}
              placeholder="Ketik pengumuman di sini..."
              className="min-h-[120px] rounded-2xl border-slate-200 resize-none focus:ring-purple-500"
            />
          </CardContent>
        </Card>

        {/* Penyimpanan File (self-host only, F2) */}
        {IS_SELF_HOST && (
          <Card className="md:col-span-2 rounded-[2rem] border-slate-100 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50">
              <CardTitle className="text-base flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-emerald-500" /> Penyimpanan File
              </CardTitle>
              <CardDescription>Konfigurasi penyimpanan file (non-secret). Secret diisi di env server (K4).</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="storage_provider">Provider Penyimpanan</Label>
                <select
                  id="storage_provider"
                  value={storage.provider}
                  onChange={(e) => setStorage({ ...storage, provider: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  {Object.entries(PROVIDER_META).map(([key, meta]) => (
                    <option key={key} value={key}>{meta.label}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 italic">Secret: {PROVIDER_META[storage.provider]?.secretHint}</p>
              </div>

              {PROVIDER_META[storage.provider]?.fields.map((field) => (
                <div key={field} className="space-y-2">
                  <Label htmlFor={field}>{field.replace(/_/g, ' ').toUpperCase()}</Label>
                  <Input
                    id={field}
                    value={storage[field] || ''}
                    onChange={(e) => setStorage({ ...storage, [field]: e.target.value })}
                    placeholder="..."
                    className="rounded-xl border-slate-200"
                  />
                </div>
              ))}

              <div className="flex items-center gap-3 pt-1">
                <Button
                  onClick={handleSaveStorage}
                  disabled={saving || testingStorage}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl px-6"
                >
                  <Save className="h-4 w-4 mr-2" /> Simpan Penyimpanan
                </Button>
                <Button
                  variant="outline"
                  onClick={handleTestStorage}
                  disabled={testingStorage}
                  className="rounded-2xl px-6"
                >
                  <Wrench className="h-4 w-4 mr-2" />
                  {testingStorage ? 'Menguji...' : 'Test Koneksi'}
                </Button>
              </div>

              {storageTest && (
                <div className={`flex items-center gap-2 p-3 rounded-xl text-xs border ${storageTest.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                  {storageTest.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                  <span>{storageTest.ok ? `✓ OK — ${storageTest.message || ''}` : `✗ ${storageTest.message || 'Gagal'}`}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-2xl border border-blue-100">
        <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0" />
        <p className="text-xs text-blue-800 leading-relaxed">
          <strong>Keamanan:</strong> Hanya Super Admin yang memiliki wewenang untuk mengubah pengaturan global ini. Pastikan nomor WhatsApp sudah benar untuk menghindari kegagalan pengiriman laporan.
        </p>
      </div>
    </motion.div>
  );
};

export default GlobalSettings;