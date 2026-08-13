import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Loader2, Database, Server, User, HardDrive, Rocket } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';

const STEPS = ['Database', 'Migrasi', 'Admin', 'Storage', 'Selesai'];

function post(path, body) {
  return fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify(body || {}),
  }).then(async (res) => {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || json.error || `HTTP ${res.status}`);
    return json;
  });
}

export default function InstallerPage({ onDone }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  // Step 1 — DB
  const [conn, setConn] = useState({
    host: '127.0.0.1', port: '5432', database: '', user: '', password: '', databaseUrl: '',
  });
  // Step 3 — Admin
  const [admin, setAdmin] = useState({ email: '', password: '', fullName: '' });
  // Step 4 — Storage
  const [storage, setStorage] = useState({ provider: 'r2', bucket: '', endpoint: '', publicUrl: '', supabaseBucket: '' });
  // Step 5 — Finish
  const [baseUrl, setBaseUrl] = useState('');

  const [dbResult, setDbResult] = useState(null);

  const setField = (setter, key) => (e) => setter((p) => ({ ...p, [key]: e.target.value }));

  const handleDb = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = conn.databaseUrl
        ? { databaseUrl: conn.databaseUrl }
        : { host: conn.host, port: Number(conn.port) || 5432, database: conn.database, user: conn.user, password: conn.password };
      const r = await post('/api/install/step/db', body);
      setDbResult(r);
      setStep(1);
      toast({ title: 'Koneksi berhasil', description: r.hasSchema ? 'Skema sudah ada.' : 'Database baru siap dimigrasi.' });
    } catch (err) {
      toast({ title: 'Koneksi gagal', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleMigrate = async () => {
    setBusy(true);
    try {
      const r = await post('/api/install/step/migrate');
      setStep(2);
      toast({ title: 'Migrasi selesai', description: `${(r.applied || []).length} file SQL diterapkan.` });
    } catch (err) {
      toast({ title: 'Migrasi gagal', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleAdmin = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await post('/api/install/step/admin', admin);
      setStep(3);
      toast({ title: 'Admin pertama dibuat' });
    } catch (err) {
      toast({ title: 'Gagal buat admin', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleStorage = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const config = { bucket: storage.bucket, endpoint: storage.endpoint, publicUrl: storage.publicUrl };
      if (storage.provider === 'supabase') config.bucket = storage.supabaseBucket;
      await post('/api/install/step/storage', { provider: storage.provider, config });
      setStep(4);
      toast({ title: 'Storage dikonfigurasi' });
    } catch (err) {
      toast({ title: 'Storage gagal', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleFinish = async () => {
    setBusy(true);
    try {
      // Password admin dikirim ulang saat finalisasi (tidak disimpan server antar step).
      await post('/api/install/finish', { baseUrl, adminPassword: admin.password });
      toast({ title: 'Instalasi selesai!', description: 'Mengarahkan ke halaman login...' });
      setTimeout(() => { onDone?.(); window.location.href = '/'; }, 800);
    } catch (err) {
      toast({ title: 'Finalisasi gagal', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const progressIcons = [Database, Server, User, HardDrive, Rocket];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-xl">
        <Card className="bg-white/95 rounded-3xl shadow-2xl border-0 overflow-hidden">
          <CardHeader className="bg-slate-50 border-b border-slate-100 pb-4">
            <CardTitle className="text-xl font-bold text-slate-900">Instalasi Kakarama Room</CardTitle>
            <CardDescription>Konfigurasi server self-host pertama kali.</CardDescription>
            {/* Stepper */}
            <div className="flex items-center gap-1 mt-4">
              {STEPS.map((label, i) => {
                const Icon = progressIcons[i];
                const active = i === step;
                const done = i < step;
                return (
                  <div key={label} className="flex-1 flex flex-col items-center gap-1">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center transition-colors ${done ? 'bg-emerald-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                      {done ? <CheckCircle className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <span className={`text-[10px] font-medium ${active ? 'text-blue-700' : 'text-slate-400'}`}>{label}</span>
                  </div>
                );
              })}
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {/* Step 0: DB */}
            {step === 0 && (
              <form onSubmit={handleDb} className="space-y-4">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-500">
                  Gunakan <b>databaseUrl</b> atau isi manual host/port/db/user/password.
                </div>
                <div className="space-y-2">
                  <Label htmlFor="databaseUrl">Database URL (postgres://...)</Label>
                  <Input id="databaseUrl" value={conn.databaseUrl} onChange={setField(setConn, 'databaseUrl')} placeholder="postgres://user:pass@host:5432/db" className="rounded-xl" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label htmlFor="host">Host</Label><Input id="host" value={conn.host} onChange={setField(setConn, 'host')} className="rounded-xl" /></div>
                  <div className="space-y-2"><Label htmlFor="port">Port</Label><Input id="port" value={conn.port} onChange={setField(setConn, 'port')} className="rounded-xl" /></div>
                  <div className="space-y-2"><Label htmlFor="database">Database</Label><Input id="database" value={conn.database} onChange={setField(setConn, 'database')} className="rounded-xl" /></div>
                  <div className="space-y-2"><Label htmlFor="user">User</Label><Input id="user" value={conn.user} onChange={setField(setConn, 'user')} className="rounded-xl" /></div>
                  <div className="space-y-2 col-span-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" value={conn.password} onChange={setField(setConn, 'password')} className="rounded-xl" /></div>
                </div>
                <Button type="submit" disabled={busy} className="w-full bg-blue-600 hover:bg-blue-700 rounded-xl py-6">
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Database className="h-4 w-4 mr-2" />} Tes Koneksi
                </Button>
              </form>
            )}

            {/* Step 1: Migrate */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-800">
                  {dbResult?.hasSchema ? 'Skema terdeteksi. Migrasi akan memastikan semua tabel & fungsi terbaru.' : 'Database kosong. Migrasi akan membuat seluruh skema.'}
                </div>
                <Button onClick={handleMigrate} disabled={busy} className="w-full bg-blue-600 hover:bg-blue-700 rounded-xl py-6">
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Server className="h-4 w-4 mr-2" />} Jalankan Migrasi
                </Button>
              </div>
            )}

            {/* Step 2: Admin */}
            {step === 2 && (
              <form onSubmit={handleAdmin} className="space-y-4">
                <div className="space-y-2"><Label htmlFor="aemail">Email Admin</Label><Input id="aemail" type="email" required value={admin.email} onChange={setField(setAdmin, 'email')} placeholder="admin@kr.local" className="rounded-xl" /></div>
                <div className="space-y-2"><Label htmlFor="aname">Nama Lengkap</Label><Input id="aname" value={admin.fullName} onChange={setField(setAdmin, 'fullName')} placeholder="Admin KR" className="rounded-xl" /></div>
                <div className="space-y-2"><Label htmlFor="apass">Password</Label><Input id="apass" type="password" required minLength={8} value={admin.password} onChange={setField(setAdmin, 'password')} placeholder="Minimal 8 karakter" className="rounded-xl" /></div>
                <Button type="submit" disabled={busy} className="w-full bg-blue-600 hover:bg-blue-700 rounded-xl py-6">
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <User className="h-4 w-4 mr-2" />} Buat Admin Pertama
                </Button>
              </form>
            )}

            {/* Step 3: Storage */}
            {step === 3 && (
              <form onSubmit={handleStorage} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sprovider">Provider Storage</Label>
                  <select id="sprovider" value={storage.provider} onChange={setField(setStorage, 'provider')} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                    <option value="r2">Cloudflare R2</option>
                    <option value="vercel_blob">Vercel Blob</option>
                    <option value="supabase">Supabase Storage</option>
                  </select>
                </div>
                {storage.provider === 'r2' && (
                  <>
                    <div className="space-y-2"><Label htmlFor="sbucket">Bucket</Label><Input id="sbucket" required value={storage.bucket} onChange={setField(setStorage, 'bucket')} className="rounded-xl" /></div>
                    <div className="space-y-2"><Label htmlFor="sendpoint">Endpoint</Label><Input id="sendpoint" required value={storage.endpoint} onChange={setField(setStorage, 'endpoint')} placeholder="https://<account>.r2.cloudflarestorage.com" className="rounded-xl" /></div>
                    <div className="space-y-2"><Label htmlFor="spublic">Public URL (opsional)</Label><Input id="spublic" value={storage.publicUrl} onChange={setField(setStorage, 'publicUrl')} className="rounded-xl" /></div>
                  </>
                )}
                {storage.provider === 'supabase' && (
                  <div className="space-y-2"><Label htmlFor="ssupabucket">Storage Bucket</Label><Input id="ssupabucket" required value={storage.supabaseBucket} onChange={setField(setStorage, 'supabaseBucket')} className="rounded-xl" /></div>
                )}
                {storage.provider === 'vercel_blob' && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-500">Token dikonfigurasi di env server (BLOB_READ_WRITE_TOKEN).</div>
                )}
                <Button type="submit" disabled={busy} className="w-full bg-blue-600 hover:bg-blue-700 rounded-xl py-6">
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <HardDrive className="h-4 w-4 mr-2" />} Simpan Storage
                </Button>
              </form>
            )}

            {/* Step 4: Finish */}
            {step === 4 && (
              <div className="space-y-4">
                <div className="space-y-2"><Label htmlFor="baseurl">Base URL Aplikasi</Label><Input id="baseurl" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://kr.example.com" className="rounded-xl" /></div>
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-800">
                  Semua langkah selesai. Finalisasi akan menulis konfigurasi ke server dan mengunci installer.
                </div>
                <Button onClick={handleFinish} disabled={busy} className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-xl py-6">
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />} Selesaikan Instalasi
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}