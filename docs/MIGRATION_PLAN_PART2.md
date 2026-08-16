# 🏗️ Rencana Migrasi — Bagian 2: Implementasi & Konfigurasi

> ← Kembali ke [Bagian 1: Overview, Inventaris, Arsitektur, Peta Migrasi](MIGRATION_PLAN.md)

---

## 📑 Daftar Isi

6. [Fase Implementasi](#6-fase-implementasi)
7. [Dependencies](#7-dependencies)
8. [Environment Variables Target](#8-environment-variables-target)
9. [Catatan Penting](#9-catatan-penting)

---

## 6. Fase Implementasi

### Fase 1 — Backend Foundation

> **Goal:** Express.js server berjalan dengan auth custom dan koneksi database.

- [ ] Setup project monorepo (`apps/web/`, `apps/server/`)
- [ ] Setup Express.js server dengan JSDoc di `apps/server/src/app.js`
- [ ] PostgreSQL connection pool via `pg` di `apps/server/src/config/database.js`
- [ ] Env validation dengan Zod di `apps/server/src/config/env.js`
- [ ] Custom JWT auth (`jsonwebtoken` + `bcryptjs`)
- [ ] Buat tabel `users` dan `sessions` custom (tanpa `auth.users` Supabase)
- [ ] Auth endpoints: `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/refresh`, `GET /api/auth/session`
- [ ] Middleware `auth.middleware.js` — verify JWT + inject `req.user`
- [ ] Middleware `errorHandler.js` dan `cors.middleware.js`

---

### Fase 2 — Database Migration

> **Goal:** Semua tabel dan RPC functions berjalan di PostgreSQL lokal tanpa dependensi Supabase.

- [ ] Port semua SQL dari [`supabase/migrations/`](../supabase/migrations/) ke `database/migrations/`
- [ ] `001_core_tables.sql` — port `transactions`, `pengeluaran`, `lokasi_apartemen`, `user_profiles`, `user_roles`, `user_location_assignments`
- [ ] `002_auth_tables.sql` — custom `users` + `sessions` table (tanpa `auth.users`)
- [ ] `003_notifications.sql` — port `notifications`, `notification_hidden`, `notification_preferences`, `push_subscriptions`, `announcements`
- [ ] `004_finance_rpcs.sql` — port `pay_fee_items`, `pay_tagihan_bulanan`, `tagihan_fee_lunas`, `tagihan_fee_lunas_items`, `tagihan_bulanan`, `deposit_returns`
- [ ] `005_analytics_rpcs.sql` — port semua `get_analytics_*` functions
- [ ] `006_activity_logs.sql` — port `activity_logs`, `log_activity` RPC
- [ ] `007_system_settings.sql` — port `system_settings`
- [ ] `008_recurring_bills.sql` — port `recurring_unit_bills`, `expense_categories`
- [ ] Hapus semua `auth.uid()` dari RPC → replace dengan `p_user_id uuid` eksplisit
- [ ] Hapus semua RLS policies → replace dengan middleware checks di Express
- [ ] Test semua RPC functions dengan data seed

---

### Fase 3 — Storage System

> **Goal:** Upload/download file berjalan via provider abstraction, bukan Vercel Blob.

- [ ] Definisikan interface provider di `apps/server/src/config/storage.js`
- [ ] Implementasi `apps/server/src/modules/storage/providers/local.provider.js` (multer + serve-static)
- [ ] Implementasi `apps/server/src/modules/storage/providers/r2.provider.js` (aws-sdk S3 compatible)
- [ ] Implementasi `apps/server/src/modules/storage/providers/s3.provider.js` (generic S3)
- [ ] Port logic [`api/upload.js`](../api/upload.js) → `POST /api/storage/upload`
- [ ] Port logic [`api/blob.js`](../api/blob.js) → `GET /api/storage/file/:pathname`
- [ ] Port logic [`api/cleanup-blobs.js`](../api/cleanup-blobs.js) → `jobs/cleanupStorage.job.js`
- [ ] Update [`src/lib/storageUrl.js`](../src/lib/storageUrl.js) untuk multi-provider URL resolution

---

### Fase 4 — API Modules

> **Goal:** Semua domain bisnis tersedia sebagai REST endpoints.

- [ ] `modules/auth/` — login, logout, refresh, session, me
- [ ] `modules/users/` — CRUD user, role management, `GET /api/users/me/role`
- [ ] `modules/transactions/` — CRUD transaksi, paginated, filtered by date
- [ ] `modules/notifications/` — notifikasi, preferences, hide, push subscription
- [ ] `modules/analytics/` — port semua `get_analytics_*` sebagai REST endpoints
- [ ] `modules/settings/` — system settings, announcements
- [ ] Port [`api/generate-notifications.js`](../api/generate-notifications.js) (522 baris) → `jobs/generateNotifications.job.js` (modular)
- [ ] Port [`api/send-push.js`](../api/send-push.js) → `modules/notifications/push.service.js`
- [ ] Setup cron scheduler via `node-cron` di `jobs/scheduler.js`

---

### Fase 5 — Frontend Adapter

> **Goal:** Frontend beralih dari Supabase client ke REST client tanpa breaking interface `useAuth()`.

- [ ] Buat `apps/web/src/api/client.js` — base fetch client dengan auth header otomatis
- [ ] Buat `apps/web/src/api/auth.api.js`
- [ ] Buat `apps/web/src/api/transactions.api.js`
- [ ] Buat `apps/web/src/api/notifications.api.js`
- [ ] Buat `apps/web/src/api/storage.api.js`
- [ ] Buat `apps/web/src/api/analytics.api.js`
- [ ] Ganti [`src/contexts/SupabaseAuthContext.jsx`](../src/contexts/SupabaseAuthContext.jsx) → `AuthContext.jsx` dengan interface identik
- [ ] Update [`src/hooks/useRpcQuery.js`](../src/hooks/useRpcQuery.js) → panggil REST endpoint, bukan `supabase.rpc()`
- [ ] Update [`src/lib/pushClient.js`](../src/lib/pushClient.js) → simpan subscription via REST API
- [ ] Update semua komponen yang langsung memanggil `supabase.from()` atau `supabase.rpc()`
- [ ] Ganti [`src/utils/supabase.ts`](../src/utils/supabase.ts) dengan typed REST client

---

### Fase 6 — Testing & Cleanup

> **Goal:** Tidak ada sisa dependensi Supabase/Vercel, semua env vars bersih.

- [ ] Hapus `@supabase/supabase-js` dari `package.json`
- [ ] Hapus `@supabase/mcp-server-supabase` dari `package.json`
- [ ] Hapus `@vercel/analytics` dari `package.json`
- [ ] Hapus `@vercel/blob` dari `package.json`
- [ ] Hapus `@vercel/speed-insights` dari `package.json`
- [ ] Hapus fallback URL/key Supabase dari seluruh kode
- [ ] Hapus `vercel.json` atau bersihkan konfigurasi Vercel Cron
- [ ] Pindahkan PIN hardcode `212198` dari [`src/App.jsx`](../src/App.jsx) ke env atau database
- [ ] Konversi [`supabase/create-staff-account.js`](../supabase/create-staff-account.js) ke CLI script
- [ ] Konversi [`supabase/create-super-admin.js`](../supabase/create-super-admin.js) ke CLI script
- [ ] Update semua env vars (lihat [Bagian 8](#8-environment-variables-target))
- [ ] Run full test suite

---

## 7. Dependencies

### Dependencies Baru — Server (`apps/server/package.json`)

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^2.4.3",
    "multer": "^1.4.5-lts.1",
    "@aws-sdk/client-s3": "^3.600.0",
    "web-push": "^3.6.7",
    "node-cron": "^3.0.3",
    "zod": "^3.23.8",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  }
}
```

> ⚠️ Gunakan versi exact atau pinned untuk stabilitas di lingkungan lokal.

### Dependencies Baru — Web (`apps/web/package.json`)

Tidak ada dependency baru signifikan — hapus yang lama, pertahankan:

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.x"
  }
}
```

### Dependencies yang Dihapus

| Package | Alasan Dihapus |
|---|---|
| `@supabase/supabase-js` | Diganti REST client custom |
| `@supabase/mcp-server-supabase` | Tidak relevan tanpa Supabase |
| `@vercel/analytics` | Tidak hosting di Vercel |
| `@vercel/blob` | Diganti storage provider abstraction |
| `@vercel/speed-insights` | Tidak hosting di Vercel |

---

## 8. Environment Variables Target

Simpan di `.env.example` di root project. **Jangan pernah commit `.env` ke git.**

```dotenv
# ─────────────────────────────────────────────
# DATABASE
# ─────────────────────────────────────────────
DB_HOST=localhost
DB_PORT=5432
DB_NAME=kakarama_room
DB_USER=postgres
DB_PASSWORD=your_db_password
DB_SSL=false

# ─────────────────────────────────────────────
# AUTH — JWT
# ─────────────────────────────────────────────
# Generate dengan: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=your_jwt_secret_min_64_chars
JWT_REFRESH_SECRET=your_refresh_secret_min_64_chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

# ─────────────────────────────────────────────
# STORAGE
# ─────────────────────────────────────────────
# Pilihan: local | r2 | s3
STORAGE_PROVIDER=local

# Untuk provider 'local'
STORAGE_LOCAL_PATH=./storage

# Untuk provider 'r2' (Cloudflare R2)
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET_NAME=kakarama-room
R2_PUBLIC_URL=https://pub-xxx.r2.dev

# Untuk provider 's3' (Generic S3-compatible)
S3_ENDPOINT=https://s3.your-region.amazonaws.com
S3_ACCESS_KEY_ID=your_s3_access_key
S3_SECRET_ACCESS_KEY=your_s3_secret_key
S3_BUCKET_NAME=kakarama-room
S3_REGION=ap-southeast-1

# ─────────────────────────────────────────────
# WEB PUSH — VAPID
# ─────────────────────────────────────────────
# Generate dengan: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:admin@kakaramaroom.com

# ─────────────────────────────────────────────
# CRON SECRETS
# ─────────────────────────────────────────────
CRON_SECRET=your_cron_secret_token

# ─────────────────────────────────────────────
# APP CONFIG
# ─────────────────────────────────────────────
PORT=3001
FRONTEND_URL=http://localhost:5173
NODE_ENV=development

# ─────────────────────────────────────────────
# SECURITY — PIN
# ─────────────────────────────────────────────
# Ganti hardcode '212198' di src/App.jsx
APP_PIN=your_secure_pin

# ─────────────────────────────────────────────
# FRONTEND (Vite — prefix VITE_)
# ─────────────────────────────────────────────
VITE_API_BASE_URL=http://localhost:3001
VITE_VAPID_PUBLIC_KEY=your_vapid_public_key
```

---

## 9. Catatan Penting

### 🔒 Interface `useAuth()` Tidak Berubah

Komponen yang memanggil [`useAuth()`](../src/contexts/SupabaseAuthContext.jsx) **tidak perlu dimodifikasi**. `AuthContext.jsx` baru akan mengekspos interface identik:

```js
const { user, session, role, loading, signIn, signOut } = useAuth();
```

---

### 🗄️ PostgreSQL RPC Functions Tetap Dipertahankan

Semua SQL functions (`pay_fee_items`, `pay_tagihan_bulanan`, `get_analytics_*`, dll.) **tetap berjalan di PostgreSQL** — bukan dipindah ke application layer. Perbedaannya hanya pada cara pemanggilan: dari `supabase.rpc()` menjadi `SELECT function_name($1, $2)` via `pg.query()` di Express service.

---

### 📌 PIN Hardcode Harus Dipindah

Baris berikut di [`src/App.jsx`](../src/App.jsx) mengandung PIN hardcode yang harus segera dipindahkan:

```js
// SEBELUM — tidak aman
const CORRECT_PIN = '212198';

// SESUDAH — dari env
const CORRECT_PIN = import.meta.env.VITE_APP_PIN;
```

---

### 📝 File TypeScript Perlu Konversi

[`src/utils/supabase.ts`](../src/utils/supabase.ts) adalah satu-satunya file TypeScript di project yang otherwise full JavaScript. Ganti dengan typed REST client dalam format `.js` dengan JSDoc, atau buat `src/api/types.js` dengan [`@typedef`](https://jsdoc.app/tags-typedef) untuk konsistensi.

---

### 🛠️ Script Admin Perlu Dikonversi

| Script Lama | Target Baru |
|---|---|
| [`supabase/create-staff-account.js`](../supabase/create-staff-account.js) | `scripts/create-staff.js` (CLI, panggil `POST /api/admin/users`) |
| [`supabase/create-super-admin.js`](../supabase/create-super-admin.js) | `scripts/bootstrap-admin.js` (CLI, direct DB insert) |
| [`supabase/create-account-karyawan-admin.sql`](../supabase/create-account-karyawan-admin.sql) | Masuk ke `database/seeds/` |

---

### ⚡ Prioritas Implementasi yang Disarankan

Jika ingin mulai bertahap tanpa membreak production:

1. **Mulai dari Fase 1 + 2** (backend + database) — tidak menyentuh frontend sama sekali
2. **Fase 3** (storage) dapat berjalan paralel dengan Fase 4
3. **Fase 5** (frontend adapter) hanya dimulai setelah backend 100% siap dan ter-test
4. **Fase 6** (cleanup) dilakukan paling akhir setelah smoke test menyeluruh

---

> 📄 Kembali ke [Bagian 1: Overview, Inventaris, Arsitektur, Peta Migrasi](MIGRATION_PLAN.md)
