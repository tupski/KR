# SECURITY REMEDIATION — SPRINT 1

Tanggal: 2026-09-15 · Branch: `main` · Status audit: adversarial red-team (sesi sebelumnya)

---

## 1. FIXED

### C-1 — Privilege escalation via `user_roles` RLS
**Fix:** `supabase/migrations/20260915000000_sprint1_security_hardening.sql`
- Semua 8 policy lama pada `public.user_roles` di-DROP (nama dari `supabase-schema.sql` dan migrasi lama).
- Policy baru: **SELECT self** (`auth.uid() = user_id`) dan **SELECT super_admin**.
- **Tidak ada policy INSERT/UPDATE/DELETE** → PostgREST menolak (RLS enabled + tanpa policy = deny). `UPDATE {role:'super_admin'} .eq('user_id', uid)` dari klien kini mustahil.
- `is_super_admin()` diubah menjadi `SECURITY DEFINER SET search_path = public` — mencegah infinite-recursion RLS pada policy `user_roles` dan menjaga semua policy lain yang memanggilnya.
- Perubahan role hanya via RPC SECURITY DEFINER yang sudah ada: `admin_create_user` / `admin_update_user` (guard `is_super_admin()`).

### C-2 — `/api/blob` tanpa autentikasi
**Fix:** rewrite `api/blob.js` + endpoint baru `api/blob-session.js`
- **401** tanpa kredensial. Kredensial: `Authorization: Bearer <jwt>` **atau** cookie `kr_blob_session` (HttpOnly, Secure, SameSite=Lax, Max-Age 55 menit) yang dipasang oleh `POST /api/blob-session` dengan access_token Supabase. Token divalidasi via `auth.getUser()` di **setiap** request — cookie kadaluarsa otomatis 401.
- **Otorisasi per-objek** (bukan sekadar "authenticated boleh semua"): pathname dipetakan ke tabel pemilik:
  | Prefix | Tabel | Owner check |
  |---|---|---|
  | `ktp-images` | `transactions.ktp_image_url` | owner `user_id` ATAU admin/super_admin |
  | `transfer-proofs` | `transactions.transfer_proof_url` | idem |
  | `deposit-refunds` | `transactions.deposit_refund_proof_url` | idem |
  | `tagihan-proofs` | `tagihan_bulanan.proof_url` | idem |
  | `fee-proofs` | `tagihan_fee_lunas.proof_url` | idem |
  | `avatars` | `user_profiles.avatar_url` | idem |
  Objek tidak ditemukan / bukan milik pemanggil / bukan admin → **404** (existence tidak dikonfirmasi).
- **Path safety:** tolak kosong, `..`, backslash, `%` (double-encode), folder di luar allow-list, filename di luar charset `[A-Za-z0-9._-]`.
- **LIKE wildcard injection ditangani:** pathname user TIDAK dimasukkan ke pola LIKE (karakter `_` adalah wildcard Postgres). Filter DB sengaja coarse (prefix folder) + pencocokan substring **persis** di server. Ada test regresi khusus.
- **Caching:** `Cache-Control: private, no-store` + `X-Content-Type-Options: nosniff` (sebelumnya `public, max-age=300`).
- Klien: `SupabaseAuthContext` menukar JWT → cookie sesi saat session berubah; `resolveStorageUrl` & semua pemakai `<img>` **tidak berubah** (cookie same-origin terkirim otomatis).

### H-1 — `/api/upload` unauthenticated arbitrary upload
**Fix:** rewrite `api/upload.js` + `src/lib/vercelBlobUpload.js`
- **401** tanpa JWT valid (`auth.getUser`).
- **Folder allow-list server-side:** `ktp-images`, `transfer-proofs`, `avatars` (semua authenticated), `tagihan-proofs`, `fee-proofs` (**admin/super_admin saja** — role dicek server-side). `x-folder` klien di luar daftar → 400.
- **Filename disaniter server-side:** basename diambil, traversal dibuang, charset dibatasi, diberi prefix `timestamp-randomhex` — sanitasi klien tidak lagi dipercaya.
- **MIME allow-list + magic bytes:** hanya `image/jpeg|png|webp|heic|heif`; signature file diverifikasi (JPEG FFD8FF, PNG 89504E47, WEBP RIFF/WEBP, HEIC/HEIF ftyp). Klaim MIME palsu → 415. Eksekusi/script type ditolak.
- **Size limit 5 MB** server-side → 413.
- Response shape tidak berubah (kompatibel semua caller).

