# Panduan Tarik Data: Supabase → Lokal & Vercel Blob → Lokal/R2

> Semua perintah dijalankan dari root repo `D:\Projects\KR` (Windows, git-bash).
> Tools: `tools/migrate-supabase-db.js`, `tools/migrate-vercel-blob.js`, `tools/verify-migration.js`.

---

## 0. Persiapan (sekali)

### 0.1 Expose Postgres lokal ke host (sudah disiapkan)
`docker-compose.override.yml` sudah dibuat — mem-buka `127.0.0.1:5432` untuk kebutuhan
migrasi dari host. **Jangan bawa file ini ke aaPanel produksi.**

```bash
docker compose up -d          # postgres jadi reachable di 127.0.0.1:5432
docker compose ps             # pastikan kr-postgres healthy
```

### 0.2 Kumpulkan kredensial sumber

| Apa | Dari mana | Dipakai untuk |
|---|---|---|
| **Supabase DB password** | Supabase Dashboard → Project Settings → Database → Database password (reset bila lupa) | `MIGRATION_SUPABASE_DB_URL` |
| **Supabase project ref** | URL project: `https://<REF>.supabase.co` | menyusun connection string |
| **Vercel Blob token** | Vercel Dashboard → Storage → blob store kamu → `.env.local` / Environment Variables → `BLOB_READ_WRITE_TOKEN` | `MIGRATION_VERCEL_BLOB_TOKEN` |

### 0.3 Connection string Supabase (PENTING — soal IPv4/IPv6)

Port langsung `db.<REF>.supabase.co:5432` itu **IPv6-only** untuk project baru — kebanyakan
koneksi rumah/VPS Windows hanya punya IPv4, jadi `pg_dump` akan gagal resolve/timeout.
**Gunakan Session Pooler (IPv4):**

```text
postgresql://postgres.<REF>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:5432/postgres
```

`<REGION>` lihat di Dashboard → Database → Connection string (pilih "Session pooler",
bukan "Transaction pooler" — pg_dump butuh koneksi sesi panjang). Contoh region: `ap-southeast-1`.

---

## 1. Tarik Semua Data Supabase → PostgreSQL Lokal

Tahap per tahap (semuanya non-destructive; dump tidak pernah mengubah sumber):

### 1.1 Set environment (bash)

```bash
cd /d/Projects/KR

# Sumber (Session Pooler, IPv4-safe)
export MIGRATION_SUPABASE_DB_URL="postgresql://postgres.<REF>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:5432/postgres"

# Target lokal (lewat 127.0.0.1 karena menjalankan dari host)
export MIGRATION_TARGET_DB_URL="postgresql://kr_user:kr_test_pw_a7f3c9e2@127.0.0.1:5432/kr_production"
```

### 1.2 Export (pg_dump)

```bash
# Lihat dulu perintah yang akan dijalankan (tidak mengeksekusi):
npm run migration:db -- export --dry-run

# Eksekusi:
npm run migration:db -- export
```

Hasil: `migration/database/<timestamp>/dump.sql` + `manifest.json`
(berisi SHA-256 + ukuran + versi server sumber). Dump memuat schema `public` **plus**
`auth.users` & `auth.identities` (sumber hash password).

### 1.3 Prepare target (roles, schema auth/storage, shim auth.uid)

```bash
npm run migration:db -- prepare-target
```

> Target lokal sudah perah di-apply schema test, tapi langkah ini idempotent — aman diulang.
> Ia membuat role `authenticated`/`supabase_admin`, schema `auth`+`storage`, shim
> `auth.uid()/auth.role()`, dan tabel native `users`/`password_resets`.

### 1.4 Restore (TANPA --clean — tidak menghapus apa pun)

```bash
npm run migration:db -- restore
```

Error yang wajar & aman diabaikan saat restore ke DB yang sudah berisi schema:
`already exists` (skip), `cannot change return type` (fungsi versi lama — versi terakhir
yang menang sudah benar). Error **fatal** yang harus berhenti: `OUT OF MEMORY`,
`connection refused`, `permission denied`.

### 1.5 Perbaiki sequence + migrasi akun

```bash
npm run migration:db -- fix-sequences   # serial = MAX(id)
npm run migration:db -- auth            # auth.users -> public.users (hash bcrypt DIPERTAHANKAN; user login dgn password lama)
```

Langkah `auth`:
- hash `$2a$/$2b$` → tersalin utuh, `require_password_reset=false`
- hash format aneh/kosong → `require_password_reset=true` (wajib reset lewat admin)

### 1.6 Verifikasi

```bash
npm run migration:db -- verify
```

Membandingkan sumber vs target: daftar tabel, row count per tabel, sequence, FK.
**Wajib semua PASS** sebelum lanjut. Cek manual tambahan:

```bash
docker exec kr-postgres psql -U kr_user -d kr_production -c \
  "SELECT (SELECT count(*) FROM transactions) tx, (SELECT count(*) FROM users) users, (SELECT count(*) FROM tagihan_bulanan) bills;"
```

Lalu buka `http://localhost:3000`, login dengan akun Supabase lama (email + password lama)
untuk membuktikan hash terbaca.

---

## 2. Tarik Semua Foto Vercel Blob → Lokal

### 2.1 Set environment

