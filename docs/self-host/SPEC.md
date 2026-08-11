# Kakarama Room — Self-Host Edition (Spesifikasi)

> Dokumen induk. Narasi bahasa Indonesia, kode/pseudocode English.
> Detail pseudocode per modul: `phase_01`…`phase_04` di direktori ini.
> Detail diagram arsitektur: serahkan ke mode **architect** (lihat §4.4).

---

## 1. Ringkasan

Versi self-host mengganti dua dependensi berbayar (Vercel serverless + Supabase hosting)
dengan satu server Node.js (Express) + PostgreSQL biasa. Frontend React **tidak ditulis ulang**:
komponen UI dipertahankan. Yang diganti hanya lapisan akses data, auth context, storage upload.

### 1.1 Target pengguna
Admin penginapan/apartemen yang muak biaya Vercel + Supabase. Lingkungan hosting umum:
aaPanel (BT Panel), cPanel, VPS Nginx, PassNode.

### 1.2 Prinsip
- Satu proses server: serve static `dist/` + REST API + proxy storage. Cukup untuk aaPanel/PM2.
- Tanpa hardcoded secret. Publik via `VITE_*` (hanya base URL). Secret via env server / file `.env`.
- Adaptor data klien `supabase-js` → klien API sendiri, bentuk return `{ data, error }` dipertahankan
  supaya ~40 komponen yang memakai `.rpc()` / `.from()` tidak berubah.
- RPC SQL (~30 fungsi) tetap di PostgreSQL sebagai fungsi SQL biasa; keamanan dipindah dari RLS
  ke middleware API (role check). RLS/auth-schema dihapus dari migrasi.
- Realtime `postgres_changes` diganti **polling interval** (YAGNI terhadap WebSocket; jalur naik
  SSE tercatat di risiko R3).

### 1.3 Pemetaan arsitektur sekarang → target

| Saat ini (Supabase) | Target (self-host) |
|---|---|
| `@supabase/supabase-js` di ~40 file | `src/lib/apiClient.js` (query builder minimal, bentuk `{ data, error }` sama) |
| `supabase.rpc(name, params)` | `POST /api/v1/rpc/:name` |
| `supabase.from(t).select/eq/gte/lte/in/or/order/range/upsert` | `GET/POST/PATCH/DELETE /api/v1/db/:table` |
| `supabase.auth.*` | `POST /api/v1/auth/*` (JWT sendiri, httpOnly cookie) |
| `supabase.storage.from(bucket).upload` | `POST /api/v1/upload` → storage adapter |
| `postgres_changes` realtime | polling `GET /api/v1/changes?since=...` (15–30 dtk) |
| `auth.users` + RLS | tabel `users` lokal + penegakan role di middleware |
| Vercel serverless `api/upload.js`, `api/blob.js` | route Express `/api/v1/upload`, `/api/v1/storage/proxy` |
| `system_settings` (JSONB) | tetap, + `storage_provider` & konfigurasi non-secret provider |

---

## 2. Spesifikasi Fungsional

### F1. Web Installer (`/install`)
- Halaman pertama kali: muncul bila server belum dikonfigurasi (tidak ada `server/config/installed.lock`).
- Stepper: (1) koneksi PostgreSQL, (2) skema + migrasi, (3) admin pertama, (4) storage provider, (5) base URL + ringkasan.
- Validasi koneksi: host/port/db/user/password, tes `SELECT 1`, deteksi apakah DB sudah berisi skema
  (tabel `users` / `schema_migrations` ada).
- Jalankan migrasi SQL teradaptasi secara berurutan + catat di `schema_migrations`.
- Buat admin pertama (email + password, role `super_admin`).
- Simpan konfigurasi: tulis `.env` (secret) + `config.json` (non-secret), buat `installed.lock`, kunci installer.
- Setelah sukses: redirect ke `/` dan login.

### F2. Konfigurasi Storage (GlobalSettings)
- Pemilih provider: `r2` | `vercel_blob` | `supabase`.
- Tersimpan di `system_settings` key `storage_provider`.
- Field non-secret per provider disimpan di `system_settings`:
  - r2: `r2_bucket`, `r2_endpoint` (region URL), `r2_public_url` (opsional)
  - supabase: `supabase_storage_bucket`
  - vercel_blob: tidak ada field non-secret (token saja)
- Field secret **tidak** disimpan via UI; dimasukkan admin langsung ke `.env` server, atau via
  panel installer "Storage credentials" bila fitur DB-encrypted aktif (lihat keputusan K4).
