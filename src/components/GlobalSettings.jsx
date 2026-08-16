import React, { useState, useEffect } from 'react';
import { settingsApi } from '@/api/settings.api';
import { 
  Settings, Save, RefreshCw, Smartphone, 
  AlertTriangle, Megaphone, 
  Info, ShieldCheck, Globe
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

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const data = await settingsApi.getAll();
      
      if (data) {
        setSettings(prev => ({ ...prev, ...data }));
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
      
      // Update each setting individually via the API
      await Promise.all(
        Object.keys(settings).map(key => 
          settingsApi.update(key, { value: settings[key] })
        )
      );

      toast({ title: "Pengaturan disimpan! ✅", description: "Perubahan telah diterapkan ke seluruh sistem." });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({ title: "Gagal menyimpan", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
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
