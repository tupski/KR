# 🏗️ Rencana Migrasi — Kakarama Room

> **Branch:** `new-local` | **Terakhir diperbarui:** Agustus 2026  
> **Status:** 📋 Draft — Belum dimulai

---

## 📑 Daftar Isi

1. [Overview](#1-overview)
2. [Inventaris Codebase Saat Ini](#2-inventaris-codebase-saat-ini)
3. [Arsitektur Target](#3-arsitektur-target)
4. [Peta Migrasi Komponen](#4-peta-migrasi-komponen)
5. [Tantangan & Solusi](#5-tantangan--solusi)
6. [Fase Implementasi →](MIGRATION_PLAN_PART2.md#6-fase-implementasi)
7. [Dependencies →](MIGRATION_PLAN_PART2.md#7-dependencies)
8. [Environment Variables Target →](MIGRATION_PLAN_PART2.md#8-environment-variables-target)
9. [Catatan Penting →](MIGRATION_PLAN_PART2.md#9-catatan-penting)

---

## 1. Overview

### Tujuan Migrasi

Migrasi ini bertujuan membebaskan **Kakarama Room** dari ketergantungan layanan cloud pihak ketiga (Supabase dan Vercel) agar aplikasi dapat berjalan sepenuhnya di lingkungan lokal menggunakan **FlyEnv** (PostgreSQL + Node.js v24.15.0), sekaligus merapikan struktur codebase agar lebih mudah di-maintain jangka panjang.

**Target utama:**
- ✅ Berjalan full local tanpa koneksi internet ke Supabase/Vercel
- ✅ Hapus ketergantungan pada Vercel Serverless Functions dan Vercel Blob
- ✅ Hapus ketergantungan pada Supabase Auth, RLS, dan Realtime
- ✅ Storage pluggable: local disk, Cloudflare R2, atau S3-compatible
- ✅ Struktur monorepo yang rapi dan maintainable
- ✅ Stack tetap: React + Vite + PostgreSQL + Node.js

---

### Perbandingan Stack Lama vs Baru

| Komponen | Stack Lama | Stack Baru |
|---|---|---|
| **Frontend** | React 18 + Vite + TailwindCSS + shadcn/ui | React 18 + Vite + TailwindCSS + shadcn/ui _(tetap)_ |
| **Auth** | Supabase Auth (JWT managed) | Custom JWT (`jsonwebtoken` + `bcryptjs`) |
| **Database** | Supabase PostgreSQL + RLS | PostgreSQL lokal via `pg` connection pool |
| **Database Client** | `@supabase/supabase-js` | REST API + `fetch` client custom |
| **Realtime** | Supabase Realtime Channels | Polling ringan tiap 30 detik |
| **Storage** | Vercel Blob (private + public) | Pluggable: local disk / R2 / S3 |
| **Backend API** | Vercel Serverless Functions (`/api/`) | Express.js server (`apps/server/`) |
| **Cron Jobs** | Vercel Cron (via `vercel.json`) | `node-cron` di dalam Express server |
| **Hosting** | Vercel | Lokal (FlyEnv) / VPS bebas |
| **Push Notif** | `web-push` via Vercel Functions | `web-push` via Express endpoint |

---

## 2. Inventaris Codebase Saat Ini

### 2a. Ketergantungan Kritis pada Supabase

| File | Ketergantungan |
|---|---|
| [`src/lib/customSupabaseClient.js`](../src/lib/customSupabaseClient.js) | Supabase client singleton, dipakai di seluruh app |
| [`src/contexts/SupabaseAuthContext.jsx`](../src/contexts/SupabaseAuthContext.jsx) | Auth state, session, role, realtime channel (217 baris) |
| [`src/lib/pushClient.js`](../src/lib/pushClient.js) | Simpan push subscription ke tabel Supabase |
| [`src/utils/supabase.ts`](../src/utils/supabase.ts) | Typed Supabase client (TypeScript) |
| [`src/hooks/useRpcQuery.js`](../src/hooks/useRpcQuery.js) | Generic RPC caller via `supabase.rpc()` (228 baris) |
| Hampir semua komponen | Memanggil `supabase.from()` atau `supabase.rpc()` langsung |

### 2b. Ketergantungan Kritis pada Vercel

| File | Ketergantungan |
|---|---|
| [`api/upload.js`](../api/upload.js) | Upload file ke Vercel Blob |
| [`api/blob.js`](../api/blob.js) | Proxy server untuk akses private blob |
| [`api/cleanup-blobs.js`](../api/cleanup-blobs.js) | Cleanup blob lama (dijalankan via Vercel Cron) |
| [`api/generate-notifications.js`](../api/generate-notifications.js) | Generate notifikasi harian (522 baris, Vercel Cron) |
| [`api/send-push.js`](../api/send-push.js) | Kirim web push notification |
| [`src/lib/storageUrl.js`](../src/lib/storageUrl.js) | Resolve Vercel Blob private URL ke proxy |
| [`src/lib/vercelBlobUpload.js`](../src/lib/vercelBlobUpload.js) | Upload helper ke `/api/upload` |

### 2c. Daftar Tabel Database (19 Tabel)

| # | Nama Tabel | Deskripsi |
|---|---|---|
| 1 | `transactions` | Transaksi sewa kamar (core), deposit, marketing fee |
| 2 | `pengeluaran` | Pengeluaran operasional |
| 3 | `user_profiles` | Profil user (full_name, avatar, gender) |
| 4 | `user_roles` | Role: karyawan, admin, super_admin |
| 5 | `user_location_assignments` | Penugasan karyawan ke lokasi |
| 6 | `lokasi_apartemen` | Master data lokasi/properti |
| 7 | `notifications` | Sistem notifikasi |
| 8 | `notification_hidden` | Hide notifikasi per-user |
| 9 | `notification_preferences` | Preferensi push per-user |
| 10 | `push_subscriptions` | Web push subscriptions |
| 11 | `activity_logs` | Log aktivitas pengguna |
| 12 | `system_settings` | Konfigurasi aplikasi |
| 13 | `announcements` | Pengumuman dari admin |
| 14 | `tagihan_fee_lunas` | Pembayaran fee marketing (receipt header) |
| 15 | `tagihan_fee_lunas_items` | Item detail pembayaran fee marketing |
| 16 | `tagihan_bulanan` | Tagihan bulanan unit |
| 17 | `deposit_returns` | Pengembalian deposit |
| 18 | `expense_categories` | Kategori pengeluaran |
| 19 | `recurring_unit_bills` | Tagihan berulang per-unit |

> Sumber migrasi: [`supabase/migrations/`](../supabase/migrations/)

### 2d. Daftar RPC / SQL Functions

| Function | Keterangan |
|---|---|
| `pay_fee_items` | Atomic: insert paid items + pengeluaran |
| `pay_tagihan_bulanan` | Atomic: update tagihan + pengeluaran |
| `admin_update_user` | Update data user oleh admin |
| `admin_sign_out_user` | Paksa logout user tertentu |
| `sign_out_own_devices` | Logout semua device sendiri |
| `get_category_summary` | Ringkasan per kategori pengeluaran |
| `get_analytics_*` | Banyak fungsi untuk dashboard analytics |
| `log_activity` | Catat log aktivitas user |

⚠️ **Semua RPC menggunakan `auth.uid()`** — terikat langsung ke Supabase Auth internal. Harus dikonversi ke parameter eksplisit.

### 2e. Masalah Struktur yang Perlu Diperbaiki

| Masalah | Lokasi | Solusi Target |
|---|---|---|
| PIN hardcode `212198` | [`src/App.jsx`](../src/App.jsx) | Pindah ke env/database |
| Typed client TypeScript bercampur dengan JS | [`src/utils/supabase.ts`](../src/utils/supabase.ts) | Ganti dengan typed REST client |
| Script admin standalone tanpa auth | [`supabase/create-staff-account.js`](../supabase/create-staff-account.js) | Konversi ke CLI script atau API endpoint |
| Script super admin standalone | [`supabase/create-super-admin.js`](../supabase/create-super-admin.js) | Konversi ke CLI script atau API endpoint |
| API functions tersebar di root `/api/` | [`api/`](../api/) | Pindah ke `apps/server/src/modules/` |
| Tidak ada separation frontend/backend | Root project | Monorepo `apps/web/` + `apps/server/` |

---

## 3. Arsitektur Target

```
KR/
├── apps/
│   ├── web/                          ← Frontend (React + Vite)
│   │   ├── src/
│   │   │   ├── api/                  ← API client layer
│   │   │   │   ├── client.js         ← Base fetch client dengan auth header
│   │   │   │   ├── auth.api.js
│   │   │   │   ├── transactions.api.js
│   │   │   │   ├── notifications.api.js
│   │   │   │   ├── storage.api.js
│   │   │   │   └── analytics.api.js
│   │   │   ├── components/
│   │   │   ├── contexts/
│   │   │   │   └── AuthContext.jsx   ← Ganti SupabaseAuthContext
│   │   │   ├── hooks/
│   │   │   ├── lib/                  ← Pure utilities only
│   │   │   ├── pages/
│   │   │   └── utils/
│   │   └── package.json
│   │
│   └── server/                       ← Backend Express.js (BARU)
│       ├── src/
│       │   ├── config/
│       │   │   ├── database.js       ← PostgreSQL connection pool
│       │   │   ├── env.js            ← Env validation (Zod)
│       │   │   └── storage.js        ← Storage provider factory
│       │   ├── middleware/
│       │   │   ├── auth.middleware.js
│       │   │   ├── cors.middleware.js
│       │   │   └── errorHandler.js
│       │   ├── modules/
│       │   │   ├── auth/
│       │   │   ├── users/
│       │   │   ├── transactions/
│       │   │   ├── notifications/
│       │   │   ├── storage/
│       │   │   │   └── providers/
│       │   │   │       ├── local.provider.js
│       │   │   │       ├── r2.provider.js
│       │   │   │       └── s3.provider.js
│       │   │   ├── analytics/
│       │   │   └── settings/
│       │   ├── jobs/
│       │   │   ├── scheduler.js
│       │   │   ├── generateNotifications.job.js
│       │   │   └── cleanupStorage.job.js
│       │   └── app.js
│       └── package.json
│
├── database/
│   ├── migrations/
│   │   ├── 001_core_tables.sql
│   │   ├── 002_auth_tables.sql       ← Custom auth (tanpa Supabase)
│   │   ├── 003_notifications.sql
│   │   ├── 004_finance_rpcs.sql
│   │   ├── 005_analytics_rpcs.sql
│   │   ├── 006_activity_logs.sql
│   │   ├── 007_system_settings.sql
│   │   └── 008_recurring_bills.sql
│   └── seeds/
│
├── storage/                          ← Local storage volume (gitignored)
│   ├── ktp-images/
│   └── transfer-proofs/
│
└── .env.example
```

---

## 4. Peta Migrasi Komponen

### 4a. Auth Layer

| Kode Lama | Kode Baru | Catatan |
|---|---|---|
| [`src/lib/customSupabaseClient.js`](../src/lib/customSupabaseClient.js) | `apps/web/src/api/client.js` | Base fetch client dengan auth header |
| [`src/contexts/SupabaseAuthContext.jsx`](../src/contexts/SupabaseAuthContext.jsx) | `apps/web/src/contexts/AuthContext.jsx` | Interface `useAuth()` identik |
| `supabase.auth.signInWithPassword()` | `POST /api/auth/login` | — |
| `supabase.auth.signOut()` | `POST /api/auth/logout` | — |
| `supabase.auth.getSession()` | `GET /api/auth/session` | — |
| `supabase.auth.onAuthStateChange()` | Polling `GET /api/users/me/role` tiap 30 detik | Frekuensi role change sangat rendah |
| `auth.uid()` di SQL | `p_user_id uuid` parameter eksplisit | Semua RPC wajib diupdate |
| `auth.sessions` delete (cascade) | Custom tabel `sessions` | Dengan `refresh_token`, `device_info`, `expires_at` |

### 4b. Storage Layer

| Kode Lama | Kode Baru | Catatan |
|---|---|---|
| [`src/lib/vercelBlobUpload.js`](../src/lib/vercelBlobUpload.js) | `apps/web/src/api/storage.api.js` | Upload via REST |
| [`src/lib/storageUrl.js`](../src/lib/storageUrl.js) | Updated untuk multi-provider | Resolve URL sesuai provider aktif |
| [`api/upload.js`](../api/upload.js) | `apps/server/src/modules/storage/` | Handler upload dengan multer |
| [`api/blob.js`](../api/blob.js) | `GET /api/storage/file/:pathname` | Proxy file private |
| [`api/cleanup-blobs.js`](../api/cleanup-blobs.js) | `apps/server/src/jobs/cleanupStorage.job.js` | Cron via node-cron |
| `@vercel/blob` package | `multer` + provider abstraction | Pluggable: local / R2 / S3 |

### 4c. Database Layer

| Pola Lama | Pola Baru | Catatan |
|---|---|---|
| `supabase.from('table').select()` | `GET /api/[module]` (REST) | Semua query via Express router |
| `supabase.rpc('function')` | `POST /api/analytics/rpc` atau endpoint spesifik | RPC tetap di PostgreSQL |
| RLS policies | Express middleware + service checks | Logika auth di application layer |
| `supabase.channel().on()` | Polling `GET /api/users/me/role` | Untuk sinkronisasi role |
| [`supabase/migrations/`](../supabase/migrations/) | `database/migrations/` | Format SQL tetap, struktur lebih rapi |

### 4d. API Functions (Vercel → Express)

| File Lama | File Baru | Catatan |
|---|---|---|
| [`api/generate-notifications.js`](../api/generate-notifications.js) | `apps/server/src/jobs/generateNotifications.job.js` | 522 baris, perlu refactor jadi modular |
| [`api/send-push.js`](../api/send-push.js) | `apps/server/src/modules/notifications/push.service.js` | — |
| [`api/cleanup-blobs.js`](../api/cleanup-blobs.js) | `apps/server/src/jobs/cleanupStorage.job.js` | — |

---

## 5. Tantangan & Solusi

### 🔴 1. `auth.uid()` di 30+ SQL Functions

**Problem:**  
Semua RPC dan RLS di [`supabase/migrations/`](../supabase/migrations/) bergantung pada `auth.uid()` — fungsi internal Supabase yang tidak tersedia di PostgreSQL standar.

**Solusi:**  
Ganti semua RPC agar menerima parameter eksplisit `p_user_id uuid` dan `p_role text`. Express middleware memverifikasi JWT terlebih dahulu, lalu menyuntikkan `user_id` ke setiap query/RPC call sebagai parameter.

```sql
-- SEBELUM (Supabase)
SELECT auth.uid() AS caller;

-- SESUDAH (portable)
CREATE FUNCTION pay_fee_items(p_user_id uuid, p_role text, ...) ...
```

---

### 🟠 2. Realtime Channel (Role Sync)

**Problem:**  
[`src/contexts/SupabaseAuthContext.jsx`](../src/contexts/SupabaseAuthContext.jsx) menggunakan `supabase.channel()` untuk mensinkronisasi perubahan role secara realtime.

**Solusi:**  
Polling ringan tiap **30 detik** ke `GET /api/users/me/role`. Frekuensi perubahan role sangat rendah (hanya saat admin mengubah role), sehingga polling adalah trade-off yang acceptable tanpa overhead WebSocket.

---

### 🟠 3. Session Management

**Problem:**  
Supabase mengelola tabel `auth.sessions` dengan cascade ke `auth.refresh_tokens` secara internal — tidak bisa direplikasi langsung.

**Solusi:**  
Buat tabel `sessions` sendiri di PostgreSQL dengan kolom `refresh_token`, `device_info`, `expires_at`, dan `user_id`. Logic logout-all-devices tetap bisa diimplementasi dengan `DELETE FROM sessions WHERE user_id = $1`.

---

### 🟡 4. User Creation oleh Admin

**Problem:**  
[`supabase/create-staff-account.js`](../supabase/create-staff-account.js) dan [`supabase/create-super-admin.js`](../supabase/create-super-admin.js) menggunakan `supabase.auth.admin.createUser()` — Admin API eksklusif Supabase.

**Solusi:**  
Endpoint `POST /api/admin/users` di Express dengan hashing password via `bcryptjs`. Script CLI terpisah untuk bootstrap super admin awal.

---

### 🟡 5. Interface `useAuth()` Harus Tetap Sama

**Problem:**  
Puluhan komponen bergantung pada interface `useAuth()` dari [`src/contexts/SupabaseAuthContext.jsx`](../src/contexts/SupabaseAuthContext.jsx). Mengubah interface akan memicu perubahan masif di seluruh codebase.

**Solusi:**  
Buat `apps/web/src/contexts/AuthContext.jsx` baru dengan **interface identik** — properti dan method yang sama (`user`, `session`, `role`, `signIn()`, `signOut()`, `loading`). Komponen tidak perlu diubah sama sekali.

---

> 📄 Lanjut ke [Bagian 6–9: Fase Implementasi, Dependencies, Env Vars, dan Catatan Penting](MIGRATION_PLAN_PART2.md)