- Tombol "Test connection": panggil `POST /api/v1/storage/test` → adapter `ping()`.

### F3. Backend API
- Auth: `register` (super_admin-only), `login`, `logout`, `me`, `update_profile`, `change_password`.
- CRUD generik: `GET/POST/PATCH/DELETE /api/v1/db/:table` dengan filter/order/range (pagination server-side, mematuhi aturan `AGENTS.md`).
- RPC bridge: `POST /api/v1/rpc/:name` → `SELECT * FROM fn(params)` dengan whitelist nama fungsi.
- Storage: `POST /api/v1/upload`, `GET /api/v1/storage/proxy` (private blob), `POST /api/v1/storage/test`, `DELETE /api/v1/storage`.
- Notifikasi: `POST /api/v1/push/subscribe`, endpoint send push (web-push, dep sudah ada).
- Polling: `GET /api/v1/changes?since=<ISO>&tables=a,b` → daftar row berubah per tabel.

### F4. Frontend (perubahan minimal)
- `src/lib/customSupabaseClient.js` diganti implementasi adapter API (impor asli tetap `supabase` agar
  komponen tidak diedit).
- `SupabaseAuthContext` tetap; panggilan `.auth.*` dialihkan ke adapter.
- `vercelBlobUpload.js` / `ManajemenDeposit` (storage upload) → `src/lib/storageUpload.js` memakai `/api/v1/upload`.
- `useRpcQuery`, `usePaginatedQuery`, `useCategorySummary`: **tidak berubah** — hanya impl `supabase.rpc`
  di balik adapter.
- GlobalSettings: tambah section "Penyimpanan File" (F2).

### F5. Migrasi data dari Supabase
- CLI `npm run db:dump` (server-side): ekspor tabel inti ke SQL/CSV dari Supabase, impor ke Postgres target.
- Utilitas dokumenter di README-Self-Host.md (bukan fitur UI).

---

## 3. Spesifikasi Non-Fungsional

| ID | Kebutuhan |
|---|---|
| N1 | **Keamanan secret**: tidak ada kredensial di bundle klien; secret hanya di server env; backup DB tidak bocorkan secret (kecuali mode K4 opsional). |
| N2 | **Auth**: bcrypt (cost 12) untuk hash; JWT 7 hari; cookie `HttpOnly` + `SameSite=Strict`; CSRF dilindungi header `X-Requested-With`; rate-limit login (5 gagal / 15 mnt / IP). |
| N3 | **Performa data**: semua query daftar pakai pagination + index `created_at`/`updated_at`; agregat lewat SQL (RPC) bukan JS client. |
| N4 | **Idempotensi migrasi**: setiap file SQL dijalankan sekali (versi tercatat); file dirancang `IF NOT EXISTS`. |
| N5 | **Single-process**: server Express serve static + API + proxy storage; cocok PM2/PassNode. |
| N6 | **Portabilitas hosting**: tanpa native build (pilih `bcryptjs`; S3 via `@aws-sdk/client-s3`). |
| N7 | **Testable**: modul inti (storage adapter, auth, installer validator, query builder) punya test TDD (lihat §8). |
| N8 | **Batas file**: setiap file < 500 baris; kompleksitas dipecah per modul. |
| N9 | **Mode production**: `maintenance_mode` dari `system_settings` tetap dihormati middleware. |

---

## 4. Arsitektur Target

