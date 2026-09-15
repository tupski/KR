# SECURITY VERIFICATION — SPRINT 1.5

Tanggal: 2026-09-15 · Basis: commit `ed60735` (sprint 1) · Metode: **SOURCE VERIFIED** (bukan live production)

---

## 1. Verification Summary

Sprint 1 diverifikasi ulang independen dari source code, tanpa mempercayai laporan/test/implementasi sebelumnya. Hasil: **C-1, C-2, H-1, H-2, H-3 tetap FIXED; tidak ada bypass baru yang bisa dieksploitasi.** Dua kelemahan MEDIUM baru ditemukan pada review mendalam (keduanya already-known limitation yang kini diklasifikasikan + didokumentasikan, bukan regresi Sprint 1). Dua suite test adversarial baru (29 test) menutup celah verifikasi. Gate: **93/93 test, lint 7 pre-existing, build PASS.**

---

## 2. C-1 — `user_roles` Escalation: **FIXED**

### Effective-policy audit (seluruh history, bukan migrasi terakhir saja)
- `user_roles` disentuh policy HANYA di `supabase-schema.sql` (4 policy write permisif) dan migrasi sprint 1 (DROP 8 nama policy + CREATE 2 SELECT). Tidak ada file `supabase/schema/*`.
- Tidak ada `FOR ALL` policy pada `user_roles` di mana pun (`grep` semua migration). Yang ada: `system_settings`, `role_menu_visibility`, `menu_configuration`, `user_permissions` — semuanya `USING (is_super_admin())`, aman.
- Tidak ada **trigger** yang menulis `user_roles` (grep semua migrasi: hanya `admin_*` RPC, `create_account_karyawan_admin`, dan UPDATE data-migration di `supabase-schema.sql:454` — script setup, bukan runtime).
- Tidak ada **view** di schema (grep `CREATE VIEW`: nihil).
- `GRANT` tabel: Supabase default `authenticated` = CRUD via PostgREST — **ditutup oleh absence of RLS policy** (deny-by-default). Verifikasi `\dp user_roles` di live tetap direkomendasikan.

### Serangan yang dicoba (source-level)
| Serangan | Path | Hasil |
|---|---|---|
| INSERT own `super_admin` | PostgREST INSERT | Ditolak — tidak ada INSERT policy |
| UPDATE own role | PostgREST UPDATE | Ditolak — tidak ada UPDATE policy |
| UPDATE role user lain | PostgREST UPDATE | Ditolak (USING false = invisible row) |
| DELETE own role | PostgREST DELETE | Ditolak — tidak ada DELETE policy |
| Eksploit policy permisif lain | grep semua migrasi | Tidak ada yang menulis `user_roles` |
| RPC yang mengubah role | `admin_create_user`/`admin_update_user` (guard `is_super_admin`), `create_account_karyawan_admin` (REVOKE ALL FROM PUBLIC) | Tidak callable untuk eskalasi |
| Recursion `is_super_admin()` | policy → function → `user_roles` | Aman — function `SECURITY DEFINER SET search_path=public`, owner postgres membypass RLS |
| Realtime channel `role_sync` | `SupabaseAuthContext.jsx:146` | Hanya membaca (SELECT self tetap sah) — tidak ada jalur write |

**Kesimpulan:** satu-satunya jalur write `user_roles` = SECURITY DEFINER RPC ber-guard super_admin. Jalur ini tertutup sampai level PostgREST.

---

## 3. C-2 — `/api/blob`: **FIXED**

Review line-by-line (`api/blob.js:117-220`) + 17 test bypass baru (`blob-adversarial-1_5.security.test.js`):

| Vektor | Hasil |
|---|---|
| Anonim / `Bearer` kosong / cookie kosong | 401 |
| Double-encoding `%252e%252e` | 400 — `%` ditolak setelah decode pertama |
| URL-encoded traversal `%2e%2e%2f` | 400 setelah decode |
| Backslash / duplikat slash | 400 |
| 10k-char path | 400/404, **fetch blob tidak pernah dipanggil** |
| LIKE metacharacter (`_`, `%`) di filename | 400 (charset regex) — dan lookup memakai `includes()` JS, bukan pola SQL |
| Case-fold folder (`KTP-Images`) / prefix mirip (`ktp-images2`) / wildcard (`ktp-images-*`) | 400 — allow-list exact-match |
| Hidden file, path kosong/undefined | 400 |
| Filename casing berbeda vs DB | `includes()` case-sensitive → 404, tidak ada fallback permisif |
| Employee baca objek orang lain | 404 tanpa existence disclosure |
| Admin/super_admin lintas user | 200 (by design) |