```bash
export MIGRATION_VERCEL_BLOB_TOKEN="vercel_blob_rw_...."
export STORAGE_DRIVER=local
# Target sementara di folder repo (nanti dipindah ke volume Docker):
export LOCAL_STORAGE_PATH="D:/Projects/KR/storage"
export MIGRATION_CONCURRENCY=3
export MIGRATION_MAX_RETRIES=3
```

### 2.2 Jalankan copy

```bash
npm run migration:blob -- migrate
```

Yang dilakukan tool: LIST semua objek → download (retry 3x) → hitung SHA-256 sumber →
tulis atomik (tmp → fsync → rename) → baca balik & cek SHA-256 target → baru catat
`success` di `migration/blobs/<timestamp>/manifest.jsonl`. File setengah jalan **tidak
mungkin** tercatat sukses. Ada objek yang sudah ada di target dengan isi sama → skip;
isi beda → dilaporkan `mismatch` (tidak ditimpa diam-diam).

Putus di tengah? Lanjut saja:

```bash
npm run migration:blob -- resume        # baca manifest lama, skip yang sudah terverifikasi
npm run migration:blob -- retry-failed  # ulangi khusus yang gagal
```

### 2.3 Pindahkan hasil ke volume Docker aplikasi

File harus masuk volume `kr_storage` (di-mount ke `/app/storage` di container kr-app):

```bash
# Salin ke dalam container, lalu perbaiki kepemilikan ke user non-root (UID 1001)
docker cp storage/. kr-app:/app/storage/
docker exec kr-app sh -c 'chown -R 1001:1001 /app/storage'

# Bersihkan folder kerja host (opsional)
# rm -rf storage
```

### 2.4 Verifikasi media

```bash
export MIGRATION_TARGET_DB_URL="postgresql://kr_user:kr_test_pw_a7f3c9e2@127.0.0.1:5432/kr_production"
npm run migration:verify
```

Tool ini: (a) membaca ulang SEMUA manifest, cek tiap objek `success` benar-benar ada di
target + re-check SHA-256 sampel; (b) scan kolom media di DB (`ktp_image_url`,
`transfer_proof_url`, `proof_url`, `avatar_url`, ...) — menghitung berapa referensi lama
Vercel vs key kanonik, dan apakah objek yang dirujuk ada. Exit code ≠ 0 bila ada yang
hilang/tidak cocok.

Cek visual satu file lewat aplikasi (login dulu di `http://localhost:3000`):

```bash
# contoh; ganti key dengan hasil dari manifest
curl -H "Authorization: Bearer <token>" "http://127.0.0.1:3000/api/blob?pathname=uploads/..." -o /dev/null -w "%{http_code}\n"
```

---

## 3. Nanti: Tarik Vercel Blob → Cloudflare R2

Tool yang SAMA — cukup ganti driver ke `s3`/`r2` (R2 = S3-compatible, satu implementasi).

### 3.1 Kredensial R2

Cloudflare Dashboard → R2 → **Create API Token** (Object Read & Write, scope ke bucket
target). Simpan:

| Variabel | Nilai |
|---|---|
| `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY_ID` | dari API token |
| `S3_SECRET_ACCESS_KEY` | dari API token |
| `S3_BUCKET` | nama bucket R2 |
| `S3_REGION` | `auto` |

### 3.2 Jalankan

```bash
export MIGRATION_VERCEL_BLOB_TOKEN="vercel_blob_rw_...."
export STORAGE_DRIVER=r2
export S3_ENDPOINT="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
export S3_ACCESS_KEY_ID="..."
export S3_SECRET_ACCESS_KEY="..."
export S3_BUCKET="kr-media"
export S3_REGION=auto

npm run migration:blob -- migrate     # resume / retry-failed bila terputus
```

Sifatnya sama: checksum dua sisi, resumable via manifest, mismatch tidak ditimpa.

### 3.3 Verifikasi R2

```bash
npm run migration:verify    # STORAGE_DRIVER=r2 + env R2 sudah diset
```

### 3.4 Aplikasi memakai R2

Di `.env` (lokal nanti produksi):

```text
STORAGE_DRIVER=r2
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET=kr-media
S3_REGION=auto
# OPSIONAL — kalau bucket diberi custom domain publik:
# S3_PUBLIC_DOMAIN=https://cdn.domainkamu.com
```

Tanpa `S3_PUBLIC_DOMAIN`, objek dilayani lewat proxy ter-autentikasi `/api/blob?pathname=...`
(aman untuk KTP/bukti transfer yang memang private). Dengan `S3_PUBLIC_DOMAIN`, URL publik
langsung ke CDN — **hanya untuk bucket yang memang boleh publik**.

---

## 4. Ringkasan urutan aman

```text
1. docker compose up -d                       # stack lokal jalan
2. DB:   export → prepare-target → restore → fix-sequences → auth → verify
3. Media: migration:blob (local) → docker cp ke volume → migration:verify
4. Uji manual: login akun lama, buka transaksi, lihat foto tampil
5. (nanti) ulangi migration:blob dengan STORAGE_DRIVER=r2 → verify
6. Cutover produksi: docs/production-cutover.md
```

Catatan: langkah 3 (blob→local) dan 5 (blob→R2) bisa juga dibalik — tarik langsung
Blob→R2 dulu, salin lokal dari R2. Tool menghitung checksum tiap kali, jadi aman.
