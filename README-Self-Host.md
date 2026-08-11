# Kakarama Room — Self-Host

Versi self-host Kakarama Room: aplikasi berjalan di server Anda sendiri (VPS/aaPanel/cPanel) dengan **Express** sebagai backend, **PostgreSQL** sebagai database, dan storage object pilihan Anda (Cloudflare R2 / Vercel Blob / Supabase Storage).

> Versi lama (Vercel + Supabase) tetap didukung penuh — lihat [Dukungan mode Vercel lama](#13-dukungan-mode-vercel-lama).

---

## 1. Ringkasan

Versi lama berjalan di **Vercel (serverless) + Supabase (DB, auth, realtime, storage)**. Model ini praktis tetapi biaya bulanan terus berjalan (Supabase paid plan, bandwith Vercel, storage) dan data berada di cloud pihak ketiga.

Versi self-host memindahkan seluruh stack ke satu server yang Anda kendalikan:

- **Backend**: Express 4 di [`server/index.js`](server/index.js) — melayani build SPA (`dist/`), API, dan auth.
- **Database**: PostgreSQL murni (tanpa RLS) lewat [`server/db.js`](server/db.js) — migrasi di [`server/migrations/self_host/`](server/migrations/self_host).
- **Auth**: JWT + cookie `httpOnly` (bukan auth Supabase) — [`server/auth.js`](server/auth.js).
- **Realtime**: diganti polling (15s saat tab terlihat) — [`src/lib/config.js`](src/lib/config.js).
- **Storage**: adapter pluggable — [`server/storage/index.js`](server/storage/index.js).
- **Instalasi**: wizard 5 langkah di halaman `/install` — [`src/pages/InstallerPage.jsx`](src/pages/InstallerPage.jsx).

Hasil: biaya server tetap + storage sesuai pemakaian, data di tangan sendiri, satu proses Node.

---

## 2. Perubahan utama

| Aspek | Vercel + Supabase (lama) | Self-host (baru) |
|---|---|---|
| Hosting | Vercel serverless (functions + edge) | Satu proses Node (Express) di VPS/aaPanel/cPanel |
| Database | Supabase Postgres (terkelola, RLS aktif) | PostgreSQL sendiri; migrasi SQL murni, tanpa RLS ([K2](docs/self-host/SPEC.md)) |
| Auth | Supabase Auth (GoTrue) | JWT + cookie `kr_session` httpOnly, SameSite=Strict, bcryptjs cost 12 ([K5](docs/self-host/SPEC.md)) |
| Storage | Vercel Blob / Supabase Storage via client SDK | `/api/storage/*` via adapter server-side (R2 / Vercel Blob / Supabase) |
| Realtime | Supabase Realtime (websocket, `postgres_changes`) | Polling interval 15s saat tab terlihat, berhenti saat tersembunyi ([K3](docs/self-host/SPEC.md)) |
| API | supabase-js langsung dari browser | Express REST: `/api/db`, `/api/rpc`, `/api/auth`, `/api/storage` |
| Biaya | Supabase paid plan + bandwidth Vercel | Server tetap + storage sesuai pemakaian |
| Secret | Env Vercel / Supabase dashboard | Env server saja; non-secret di `server/config/config.json` ([K4](docs/self-host/SPEC.md)) |

Keputusan arsitektur lengkap: [docs/self-host/SPEC.md](docs/self-host/SPEC.md).

---

## 3. Arsitektur

```
Browser SPA (React, dist/)
        │  fetch + cookie kr_session (httpOnly)
        ▼
Express server (server/index.js)
   ├── /api/auth      → login, logout, me            (server/auth.js)
   ├── /api/db        → CRUD whitelist 23 tabel      (server/routes/dbRoutes.js)
   ├── /api/rpc       → 8 RPC whitelist              (server/routes/rpcBridge.js)
   ├── /api/storage   → upload, proxy, delete, test  (server/routes/storageRoutes.js)
   ├── /api/install   → wizard instalasi              (server/routes/installRoutes.js)
   └── static dist/ + SPA fallback
        │
        ├──► PostgreSQL (server/db.js, pg Pool)
        └──► Storage provider: r2 | vercel_blob | supabase (server/storage/)
```

Komponen sisi klien:

- [`src/lib/customSupabaseClient.js`](src/lib/customSupabaseClient.js) — dual mode: self-host → [`apiClient.js`](src/lib/apiClient.js), Vercel → supabase-js. Permukaan API `{ data, error }` dipertahankan.
- [`src/lib/config.js`](src/lib/config.js) — `IS_SELF_HOST` (dari `VITE_SELF_HOST==='true'`), `API_BASE`, `subscribeChanges` (polling).
- [`src/lib/storageUrl.js`](src/lib/storageUrl.js) + [`src/lib/vercelBlobUpload.js`](src/lib/vercelBlobUpload.js) — upload/URL file: self-host → `/api/storage/*`.
- [`src/contexts/SupabaseAuthContext.jsx`](src/contexts/SupabaseAuthContext.jsx) — logika tidak berubah; adapter yang menangani.

---

## 4. Persyaratan

| Kebutuhan | Versi | Catatan |
|---|---|---|
| Node.js | **20.x** (lihat [`.nvmrc`](.nvmrc); minimum 18) | npm bawaan Node |
| PostgreSQL | **14+** | Koneksi via `DATABASE_URL` |
| PM2 / aaPanel Node project / cPanel PassNode | — | Manajemen proses |
| npm | — | `npm install` |

Storage opsional: akun Cloudflare R2, Vercel Blob, atau Supabase (cukup salah satu).

---

## 5. Instalasi cepat (aaPanel / VPS)

### 5.1 Upload & install

```bash
# di server: clone repo (atau upload zip project)
git clone <url-repo> kakarama && cd kakarama

npm install

# build frontend dengan mode self-host (WAJIB — VITE_SELF_HOST dibaca saat build)
VITE_SELF_HOST=true npm run build
# Windows CMD: set VITE_SELF_HOST=true && npm run build
```

`dist/` dihasilkan → dilayani Express. Tanpa `dist/`, server menjawab `404 { error: 'dist/ not built — run npm run build' }` untuk rute non-API.

### 5.2 Jalankan server

```bash
npm run server        # migrasi otomatis saat boot, lalu listen
# atau development: npm run server:dev
```

Buka `http://<ip-or-domain>/install` → **wizard 5 langkah**: DB → Migrate → Admin → Storage → Finish. Setelah selesai, login di `/`.

### 5.3 PM2 ecosystem (contoh)

[`ecosystem.config.js`](ecosystem.config.js) di root proyek:

```js
module.exports = {
  apps: [{
    name: 'kakarama',
    script: 'server/index.js',
    cwd: '/www/wwwroot/kakarama',
    instances: 1,
    autorestart: true,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
  }],
};
```

```bash
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

### 5.4 Reverse proxy nginx (aaPanel)

Site → nginx, tambahkan di `location /`:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 20m;
}
```

Catatan `proxy_pass`:

- **Tanpa trailing slash**: `proxy_pass http://127.0.0.1:3000;` → path diteruskan apa adanya (`/install`, `/api/...`).
- Jangan tulis `proxy_pass http://127.0.0.1:3000/;` di `location /` karena URI `location` + `/` bisa menggabungkan path secara salah.
- `client_max_body_size` wajib ≥ `BODY_LIMIT` (default `10mb`) agar upload file tidak ditolak nginx.

Aktifkan HTTPS (SSL) di panel; lalu set `COOKIE_SECURE=true`.

---

## 6. cPanel (PassNode / Node.js App)

1. **Upload & install**: unggah project, jalankan `npm install`.
2. **Build**: jalankan `VITE_SELF_HOST=true npm run build` (di terminal cPanel / SSH).
3. **Buat Node.js App** di cPanel → *Setup Node.js App*:
   - Application root: folder project.
   - Application startup file: `server/index.js`.
   - Application URL: `/` (domain).
4. **Env vars di PassNode** (tab *Environment Variables*): isi `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECURE=false`, `PORT` (boleh kosong; PassNode menyediakan port sendiri), `STORAGE_PROVIDER`, dsb — lihat [Bagian 7](#7-konfigurasi-env).
5. *Restart* aplikasi, buka `/install`, selesaikan wizard.
6. Pastikan `.htaccess` tidak bentrok dengan SPA fallback Express (file [`public/.htaccess`](public/.htaccess) hanya untuk hosting statis).

---

## 7. Konfigurasi env

Salin [`server/.env.example`](server/.env.example) ke `.env` di root proyek, lalu isi (cara manual). Installer juga menulis `.env` (secrets) + `config.json` (non-secret) + `installed.lock` ke `server/config/` saat step Finish — `server/config/.env` ikut dimuat saat boot, root `.env` menimpa bila ada.

| Variabel | Wajib | Secret | Keterangan |
|---|---|---|---|
| `PORT` | — | — | Port server (default `3000`) |
| `DATABASE_URL` | ✅ | ✅ | `postgres://user:password@host:5432/db` |
| `JWT_SECRET` | ✅ | ✅ | **Minimum 32 karakter**; random 64B hex |
| `JWT_TTL` | — | — | Umur token (default `7d`) |
| `COOKIE_SECURE` | — | — | `true` jika HTTPS (via reverse proxy); `false` untuk http |
| `STORAGE_PROVIDER` | — | — | `r2` \| `vercel_blob` \| `supabase` (default `r2`) |
| `R2_ACCESS_KEY_ID` | utk r2 | ✅ | API token Cloudflare R2 |
| `R2_SECRET_ACCESS_KEY` | utk r2 | ✅ | Secret token R2 |
| `R2_BUCKET` | utk r2 | — | Nama bucket |
| `R2_ENDPOINT` | utk r2 | — | `https://<account>.r2.cloudflarestorage.com` |
| `R2_REGION` | — | — | `auto` |
| `R2_PUBLIC_URL` | — | — | Opsional; jika kosong → URL via `/api/storage/proxy` |
| `BLOB_READ_WRITE_TOKEN` | utk vercel_blob | ✅ | Token Vercel Blob |
| `VERCEL_BLOB_BASE_URL` | — | — | Opsional, base URL publik blob |
| `SUPABASE_URL` | utk supabase | — | URL project Supabase (storage) |
| `SUPABASE_SERVICE_ROLE_KEY` | utk supabase | ✅ | Service role key — **server-side only** |
| `SUPABASE_STORAGE_BUCKET` | — | — | Nama bucket (default `transaction_receipts`) |
| `BODY_LIMIT` | — | — | Limit body JSON (default `10mb`) |
| `DIST_DIR` | — | — | Folder build (default `dist`) |
| `VITE_SELF_HOST` | ✅ (build) | — | `'true'` saat `npm run build` — mengaktifkan mode self-host di frontend |
| `VITE_API_BASE_URL` | — | — | Opsional; kosong = same-origin. Base URL API untuk frontend |

Aturan:

- **Secret tidak pernah masuk UI / `config.json`** — hanya env server (K4). UI installer hanya menerima field non-secret (bucket, endpoint, provider).
- **Jangan commit `.env`** — pastikan masuk `.gitignore`.
- `VITE_SELF_HOST` dan `VITE_API_BASE_URL` dibaca **saat build** (`import.meta.env`), jadi set sebelum `npm run build`, bukan saat runtime.

---

## 8. Storage provider

Menu **Pengaturan → "Penyimpanan File"** ([`src/components/GlobalSettings.jsx`](src/components/GlobalSettings.jsx)): pilih provider, isi field non-secret, tekan **Test Koneksi** (memanggil `GET /api/storage/test`).

### Cloudflare R2

1. Dashboard Cloudflare → **R2** → *Create bucket* (mis. `transaction_receipts`).
2. **Manage R2 API Tokens** → *Create API Token* (permission: Object Read & Write).
3. Isi env di `.env`:

```bash
STORAGE_PROVIDER=r2
R2_ACCESS_KEY_ID=<access-key-id>
R2_SECRET_ACCESS_KEY=<secret-access-key>
R2_BUCKET=transaction_receipts
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
```

4. Di UI: provider `r2`, isi `bucket` + `endpoint` (non-secret). **Credential tidak diisi di UI**, hanya env.

### Vercel Blob

1. Dashboard Vercel → project → **Storage → Blob**, buat store.
2. Salin token ke env:

```bash
STORAGE_PROVIDER=vercel_blob
BLOB_READ_WRITE_TOKEN=<token>
```

3. Di UI: provider `vercel_blob` (tanpa field non-secret wajib).

### Supabase Storage (server-side)

1. Project Supabase → **Storage**, buat bucket (mis. `transaction_receipts`), set public/private sesuai kebutuhan.
2. Salin ke env:

```bash
STORAGE_PROVIDER=supabase
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_STORAGE_BUCKET=transaction_receipts
```

3. Di UI: provider `supabase`, isi `bucket`. Akses lewat service role di server — **jangan pernah** menaruh service role key di frontend.

Upload diproksi server: `POST /api/storage/upload` → adapter `put()`. Jika `R2_PUBLIC_URL`/`VERCEL_BLOB_BASE_URL` kosong, URL file memakai `/api/storage/proxy?ref=...` (auth-required). Hapus file: `DELETE /api/storage/delete` (admin/super_admin).

---

## 9. Web installer

Alur (`/install`, [`src/pages/InstallerPage.jsx`](src/pages/InstallerPage.jsx) + [`server/routes/installRoutes.js`](server/routes/installRoutes.js)):

1. **DB** — `POST /api/install/step/db`: uji koneksi PostgreSQL (DSN atau form), validasi koneksi.
2. **Migrate** — `POST /api/install/step/migrate`: jalankan migrasi [`001_core.sql`](server/migrations/self_host/001_core.sql), [`002_schema.sql`](server/migrations/self_host/002_schema.sql), [`003_rpc.sql`](server/migrations/self_host/003_rpc.sql); track di `schema_migrations`.
3. **Admin** — `POST /api/install/step/admin`: buat user pertama (`super_admin`), bcrypt cost 12.
4. **Storage** — `POST /api/install/step/storage`: pilih provider + field non-secret.
5. **Finish** — `POST /api/install/finish`: tulis `.env` (secret), `config.json` (non-secret), `installed.lock`; redirect `/`.

Guard keamanan: **semua POST installer ditolak `403 { error: 'Sudah terpasang' }`** begitu `server/config/installed.lock` ada.

### Re-install bila gagal

Hapus lock dan file config, lalu buka ulang `/install`:

```bash
rm -f server/config/installed.lock server/config/config.json server/config/.env
# atau dari panel file manager
```

> Catatan: `.env` ditulis dengan flag `wx` — jika file sudah ada, step Finish menolak. Hapus dulu untuk instalasi ulang bersih.

---

## 10. Keamanan

- **Cookie sesi** `kr_session`: `httpOnly`, `SameSite=Strict`, 7 hari — tidak terbaca JavaScript ([`server/auth.js`](server/auth.js)).
- **CSRF**: semua request non-GET wajib header `X-Requested-With: XMLHttpRequest` — divalidasi [`csrfGuard`](server/auth.js), dikirim tiap request oleh [`apiClient.js`](src/lib/apiClient.js).
- **Password**: bcryptjs cost 12; `JWT_SECRET` wajib ≥ 32 karakter (validasi di [`server/config.js`](server/config.js)); token JWT 7d.
- **Secret**: hanya di env server, tidak pernah di UI/`config.json` (K4).
- **Whitelist**: tabel CRUD (23) dan RPC (8) dibatasi di [`dbRoutes.js`](server/routes/dbRoutes.js) / [`rpcBridge.js`](server/routes/rpcBridge.js); prepared statements, pagination `LIMIT/OFFSET` maks 200.
- **HTTPS**: aktifkan SSL di reverse proxy (aaPanel/cPanel/nginx), set `COOKIE_SECURE=true`.
- **Backup PostgreSQL** terjadwal (mis. `pg_dump` via cron) — data finansial tidak boleh hilang.
- Header `x-powered-by` dimatikan; `express.json` dibatasi `BODY_LIMIT`.

---

## 11. Migrasi data dari Supabase lama

### 11.1 Database

1. **Ekspor tabel inti** dari Supabase (SQL Editor → query → *Download as CSV/SQL*), atau `pg_dump` dari project Supabase. Tabel yang dipakai aplikasi (contoh): `users`, `user_roles`, tabel transaksi/tagihan/kamar/aktivitas sesuai skema [`002_schema.sql`](server/migrations/self_host/002_schema.sql).
2. **Import** ke PostgreSQL baru setelah migrasi berjalan:

```bash
psql "$DATABASE_URL" -f dump.sql
```

Perhatikan: self-host memakai tabel `users` lokal dengan kolom `email`, `password_hash`, `full_name`. Struktur **tidak sama** dengan `auth.users` Supabase.

### 11.2 Auth users

`auth.users` Supabase → tabel `users` lokal. Hash password:

- **Opsi A — buat ulang password**: buat user baru di aplikasi (atau lewat wizard), kirimkan password baru. Paling aman dan pasti kompatibel.
- **Opsi B — salin hash**: bila `encrypted_password` Supabase berformat bcrypt (`$2a$`/`$2b$`), nilai bisa disalin ke kolom `password_hash` (bcryptjs membaca format bcrypt). **Cek dulu formatnya**:

```sql
SELECT email, left(encrypted_password, 4) AS prefix FROM auth.users;
```

Prefix selain `$2a$`/`$2b$` (mis. argon2/scrypt) **tidak kompatibel** — pakai Opsi A. Salin dengan:

```sql
INSERT INTO users (email, password_hash, full_name)
SELECT email, encrypted_password, raw_user_meta_data->>'full_name'
FROM auth.users
ON CONFLICT (email) DO NOTHING;
```

Lalu beri role (mis. semua → `karyawan`; admin lama → `admin`/`super_admin`) di `user_roles` — sesuaikan dengan struktur role yang dipakai aplikasi Anda.

### 11.3 Storage objects

1. Unduh file dari Supabase Storage (dashboard Storage → tiap bucket → download), atau via CLI.
2. Upload kembali lewat aplikasi (upload ulang di transaksi lama) atau langsung ke bucket R2/Blob dengan key sesuai skema `folder/nama-file` yang dipakai adapter.

> Tidak ada tooling otomatis bawaan untuk migrasi ini; kerjakan per bucket dan verifikasi sample file via `/api/storage/proxy`.

---

## 12. Dukungan mode Vercel lama

Mode lama **tidak dihapus**:

- `VITE_SELF_HOST` **tidak diset** (`!= 'true'`) saat build → frontend memakai supabase-js + Vercel Blob seperti biasa via [`customSupabaseClient.js`](src/lib/customSupabaseClient.js).
- File [`api/*`](api) (Vercel Functions: `upload.js`, `blob.js`, `send-push.js`, dll.) tetap ada.
- Backend Express self-host tidak aktif di Vercel; keduanya berjalan paralel tanpa konflik.

Satu repo, dua mode, dipilih saat build.

---

## 13. Pengembangan lokal

```bash
# terminal 1 — frontend (vite dev server)
npm run dev

# terminal 2 — backend Express (auto-migrate saat boot)
npm run server:dev
```

Setup:

1. Buat PostgreSQL lokal, buat DB (mis. `kakarama`).
2. Salin [`server/.env.example`](server/.env.example) → `.env`, isi `DATABASE_URL` + `JWT_SECRET` (≥32 char).
3. `npm run server` — migrasi otomatis; lalu buka `/install` untuk setup, atau `npm run migrate` untuk migrasi manual.
4. Untuk frontend di mode self-host saat dev: set `VITE_SELF_HOST=true` dan `VITE_API_BASE_URL=http://localhost:3000` di env build.

Tests: `npm test` (61 test), `npm run lint`.

---

## 14. FAQ / troubleshooting

**Port bentrok (EADDRINUSE)**
Ubah `PORT` di `.env`, lalu sesuaikan `proxy_pass` nginx.

**Instalasi ulang gagal di step Finish**
Hapus `server/config/installed.lock`, `server/config/config.json`, `server/config/.env` — lihat [Bagian 9](#9-web-installer).

**Test koneksi storage gagal**
- R2: cek `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT` benar, token punya permission Object Read & Write, bucket ada.
- Vercel Blob: `BLOB_READ_WRITE_TOKEN` valid dan tidak kedaluwarsa.
- Supabase: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` benar, bucket ada.
- Seluruh endpoint `/api/storage/test` butuh login `super_admin`.

**Build gagal**
- Pastikan `npm install` bersih; versi Node 20.x (lihat [`.nvmrc`](.nvmrc)).
- Error saat build frontend: cek pesan Vite; `vitest` dipatok `^2.1.9` untuk kompatibilitas vite 4.

**401 terus-menerus**
Cookie `kr_session` tidak terkirim: pastikan `COOKIE_SECURE=false` saat http (belum HTTPS), dan reverse proxy tidak memotong header Cookie.

**Halaman non-API 404**
`dist/` belum dibuild — jalankan `VITE_SELF_HOST=true npm run build`, restart PM2.

**File gagal upload / URL file error**
Cek `client_max_body_size` nginx (≥ `BODY_LIMIT`), dan limit multer 10 MB per file di [`storageRoutes.js`](server/routes/storageRoutes.js).