### H-2 — `pay_tagihan_bulanan` otorisasi + replay
**Fix:** definisi aktif (versi recurring `20260524`) ditimpa migrasi baru:
1. Guard role: hanya `admin`/`super_admin` (cek langsung `user_roles`, definer bypass RLS).
2. Guard replay: `IF v_row.status = 'paid' THEN RAISE` **setelah** `SELECT ... FOR UPDATE` → panggilan berulang tidak mungkin membuat pengeluaran kedua (status-cek + insert dalam satu transaksi = idempotency di level DB, bukan frontend).
3. Atomicity & alur recurring dipertahankan utuh (lock → validate → update → expense → generate tagihan berikutnya).

### H-3 — `pay_fee_items` otorisasi
**Fix:** ditimpa migrasi baru (basis gabungan `20260417_fix` + `20260520`):
1. Guard role admin/super_admin.
2. **Hole replay tambahan ditemukan & ditutup:** versi `20260520` menghitung `v_total_fee` dari SEMUA transaksi match — replay menyisipkan `pengeluaran` + receipt duplikat walau items ON CONFLICT noop. Kini fee hanya dihitung dari transaksi yang **belum ada** di `tagihan_fee_lunas_items`.
3. `pengeluaran` dan receipt `tagihan_fee_lunas` hanya dibuat jika `items_inserted > 0`.
4. Dedupe per `transaction_id` (ON CONFLICT) dipertahankan; tidak ada fungsi legit yang hilang.

### M-1 — Bucket legacy public
- Migrasi: `UPDATE storage.buckets SET public = false WHERE id IN ('ktp_images','transfer_proofs','tagihan_proofs')`. Data **tidak disentuh**.
- Catatan: bucket `transaction_receipts` dipakai `ManajemenDeposit.jsx` via `supabase.storage` tetapi tidak dibuat di schema repo — **baru ditemukan**, perlu verifikasi visibility di dashboard (lihat Remaining).

### M-4 — Public signup
- `signUp` dihapus dari `SupabaseAuthContext` (tidak dipakai UI mana pun; `Auth.jsx` memang hanya login).
- **Tidak dapat diubah dari repo:** dashboard Supabase → Authentication → Providers → Email → **"Enable Signup" harus OFF** di production. Daftar di Production Manual Verification.
- Fail-safe: meski signup aktif di dashboard, akun baru tanpa baris `user_roles` dianggap `karyawan`; setelah patch C-1, akun tersebut **tidak bisa** meng-elevasi dirinya.

---

## 2. REMAINING (dari audit, tidak berubah di sprint ini)

| ID | Item | Catatan |
|---|---|---|
| M-2 | PIN `212198` hardcoded di bundle | Sprint berikutnya (per keputusan, di Task 10) |
| M-3 | RLS SELECT terbuka semua authenticated untuk data transaksi/pengeluaran | Keputusan bisnis dulu |
| M-5 | CHECK constraint nominal >= 0 belum ada | Sprint berikutnya |
| M-6 | 18 deps high (`xlsx`, `react-router-dom`, `vite`, dst.) | Sprint dependensi, jangan blind-upgrade |
| LOW-1 | Cron secret via query string, non-timing-safe | Sprint berikutnya |
| LOW-2 | `log_activity` SECURITY DEFINER tanpa `SET search_path`, bisa dipalsukan | Sprint berikutnya |
| LOW-3 | Tidak ada CSP/security headers produksi | Sprint berikutnya |
| LOW-4 | (sebagian ditutup) sanitasi filename upload kini server-side; sisa: `x-folder` sudah allow-list | CLOSED oleh H-1 untuk jalur `/api/upload` |
| LOW-5 | Semua authenticated bisa tulis `marketing_list`/`karyawan_list`/`pengeluaran_categories` | Sprint berikutnya |
| INFO-1 | Fallback URL/anon key di `customSupabaseClient.js`; `user_id`/`created_at` di `ALLOWED_FIELDS` edit transaksi | Sprint berikutnya |
| BARU | Bucket `transaction_receipts` (dipakai ManajemenDeposit) tidak ada di schema repo — visibility tidak diketahui | Verifikasi manual |
| BARU | If >1000 objek dalam satu folder, coarse lookup `range(0,999)` perlu pagination lanjutan | Monitor volume |

---

## 3. Regression Tests

