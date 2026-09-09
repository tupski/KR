# KR Self-Hosted Migration — Final Verification Matrix

Branch: `docker-local`
Audit date: 2026-09-08 (final)
Status legend: PASS (executed & verified) / IMPL (code exists, not executed) / FAIL (missing or broken) / N-A

## Executive Result

**READY WITH MANUAL VERIFICATION REQUIRED** — kode terverifikasi berjalan end-to-end di Docker
(build image, stack up, health, auth E2E, upload E2E, media E2E, data API + RPC + RLS pasca-apply
schema Supabase). Yang tersisa manual: eksekusi di aaPanel produksi (Nginx/SSL, migrasi data live
dengan kredensial Supabase).

## Verified (dieksekusi lokal)

| Perintah / langkah | Hasil |
|---|---|
| `npm test` | 153 passed / 0 failed (20 files, termasuk property tests) |
| `npm run lint` | 0 errors |
| `npx vite build` | ✓ 3579 modules, dist/ terbentuk |
| `docker compose build app` | ✓ image `kr-app:latest` terbentuk (3 bug build ditemukan & diperbaiki — lihat Fixed) |
| `docker compose up -d` | ✓ kr-app healthy, kr-postgres healthy, volume kr_pgdata + kr_storage |
| `GET /health` | 200 `{"status":"ok"}` |
| `GET /health/db` | 200 `{"status":"ok","database":"connected"}` |
| SPA + fallback | `/` 200 text/html, `/some/deep/route` 200 (fallback index.html), `/api/*` unknown 404 JSON |
| Auth E2E | `tools/create-admin.js` di container → login 200 (cookie HttpOnly), `/me` 200, password salah 401, rate-limit 429 aktif |
| Upload E2E | `/api/upload` (auth) → key `uploads/test/…png`, file ada di volume `/app/storage` |
| Media E2E | `/api/blob?pathname=…` auth 200 + isi benar; tanpa auth 401; traversal `../../etc/passwd` 400 |
| Data API E2E | select/insert/delete via policy (role super_admin dari DB); tabel tak dikenal → UNKNOWN_TABLE; kolom password → diblokir |
| RPC E2E | `get_dashboard_kpis` lewat whitelist + GUC → data benar |
| RLS pasca-apply schema | Supabase schema + 25 migration diterapkan; RLS policies aktif dan query node tetap jalan via GUC `request.jwt.*` |
| Unit: repository + and()/or() groups, runAsActor GUC, apiClient, storage | PASS |

## Not Verified

- Migrasi live Supabase → target (butuh kredensial MIGRATION_*).
- Smoke test produksi HTTPS + Nginx reverse proxy aaPanel.
- (Sebelumnya Docker; kini SUDAH dieksekusi di Docker Desktop Windows — lihat Verified.)

## Fixed (audit + Docker install test)

0. **Docker install test (eksekusi nyata)** — tiga bug build/runtime tertangkap:
   a. `.dockerignore` mengecualikan `plugins/` padahal `vite.config.js` mengimpor 4 plugin dari situ → builder gagal. `plugins/` di-unignore.
   b. `dotenv` hanya di devDependencies → `npm ci --omit=dev` tidak memasangnya → server crash `ERR_MODULE_NOT_FOUND` di container. Pindah ke dependencies.
   c. Dockerfile tidak menyalakan `tools/create-admin.js` → `npm run admin:create` tidak jalan di container. Ditambahkan ke stage runtime.
   d. **Role selalu 'karyawan'** di `/api/data/*`: route mengambil role dari payload JWT (yang tidak pernah berisi role), bukan dari DB. Kini memakai `req.authUser` hasil resolusi DB dari `middleware/auth.authenticate` — konsisten dengan sisa aplikasi (payload JWT tidak dipercaya untuk otorisasi).

1. **Parser `.or()` rusak untuk `and(...)`** (DashboardPemasukan.jsx:200, KetersediaanKamar.jsx:363):
   `parseOrString` memotong `and(checkin_at.gte.X,...)` jadi kolom sampah `"and(checkin_at"`.
   → Support `{ and: [...] }` di parser + repository (`normalizeFilters`, `compileFilters`, `assertPkCovered`).