**Cache leakage:** `private, no-store` + nosniff (test assert). **Cookie session bukan auth universal:** scope `Path=/` tapi hanya dibaca `extractToken()` di `api/blob.js`; endpoint lain (`/api/upload`, `/api/generate-notifications`, `/api/cleanup-blobs`, `/api/send-push`) hanya menerima Bearer header — diverifikasi grep. Nilai cookie = JWT Supabase yang divalidasi penuh setiap request; tidak memberi hak tambahan. Catatan kecil: cookie belum dihapus saat sign-out klien (tetap kadaluarsa ≤55 menit, tidak bisa diperbarui, kedaluwarsa bersama JWT) — LOW, dicatat.

---

## 4. H-1 — `/api/upload`: **FIXED**

Review line-by-line + 12 test bypass baru (`upload-adversarial-1_5.security.test.js`):

| Vektor | Hasil |
|---|---|
| `Bearer` kosong / tanpa token / `Basic` scheme | 401 |
| JWT invalid/expired/wrong issuer | `auth.getUser(token)` memvalidasi signature+exp+aud terhadap project — 401 (didukung mock test; live verify terpisah) |
| `x-folder=avatars/../tagihan-proofs` | 400 — exact-match allow-list, `put()` tidak terpanggil (test assert) |
| `x-folder=../admin`, `%2e%2e`, `KTP-Images`, folder unknown | 400 |
| Karyawan → folder privileged | 403 (role dicek server-side per request) |
| Null byte, RTL override `\u202E`, 5k-char filename, `..\..\evil` | Disaniter server; filename final selalu `timestamp-randomhex.ext` — nama klien TIDAK pernah dipakai sebagai identifier (test assert: tanpa `\0`, tanpa `\u202E`, tanpa `..`) |
| `Content-Type: image/png` + body HTML/JPEG | 415 (magic bytes) |
| `image/png; charset=utf-8` | 200 — parsing parameter benar |

**Resource exhaustion (static):** `readRequestBody` streaming dengan counter — abort di >5 MB tanpa buffer penuh. Namun: **tidak ada `Content-Length` pre-check**, dan untuk body >5 MB Vercel tetap mengalirkan byte sampai limit tercapai (bandwidth, bukan memori). Klasifikasi: **LOW** — dicatat, tidak dipatch (butuh konfigurasi platform, bukan kode).

**Keterbatasan yang diakui:** HEIC/HEIF dicek hanya `ftyp` di offset 4 — signature lemah dibanding JPEG/PNG/WEBP. Risiko rendah (server-side render tetap image), dicatat sebagai hardening masa depan.

---

## 5. H-2 — `pay_tagihan_bulanan`: **FIXED**

Business-logic review migrasi sprint 1 (versi efektif — menimpa 3 definisi sebelumnya: `20260417_finance_atomic_rpcs`, `20260520_expense_categories`, `20260524_recurring`; urutan CREATE OR REPLACE → definisi terakhir yang menang):

| Serangan | Hasil |
|---|---|
| Karyawan panggil RPC | Exception role guard (line: `Hanya admin yang dapat menandai tagihan lunas`) |
| Admin/super_admin panggil | Berhasil (alur legit utuh: mark paid + pengeluaran + recurring) |
| Replay `pay(id) ×3` | Call 1 sukses; call 2 & 3 exception `Tagihan sudah lunas` — cek status setelah `FOR UPDATE` dalam transaksi yang sama |
| Pengeluaran duplikat | Mustahil dari replay: INSERT pengeluaran hanya setelah guard status, dan guard + update + insert atomik |
| Tagihan already-paid (skenario beda jalur) | Ditolak sebelum mutasi apa pun |
| Nonexistent ID | `RAISE 'Tagihan tidak ditemukan.'` |
| NULL/invalid ID | PostgREST type error / `NOT FOUND` |
| Manipulasi parameter | Hanya `p_tagihan_id` + `p_proof_url` (text) — tidak ada parameter yang bisa melewati role guard |