### 4.1 Komponen
```
server/                          # Node 18+ (ESM)
├── index.js                     # bootstrap: load config → express app → listen
├── app.js                       # middleware, route mounting, error handler
├── config/
│   ├── env.js                   # baca .env / process.env, validasi wajib
│   ├── config.json              # non-secret: baseUrl, provider, dsb (dibuat installer)
│   └── installed.lock           # penanda terpasang
├── db/
│   ├── pool.js                  # pg Pool
│   ├── migrate.js               # runner migrasi (schema_migrations)
│   └── migrations/              # SQL teradaptasi (tanpa RLS/auth.*)
├── auth/
│   ├── password.js              # bcrypt hash/verify
│   ├── jwt.js                   # sign/verify, cookie helpers
│   ├── middleware.js            # requireAuth, requireRole(...), CSRF guard
│   └── routes.js                # /api/v1/auth/*
├── storage/
│   ├── adapter.js               # factory: getStorageAdapter(provider)
│   ├── r2.js                    # @aws-sdk/client-s3 (R2 S3-compatible)
│   ├── vercelBlob.js            # @vercel/blob
│   ├── supabase.js              # @supabase/supabase-js (server, service role)
│   └── routes.js                # upload / proxy / test / delete
├── api/
│   ├── dbRoutes.js              # CRUD generik + pagination
│   ├── rpcBridge.js             # whitelist + eksekusi fungsi SQL
│   ├── changes.js               # polling watermark
│   ├── push.js                  # web-push
│   └── settings.js              # baca/tulis system_settings (role-gated)
├── installer/
│   ├── routes.js                # GET/POST /install
│   ├── validator.js             # tes koneksi PG
│   ├── migration.js             # jalankan migrasi saat install
│   └── bootstrap.js             # tulis .env, config.json, lock
└── test/                        # TDD anchors (§8)

src/                             # frontend (perubahan minimal)
├── lib/
│   ├── apiClient.js             # adapter query builder → REST (return {data,error})
│   ├── customSupabaseClient.js  # re-export dari apiClient (impor lama tetap jalan)
│   ├── authClient.js            # login/logout/me via fetch
│   └── storageUpload.js         # upload via /api/v1/upload
└── components/GlobalSettings.jsx# + section storage provider (F2)
```

### 4.2 Alur data
1. **Query**: komponen → `supabase.from(t).select(...)` (adapter) → `GET /api/v1/db/:t?filter&order&range` → middleware auth → `pg` query → `{ data, error }`.
2. **RPC**: komponen → `supabase.rpc(n, p)` → `POST /api/v1/rpc/:n` → whitelist → `SELECT * FROM n(p)` → `{ data, error }`.
3. **Upload**: komponen → `storageUpload(file)` → `POST /api/v1/upload` (raw body, header `x-file-name`, `x-folder`) → adapter.put → return `{ url }`.
4. **Tampil private blob**: `resolveStorageUrl()` (lama) → proxy `/api/v1/storage/proxy?ref=<opaque>` → adapter.get → stream.
5. **Realtime**: interval `changes.js` → `GET /api/v1/changes?since=` → diff `updated_at`/`created_at` → refresh state hook yang sama.

### 4.3 Batas layanan
- Server tidak pernah mengekspos SQL mentah ke klien; hanya whitelist RPC + tabel yang diizinkan.
- Secret storage tidak pernah dikirim ke browser; adapter berjalan hanya di server.
- Polling membawa watermark `since`; klien menyimpan `lastPollAt` di memori (session).

### 4.4 Diagram
Diagram detail (sequence, deployment, component): dibahas mode **architect** berbasis struktur §4.1
dan file `docs/self-host/phase_01..04.md`.

---

## 5. Keputusan Arsitektur (ADR ringkas)

| ID | Keputusan | Alasan |
|---|---|---|
| K1 | **Express 4** (bukan Fastify) | Maturitas di aaPanel/cPanel/PassNode, ekosistem middleware, dokumentasi luas. |
| K2 | **JWT stateless + httpOnly cookie**, bcryptjs | Tanpa native build (N6); cookie meredam XSS token theft; bcryptjs murni JS. Tanpa refresh rotation v1 — `ponytail:` tambah bila token 7 hari dirasa pendek. |
| K3 | **Polling 15–30 dtk** ganti `postgres_changes` | YAGNI. Tidak butuh pub/sub infra. Naik ke SSE bila latensi dirasa. |
| K4 | **Secret di env**; opsi **DB terenkripsi AES-256-GCM** bila env sulit (aaPanel) | Kunci enkripsi tetap di `.env` (server-side). UI hanya simpan non-secret. Trade-off: secret ikut backup DB bila mode ini aktif — didokumentasikan. Default: env. |
| K5 | **Migrasi SQL ditulis ulang manual** (bukan auto-rewrite) | Transformasi RLS/auth.* bukan mekanis 1:1; tinjauan manual lebih aman. Runner otomatis tetap dipakai. |
| K6 | **Adapter klien menggantikan supabase-js** di balik impor lama | ~40 komponen tidak diedit; bentuk `{ data, error }` dipertahankan. |
| K7 | **Keamanan di middleware API, bukan RLS** | Self-host satu tenant; RLS kompleks tanpa auth schema. |
| K8 | **`@aws-sdk/client-s3` ditambahkan** untuk R2 | R2 tak punya SDK resmi; S3-compatible. `@vercel/blob` & `@supabase/supabase-js` sudah ada, dipakai di server. |
| K9 | **Storage proxy URL opaque** (`?ref=`) | Sembunyikan path/secret upstream dari klien. |