2. **Semantik OR salah di repository**: anggota `{or:[...]}` di-join AND (query `.or()` selalu kosong).
   → `compileFilters(filters, params, join)` kini join OR untuk grup `or`.
3. **`supabase.storage.from(...).upload` crash di mode native** (ManajemenDeposit.jsx:315):
   shim native tak punya `.storage`. → Ganti ke `uploadToVercelBlob()` (endpoint `/api/upload`).
4. **RLS/SECURITY DEFINER RPC deny semua di native**: server tidak set GUC `request.jwt.*`
   (auth.uid()/auth.role() shims) → is_super_admin(), admin_* RPC, pay_*, log_activity menolak.
   → `runAsActor(actor, fn)` di `server/db/index.js` (BEGIN + set_config local + COMMIT/ROLLBACK),
     dipakai `createRepository(..., runAsActor)` di `server/routes/data.js`.
5. **Privilege escalation**: `POST /api/auth/register` (admin) bisa buat `super_admin`.
   → Dibatasi: admin hanya bisa buat karyawan/admin; super_admin via RPC admin_create_user.
6. **Hardcoded fallback Supabase URL/anon-key** di source (`customSupabaseClient.js`) — bocor kredensial
   ke bundle publik. → Dihapus; legacy mode kini fail-fast tanpa env valid; native mode tak sentuh URL.
7. **`FormTransaksi.jsx` dead shim** (path typo `mFormTransaksiModern`, import tak ter-resolve)
   → dihapus.
8. **Lint 12 errors**: globals node/Buffer utk server+tests, ignore dir agent/plugin.
9. **Dependensi mati**: `@supabase/mcp-server-supabase`, `jsonwebtoken`, `axios` dihapus.
10. **Flaky property test**: `fc.date` tanpa `noInvalidDate` → kadang `new Date(NaN)` → RangeError.
11. **Dockerfile**: default `VITE_API_MODE=native` saat build (tanpa .env di image, legacy mode throw).
12. **Tool admin**: `tools/create-admin.js` (+ `npm run admin:create`) untuk bootstrap akun pertama.
13. **Docs**: aapanel-deployment (fresh + migrasi, PG17, GUC, troubleshooting), production-cutover
    (langkah 0 backup-verified, prasyarat GUC, rollback realistis).

## Remaining Risks

- **Fresh install schema**: schema.sql minimal belum mencakup seluruh fungsi RPC produksi;
  fresh-from-scratch butuh apply supabase/supabase-schema.sql + migrations berurutan.
  Jalur migrasi (restore dump) adalah jalur didukung penuh.
- `@vercel/*` masih di dependency (runtime legacy) — lihat Runtime Dependency Status.
- Docker/production belum dieksekusi.

## Manual Production Steps (aaPanel)

1. Docker build + up; `/health` & `/health/db` hijau.
2. Pilih jalur: migrasi (restore) ATAU fresh (schema + `npm run admin:create`).
3. Nginx reverse proxy + SSL; smoke test login/upload/media.
4. Backup cron + verifikasi restore.

## Rollback Constraints

- Rollback traffic instan via DNS (Vercel tetap hidup 14–30 hari).
- Rollback DB/media **bukan zero-loss** setelah write baru di server self-hosted;
  delta manual diperlukan (lihat production-cutover.md §4).

## Runtime Dependency Status

| Runtime | Status |
|---|---|
| Supabase (runtime) | **NONE** saat `VITE_API_MODE=native` (default build Docker). Supabase-js hanya ter-bundle di mode legacy transisi (VITE_API_MODE=supabase) yang memerlukan env eksplisit; tanpa env legacy → fail-fast, bukan silent fallback. |
| Vercel | **NONE** — tidak ada kode runtime yang mengimpor @vercel/* (hanya tools migrasi yang memakai @vercel/blob). |
| Vercel Blob | **NONE** di runtime; `@vercel/blob` hanya dipakai `tools/migrate-vercel-blob.js` (migration-only). |

Catatan package.json: `@vercel/analytics`, `@vercel/speed-insights`, `@vercel/blob`, `@supabase/supabase-js`
masih tercantum di dependencies untuk mode transisi/migrasi. Runtime produksi (native) tidak
memuat kode Vercel/Supabase di bundle SPA maupun server Node.

## Test Results

153 passed / 0 failed / 0 skipped (20 test files) — `npm test`.