**Catatan verifikasi:** pengujian ini SEMANTIK dari source. Test eksekusi live (`\df+`, panggilan RPC sungguhan) tetap MANUAL VERIFICATION REQUIRED.

---

## 6. H-3 — `pay_fee_items`: **FIXED**

Versi efektif = migrasi sprint 1 (menimpa `20260417_finance_atomic_rpcs`, `20260417_fix`, `20260520`):

| Serangan | Hasil |
|---|---|
| Karyawan panggil RPC | Exception role guard |
| Replay penuh (IDs sama) | Call 2: semua ID sudah di `tagihan_fee_lunas_items` → `v_actual_transactions` kosong → **return early `items_inserted:0`** — TIDAK ada insert ke `pengeluaran`, `tagihan_fee_lunas`, `tagihan_fee_lunas_items` (state DB terverifikasi tidak berubah oleh alur kode) |
| IDs campur (sudah dibayar + belum) | Hanya yang belum dibayar masuk hitung & insert |
| IDs dari periode lain | Diterima jika marketing match & belum dibayar — by design (admin memang membayar silang periode); **bukan bypass** karena role admin sudah di-guard |
| `p_marketing_name` manipulasi | Fee dihitung dari transaksi yang `marketing_name = p_marketing_name` exact — tidak bisa membayar fee transaksi marketing lain dalam satu call |
| Dedupe per transaction_id | `ON CONFLICT DO NOTHING` + pre-filter `NOT EXISTS` dipertahankan |

---

## 7. M-1 — Storage Buckets

| Bucket | Referensi di source | Status |
|---|---|---|
| `ktp_images` | `FormTransaksiModern.jsx:357,446` — hanya sebagai *nama parameter* yang dipetakan ke folder Vercel Blob `ktp-images` | Tidak dipakai untuk Supabase Storage upload. Sprint 1: `public=false`. LIVE VERIFY REQUIRED |
| `transfer_proofs` | Idem (dipetakan ke `transfer-proofs`) | Idem |
| `tagihan_proofs` | Tidak ada referensi upload sama sekali (bukti tagihan via Vercel Blob `tagihan-proofs`) | Legacy — sprint 1: `public=false`. LIVE VERIFY REQUIRED |
| `transaction_receipts` | **AKTIF** — `ManajemenDeposit.jsx:315` mengunggah via `supabase.storage.from('transaction_receipts')` (path `refund_proofs/...`) | **TIDAK ada di schema repo** (dibuat manual di dashboard). Visibility tidak diketahui dari source. **MANUAL PRODUCTION VERIFICATION REQUIRED** |
| `transaction_receipts` public URL | `getPublicUrl` tidak dipakai di repo (grep nihil) | Tidak ada generasi URL publik dari kode |

**Klarifikasi penting `transaction_receipts`:** bukan legacy — dipakai alur "Return Deposit" (admin). Karena upload via `supabase.storage` dengan sesi user, RLS storage berlaku untuk INSERT (default Supabase: tidak ada policy = ditolak; jika upload ini berfungsi di production, berarti ada policy yang tidak ada di repo). Dua kemungkinan risiko: (a) bucket public → bukti refund readable anonim; (b) policy storage permisif. **Ini temuan MEDIUM baru** — tidak dipatch dari repo karena schema bucket tidak ada di source; aksinya verifikasi dashboard + tambahkan ke migrasi berikutnya.

---

## 8. Attack Chain Status

| Chain | Status | Link yang putus |
|---|---|---|
| A — self-signup → escalate → admin RPC | **BROKEN (×2)** | (1) signup path dihapus dari app + dashboard signup harus OFF (MANUAL VERIFY); (2) bahkan dengan akun baru, write `user_roles` ditolak RLS → tidak bisa jadi super_admin → admin RPC unreachable |
| B — anonim → `/api/blob` → PII | **BROKEN** | Link pertama: anonim → 401. Tanpa JWT valid + ownership, tidak sampai ke Blob |
| C — employee → pay RPC → replay → fake expenses | **BROKEN** | (1) role guard menolak employee di kedua RPC; (2) bahkan admin tidak bisa replay (status guard / NOT-EXISTS pre-filter) |
| D — employee → PostgREST → financial SELECT | **MASIH TERBUKA — SESUAI RENCANA** | Ini M-3, sengaja tidak dikerjakan di sprint 1. Terdokumentasi; jangan klaim fully secure |

