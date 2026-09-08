# Phase 1: Dependency Audit & Final Architecture Mapping

## 1. Executive Summary
Repositori `KR` (`@supabase/web-app`) saat ini adalah React 18 SPA yang di-bundle dengan Vite.
Aplikasi menggunakan Supabase (BaaS) untuk Authentication, Realtime WebSocket, Database CRUD, dan RPC functions, serta Vercel Functions + Vercel Blob untuk upload file dan private storage proxy.

Target akhir arsitektur:
* **Runtime:** Pure Self-Hosted Node.js `24.20.0 LTS` + Pure PostgreSQL 16 (tanpa ketergantungan runtime Supabase BaaS, PostgREST, maupun GoTrue).
* **Communication Model:** `React SPA` → `Node.js API (/api/*)` → `PostgreSQL` (Pool/pg client).
* **Static Assets & SPA Routing:** Node.js static middleware melayani output `dist/` dengan fallback `index.html`.
* **Storage Layer:** Provider-agnostic storage driver (`local` by default, `r2`, `s3`).
* **Database Schema:** Native PostgreSQL tables & PL/pgSQL functions.

---

## 2. Dependency Audit

### A. Vercel Dependencies
| Dependency / File | Type | Tindakan Target |
|---|---|---|
| `@vercel/analytics` (`package.json`, `src/main.jsx`) | Optional / Dead | Dihapus / di-disable di production self-hosted. |
| `@vercel/speed-insights` (`package.json`, `src/main.jsx`) | Optional / Dead | Dihapus / di-disable di production self-hosted. |
| `@vercel/blob` (`package.json`, `api/*.js`) | Migration & Storage | Dihapus dari runtime app; dipindahkan ke tooling migrasi (`tools/migrate-vercel-blob.js`). |
| `api/blob.js`, `api/upload.js`, `api/cleanup-blobs.js` | Runtime Storage | Dipindahkan ke internal Node.js API storage routes (`/api/storage/*` & `/storage/*`). |
| `api/send-push.js`, `api/generate-notifications.js` | Runtime Cron/Notification | Diintegrasikan ke Node.js API router + background jobs. |
| `vercel.json` | Platform Config | Tidak lagi dipakai di runtime Docker. Digantikan konfigurasi Nginx aaPanel + Express/Fastify SPA static server. |

### B. Supabase Dependencies
| Dependency / File | Type | Tindakan Target |
|---|---|---|
| `@supabase/supabase-js` (`package.json`, `src/*`) | Runtime Client | Diganti bertahap dengan API client Axios/Fetch ke Node.js backend. Dipertahankan hanya untuk migration tooling. |
| `@supabase/mcp-server-supabase` (`package.json`) | Dev/Tooling | Diabaikan/dihapus dari production runtime. |
| `auth.users` & GoTrue session | Auth Runtime | Disediakan modul Auth mandiri pada Node.js API (`/api/auth/login`, `/api/auth/register`, `/api/auth/me`, JWT/Session cookies) menggunakan schema PostgreSQL `app_users` / migrasi user data. |
| Supabase Realtime Channels (`src/App.jsx`, `SupabaseAuthContext.jsx`) | Realtime Notifications | Digantikan oleh SSE (Server-Sent Events) atau WebSocket ringan pada Node.js server. |
| Supabase RPCs (`get_category_summary`, `analytics_dashboard`, dll) | DB Business Logic | PL/pgSQL functions diimpor langsung ke native PostgreSQL dan dipanggil oleh Node.js API via `SELECT * FROM func_name(...)`. |

---

## 3. Storage Architecture Mapping

```text
Upload Request
     │
     ▼
Node.js API (/api/storage/upload)
     │
     ▼
Storage Service (Driver Resolver)
     │
     ├── Driver: 'local' (Default) ──► Persist to /app/storage (Docker persistent volume)
     │                                 Serve via /storage/:folder/:filename
     │
     ├── Driver: 'r2'              ──► S3-Compatible Client (Cloudflare R2 Endpoint)
     │                                 Canonical Key: uploads/folder/filename.webp
     │
     └── Driver: 's3'              ──► S3-Compatible Client (AWS / MinIO / Generic S3)
                                       Canonical Key: uploads/folder/filename.webp
```

* **Database Reference Standard:**
  * Canonical Object Key: `uploads/[folder]/[filename].[ext]` (Bukan direct absolute provider URL).
  * Storage layer bertugas me-resolve canonical key menjadi URL publik/proxy.

---

## 4. Auth & User Management Mapping

### Analisis Supabase Auth:
* Supabase menyimpan password hash menggunakan `bcrypt` standar di `auth.users.encrypted_password`.
* Table `user_roles` memetakan `user_id (UUID)` ke role (`karyawan`, `admin`, `super_admin`).

### Keputusan Auth Self-Hosted:
1. **Model Identitas:** Tabel `users` di schema public PostgreSQL:
   * `id` UUID (preserve ID dari Supabase)
   * `email` VARCHAR UNIQUE
   * `password_hash` VARCHAR (kompatibel dengan bcrypt)
   * `role` VARCHAR (dimigrasikan dari `user_roles`)
   * `created_at`, `updated_at`
2. **Session / Token:**
   * JWT (Stateless) atau Server-side Session (Postgres session store) yang disign menggunakan `JWT_SECRET` / `SESSION_SECRET`.
3. **Password Compatibility & Fallback:**
   * Jika hash bcrypt dari Supabase valid, login langsung berhasil tanpa reset.
   * Jika format tidak kompatibel atau salt format berbeda, fallback mekanismenya: flag `require_password_reset=true` yang meminta admin/user reset password dengan aman.

---

## 5. Target Project Structure
```text
KR (Root)
├── Dockerfile                         # Node 24.20.0 multi-stage build
├── docker-compose.yml                 # App + PostgreSQL container orchestration
├── .env.example                       # Environment variables specification
├── server/                            # Node.js backend server
│   ├── index.js                       # Server entrypoint (Express/Fastify)
│   ├── config.js                      # Config & Env parser
│   ├── db.js                          # PostgreSQL connection pool (pg)
│   ├── middleware/
│   │   ├── auth.js                    # JWT / Session auth middleware
│   │   └── rbac.js                    # Role-based access control
│   ├── routes/
│   │   ├── auth.js                    # /api/auth (login, logout, me, refresh)
│   │   ├── transactions.js            # /api/transactions
│   │   ├── analytics.js               # /api/analytics
│   │   ├── storage.js                 # /api/storage/upload & /storage static serve
│   │   └── notifications.js          # /api/notifications & push cron
│   └── storage/
│       ├── index.js                   # Storage provider factory
│       ├── local.js                   # Local filesystem driver
│       └── s3.js                      # S3 / R2 compatible driver
├── tools/                             # Dedicated migration & verification tooling
│   ├── migrate-supabase-db.js         # DB data transforms, sequences, auth sync
│   ├── migrate-vercel-blob.js         # Blob crawler, downloader, hasher, key updater
│   └── verify-migration.js            # Comprehensive audit & validation tool
├── src/                               # React SPA source
└── docs/
    └── aapanel-deployment.md          # Step-by-step aaPanel & Docker guide
```