---

## 6. Risiko

| ID | Risiko | Mitigasi |
|---|---|---|
| R1 | Adaptasi SQL salah (fungsi pakai `auth.uid()`, `SECURITY DEFINER`, `auth.users`) | Migrasi manual (K5), test smoke pasca-migrasi, daftar fungsi yang butuh revisi di phase_02. |
| R2 | Perilaku `.or()` filter supabase kompleks (KetersediaanKamar, NotificationsInbox) | Query builder adapter mendukung op `and/or`; TDD anchor A5 menjamin serialisasi. |
| R3 | Latensi polling / beban query | Interval adaptif (15s aktif, 60s idle tab via `usePageVisibility` — sudah ada); query pakai index `updated_at`. |
| R4 | Secret bocor via bundle | Audit build: grep `service_role\|access_key\|BLOB_READ_WRITE_TOKEN` di `dist/` pada CI. |
| R5 | Migration non-deterministik (baris `timezone('utc')`, tipe `uuid` gen) | Runner + `schema_migrations`; ekstensi `pgcrypto` diinstall di migrasi 001. |
| R6 | JWT secret default lemah | Installer generate 64-byte random; middleware tolak secret < 32 byte. |

---

## 7. Permukaan supabase-js yang harus ditiru adapter klien

Dari scan `src/` (114 pemakaian di ~40 file):

| Metode | Pemakaian contoh |
|---|---|
| `.rpc(name, params)` | `useRpcQuery`, `useCategorySummary`, `pay_fee_items`, `pay_tagihan_bulanan`, `admin_*`, `log_activity`, `delete_transaction_cascade` |
| `.from(t).select(cols, { count, head })` | seluruh CRUD, count exact |
| `.eq/.gte/.lt/.in/.or/.is/.not/.order/.range/.limit` | `usePaginatedQuery`, KetersediaanKamar, NotificationsInbox |
| `.insert/.upsert/.update/.delete` | FormTransaksiModern, GlobalSettings, LocationRoomManager |
| `.storage.from('transaction_receipts').upload` | ManajemenDeposit |
| `.auth.getSession/signInWithPassword/signUp/signOut/onAuthStateChange` | SupabaseAuthContext |

Spesifikasi bentuk tiap metode: `phase_04_client_adapter.md`.

---

## 8. TDD Anchors (harus lulus)

| # | Nama file test | Properti/perilaku |
|---|---|---|
| A1 | `server/storage/adapter.test.js` | Factory `getStorageAdapter({provider})` mengembalikan impl yang benar; provider tak dikenal → error. |
| A2 | `server/storage/r2.test.js` | `put/get/delete` memanggil S3 client dengan bucket+key yang diharapkan; error upstream diteruskan. |
| A3 | `server/auth/auth.test.js` | Login benar → JWT valid + payload role; password salah → 401; hash bcrypt verifikasi. |
| A4 | `server/installer/validator.test.js` | DSN valid/salah, PG unreachable, skema sudah ada → status yang tepat tanpa mengeksekusi SQL berbahaya. |
| A5 | `src/lib/apiClient.test.js` | Untuk kombinasi filter (`eq/gte/lte/in/or`), order, range → URL + query string yang benar; return shape `{ data, error }`. |

Detail pseudocode tiap anchor + skenario: `phase_01`–`phase_04` (bagian "TDD").

---

## 9. Peta File Spek

| File | Isi |
|---|---|
| `docs/self-host/SPEC.md` | Dokumen ini |
| `docs/self-host/phase_01_storage_adapter.md` | Interface adapter, impl R2/Vercel/Supabase, route upload/proxy, A1–A2 |
| `docs/self-host/phase_02_backend_core_api.md` | Auth, db CRUD, rpc bridge, changes polling, migrasi, A3 |
| `docs/self-host/phase_03_installer.md` | Flow states, validator, bootstrap, A4 |
| `docs/self-host/phase_04_client_adapter.md` | apiClient/authClient/storageUpload, GlobalSettings storage section, A5 |
| `README-Self-Host.md` (root) | Panduan deploy (dibuat setelah implementasi oleh docs-writer) |

Urutan implementasi (prioritas dari task): storage abstraction + UI settings → installer → backend core
(auth, CRUD, migrasi) → adapter RPC/klien. Lihat phase files untuk TDD per langkah.