---

## 9. Test Quality Audit (69 security tests)

| Suite | Klasifikasi | Alasan |
|---|---|---|
| `blob-api.security.test.js` | **STRONG** | Verifikasi status + **negatif-eksekusi** (`global.fetch` tidak dipanggil untuk akses ditolak) — membuktikan bukan sekadar status code |
| `upload-api.security.test.js` | **STRONG** | `put()` tidak terpanggil pada folder traversal; pathname final diverifikasi bersih; magic-bytes mismatch nyata |
| `blob-adversarial-1_5.security.test.js` | **STRONG** | 17 bypass encoding/casing/wildcard; assert fetch-not-called |
| `upload-adversarial-1_5.security.test.js` | **STRONG** | 12 bypass kredensial/filename/MIME; assert put-not-called |
| `sprint1-migration.security.test.js` | **MEDIUM** | Static verification (substring SQL). Valid untuk memastikan kontrol ADA di migrasi, tapi tidak membuktikan efektif di DB live. Dilengkapi manual checklist. 1 test string-match murni (bucket UPDATE) — tetap cukup karena konteks file tunggal |

Tidak ada test WEAK. Tidak ada test yang lulus sementara implementasi rentan — diverifikasi dengan membaca handler line-by-line bersebelahan dengan assert test.

---

## 10. Production Verification Required (SOURCE VERIFIED ≠ LIVE VERIFIED)

1. **Supabase dashboard → Authentication:** Enable Signup = OFF (M-4).
2. **Supabase dashboard → Storage:** visibility `ktp_images`, `transfer_proofs`, `tagihan_proofs` = Private (setelah migrasi); **`transaction_receipts` = cek & set Private** (temuan baru §7).
3. **Supabase SQL editor:** `\dp public.user_roles` → hanya 2 policy SELECT; `\df+ public.is_super_admin()` → SECURITY DEFINER + search_path; `\df+ pay_tagihan_bulanan/pay_fee_items` → versi sprint 1 (ada role guard di body).
4. **Live RPC test** dengan akun karyawan: `select pay_tagihan_bulanan(1)` → exception role; `update user_roles set role='super_admin'` → 0 rows.
5. **Vercel env:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`/`VITE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `BLOB_READ_WRITE_TOKEN`, `VERCEL_BLOB_STORE_ID`, `BLOB_OBJECT_ACCESS=private`.
6. **Live smoke:** curl `/api/blob?pathname=<ktp>` anonim → 401; login → KTP tampil; karyawan upload tagihan-proof via curl → 403.
7. **Purge CDN cache** lama yang memuat respons `/api/blob` dengan `Cache-Control: public`.

---

## 11. New Findings

| ID | Severity | Item |
|---|---|---|
| N-1 | **MEDIUM** | Bucket `transaction_receipts` aktif dipakai (deposit refund) tapi tidak ada di schema repo — visibility & policy storage tidak diketahui/terdokumentasi. Tindakan: verifikasi dashboard, lalu tambahkan definisi bucket + policy ke migrasi sprint 2. (Bukan regresi sprint 1 — sudah ada sebelumnya, kini terklasifikasi.) |
| N-2 | **LOW** | `/api/upload` tidak pre-check `Content-Length`; body >5 MB mengalir sampai limit (bandwidth, bukan memori). Platform-level fix. |
| N-3 | **LOW** | Cookie `kr_blob_session` tidak dihapus saat sign-out klien (kadaluarsa ≤55 menit, tidak diperbarui, tidak memberi hak ekstra). Hardening opsional: `DELETE /api/blob-session` sudah tersedia — panggil dari `signOut()`. |
| N-4 | **INFO** | HEIC/HEIF magic-byte check lemah (`ftyp` offset 4 saja). |

---

## 12. Recommendation

**SIAP untuk Sprint 2** — dengan syarat manual verification §10 dijalankan paralel (khususnya #2 & #3). Tidak ada regresi sprint 1; semua chain kritis terputus di level source; N-1 masuk daftar kerja sprint 2 bersama M-5/M-3/LOW-1..3.

Gate record: security tests **69/69 PASS** · full suite **93/93 PASS** (14 files, termasuk property tests) · lint **7 errors, semua pre-existing** (`.roo/skills/*/dist`, `FormTransaksi.jsx`) · build **PASS** (`vite build`, 18.05s).