### PASS (executed, 40/40)
`npx vitest run tests/security` — 3 file, 40 test:
- `tests/security/upload-api.security.test.js` (12): anonymous→401, invalid token→401, folder non-allow-list→400, traversal folder→400, karyawan×tagihan-proofs→403, admin×tagihan-proofs→200, oversized→413, MIME text/html→415, MIME spoof magic-bytes→415, malicious filename→disaniter, upload sah→200 private proxy URL, method→405.
- `tests/security/blob-api.security.test.js` (13): anonymous→401, invalid token→401, traversal→400, namespace luar→400, malformed→400, objek tak ada→404, bukan pemilik karyawan→404 (fetch blob TIDAK dipanggil), pemilik→200 + `private, no-store` + nosniff, admin→200, super_admin→200, cookie session→200, **LIKE wildcard injection→404**, method→405.
- `tests/security/sprint1-migration.security.test.js` (15): static verification migrasi — DROP 8 policy lama user_roles, tidak ada CREATE POLICY INSERT/UPDATE/DELETE user_roles, `is_super_admin` SECURITY DEFINER + search_path, guard role & guard `status='paid'` + `FOR UPDATE` di kedua RPC pay_*, dedupe NOT-EXISTS + `items_inserted > 0`, bucket → public=false, tidak ada DROP/DELETE bucket.
- Suite lain: `npm run test` 62/63 pass — 1 failure `AnalyticsDashboard.property.test.jsx` **flaky pre-existing** (fast-check menghasilkan `new Date(NaN)`; file tidak tersentuh sprint; rerun pass).

### PASS
- `npm run lint` — error turun 16→7; **semua 7 error sisa pre-existing** (`.roo/skills/*/dist`, `FormTransaksi.jsx` broken import — diverifikasi bukan dari perubahan sprint).
- Build: `node node_modules/vite/bin/vite.js build` → `✓ built in 27.91s`, 3568 modules, dist fresh. **Catatan:** di host ini `npm run build` (npm script) berhenti sebelum vite build — quirk pre-existing npm-script-shell, bukan dari sprint.

### NOT RUN (butuh infra live)
- Interaksi PostgREST/RLS nyata (butuh Supabase live).
- Smoke test upload/blob di deployment Vercel.

### MANUAL VERIFICATION REQUIRED (production)
1. **Supabase dashboard:** Authentication → Providers → Email → Enable Signup = **OFF** (M-4, tidak bisa dari repo).
2. **Supabase dashboard → Storage:** ktp_images / transfer_proofs / tagihan_proofs = Private setelah migrasi; cek juga `transaction_receipts`.
3. **Jalankan migrasi** `20260915000000_sprint1_security_hardening.sql` di project production (SQL editor / `supabase db push`), lalu verifikasi: `\dp public.user_roles` hanya 2 policy SELECT; `\df+ pay_tagihan_bulanan` & `pay_fee_items` versi baru.
4. **Vercel env wajib ada:** `SUPABASE_URL`, `SUPABASE_ANON_KEY` (atau `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`), `SUPABASE_SERVICE_ROLE_KEY` (untuk `/api/blob`), `BLOB_READ_WRITE_TOKEN`, `VERCEL_BLOB_STORE_ID`/`VERCEL_BLOB_BASE_URL`, `BLOB_OBJECT_ACCESS` (harus `private`).
5. **Smoke live:** (a) curl `/api/blob?pathname=<ktp>` tanpa token → 401; (b) login → lihat KTP/bukti di UI → tampil; (c) login admin → bukti tagihan → tampil; (d) karyawan upload KTP → sukses; (e) karyawan coba upload tagihan-proof via API langsung → 403; (f) replay `pay_tagihan_bulanan` pada tagihan lunas → exception "sudah lunas"; (g) karyawan `update user_roles` via PostgREST → 0 rows / error RLS.
6. **Cache:** clear CDN/cache yang mungkin menyimpan respons `/api/blob` lama dengan `Cache-Control: public` (URL lama kini 401, aman).

---

## 4. Adversarial Retest (red-team mindset, post-patch)

