# KR Self-Hosted Migration — Final Verification Matrix

Branch: `docker-local`
Audit date: 2026-09-08 (final)
Status legend: PASS (executed & verified) / IMPL (code exists, not executed) / FAIL (missing or broken) / N-A

## Executive Result

**READY WITH MANUAL VERIFICATION REQUIRED** — kode siap produksi aaPanel; eksekusi Docker/produksi
belum dapat diverifikasi di environment lokal (Docker daemon tidak berjalan), sehingga item
Docker/production tetap menjadi verifikasi manual di aaPanel (Ubuntu 24.04).

## Verified (dieksekusi lokal)

| Perintah | Hasil |
|---|---|
| `npm test` | 153 passed / 0 failed (20 files) |
| `npm run lint` | 0 errors |
| `npx vite build` | ✓ 3579 modules, dist/ terbentuk |
| `node tools/create-admin.js` (tanpa env) | Validasi error yang benar |
| Unit: repository + and()/or() groups, runAsActor GUC, apiClient, storage | PASS |

## Not Verified

- `docker compose build / up` — Docker daemon tidak aktif di environment lokal.
  Harus dijalankan di aaPanel Ubuntu 24.04 (lihat docs/aapanel-deployment.md).
- Migrasi live Supabase → target (butuh kredensial MIGRATION_*).
- Smoke test produksi HTTPS + Nginx reverse proxy.

## Fixed (audit ini)

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