| Finding | Eksploit asli | Patch | Percobaan ulang | Hasil |
|---|---|---|---|---|
| C-1 | `update user_roles set role=super_admin eq user_id=uid` | RLS tanpa policy write | Sama via PostgREST; insert row baru; delete policy; realtime channel menunggu perubahan | **FIXED** — semua ditolak RLS (deny-by-default). RLS spoof: tidak ada SECURITY DEFINER yang mengekspos write role selain `admin_*` RPC ber-guard `is_super_admin()` |
| C-1 bypass hunt | — | — | Cek duplikat policy lama di semua migrasi; cek `FOR ALL` permisif; cek recursion `is_super_admin()` | Tidak ada policy lain yang menyentuh `user_roles` write; `SECURITY DEFINER` baru `is_super_admin` read-only |
| C-2 | `GET /api/blob?pathname=...` anonim | 401 + otorisasi per-objek | Anonim→401 (test); employee path orang lain→404; traversal `../`→400; double-encode `%252e`→400 (reject `%`); namespace lain→400 | **FIXED** (test otomatis) |
| C-2 bypass: token di URL | — | — | Ditolak by-design; cookie HttpOnly+SameSite=Lax, divalidasi tiap request | Tidak ada token di URL/log |
| C-2 bypass: cache | — | — | `private, no-store` + nosniff | FIXED |
| C-2 bypass: LIKE wildcard | pathname `ktp-images/1.webp` mencocokkan `photo__1_.webp` milik orang lain | exact-substring match | Test regresi khusus → 404, fetch blob tidak terpanggil | FIXED |
| H-1 | POST `/api/upload` anonim | 401 + allow-list + MIME + size | anonim→401; `x-folder` arbitrer→400; exe-berkedok PNG→415 magic bytes; 6MB→413; traversal filename→disaniter | **FIXED** (test otomatis) |
| H-1 bypass: mass upload | — | — | Size limit + jenis dibatasi; cleanup `cleanup-blobs` tetap hanya 2 prefix — sisa prefix (avatars/fee/tagihan) tidak ter-clean otomatis | Diketahui — masuk Remaining (abuse monitoring) |
| H-2 | karyawan `rpc pay_tagihan_bulanan`; replay paid | role guard + status guard | karyawan→exception; replay paid→exception "sudah lunas"; concurrent double-pay→`FOR UPDATE` serialisasi, yang kedua melihat status paid→tolak | **FIXED** |
| H-3 | karyawan `rpc pay_fee_items`; replay | role guard + NOT-EXISTS fee + guard insert | karyawan→exception; replay → `items_inserted:0`, tanpa pengeluaran/receipt baru | **FIXED** |
| M-1 | URL public `/storage/v1/object/public/ktp_images/...` | bucket→private | (live) direct URL akan 401 setelah migrasi | FIXED via migrasi + verifikasi manual |
| M-4 | signup mandiri → masuk chain C-1 | signUp dihapus; C-1 ditutup | akun baru tanpa role = karyawan; tidak bisa elevasi | Mitigasi berlapis; matikan signup di dashboard |
| Mass assignment | edit transaksi via `ALLOWED_FIELDS` user_id/created_at | tidak disentuh (Task 10) | — | Remaining INFO-1 |
| RLS bypass via service-role | service key bocor ke klien? | — | `SUPABASE_SERVICE_ROLE_KEY` hanya diimport di `api/*.js` (serverless), tidak pernah ada di `src/` | Aman dari bundle |

---

## 5. Files Changed

```
M  api/blob.js                          — C-2: auth + otorisasi per-objek + path safety + no-store
A  api/blob-session.js                  — C-2: JWT→cookie HttpOnly untuk <img>
M  api/upload.js                        — H-1: auth + allow-list + sanitasi + MIME + size
M  src/lib/vercelBlobUpload.js          — H-1: kirim Bearer token
M  src/contexts/SupabaseAuthContext.jsx — C-2 (sesi blob cookie) + M-4 (hapus signUp)
A  supabase/migrations/20260915000000_sprint1_security_hardening.sql — C-1, M-1, H-2, H-3
A  tests/security/upload-api.security.test.js
A  tests/security/blob-api.security.test.js
A  tests/security/sprint1-migration.security.test.js
M  eslint.config.mjs                    — globals node utk api/ & tests/ (infra lint, bukan logic)
```

Tidak di-commit (menunggu instruksi). `.gitignore` berubah `+ .freebuff/` — bukan perubahan sprint (ada di working tree sebelum stash/pop cycle).

---

## 6. Next Recommended Sprint

1. **LOW-1 + LOW-2 + LOW-3** (cron secret timing-safe/header, `log_activity` search_path, CSP/security headers) — murah, menutup hardening.
2. **M-5 CHECK constraints** nominal + **LOW-5** write-protection reference lists — integritas keuangan.
3. **M-2 PIN** → otorisasi server-side penuh (kini M-3 menentukan scoping SELECT).
4. **M-6 dependensi** terpilih (xlsx import-path, react-router-dom, vite) + audit `transaction_receipts` bucket.
5. Cleanup Blob untuk prefix non-`ktp/transfer` bila upload abuse jadi kekhawatiran.
