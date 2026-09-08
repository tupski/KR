# Panduan Deployment aaPanel (KR Self-Hosted)

> Target: **aaPanel di Ubuntu 24.04 VPS** — Docker stack (Node.js 24 + PostgreSQL 17) di belakang reverse proxy Nginx aaPanel.
> Branch: `docker-local`. Build image **tidak** berisi `.env` / secret — semua rahasia dibaca dari file `.env` saat runtime.

---

## 1. Arsitektur Target

```text
                    Internet (HTTPS Port 443)
                               │
                               ▼
                   aaPanel Nginx (Reverse Proxy, Let's Encrypt SSL)
                               │
                               ▼
                   http://127.0.0.1:3000
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
     Docker: kr-app                       Docker: kr-postgres
     Node.js 24.20.0 (Port 3000)          PostgreSQL 17 (persistent volume)
            │                                     │
            ▼                                     ▼
     Volume: kr_storage                   Volume: kr_pgdata
     /app/storage
```

Catatan versi: **PostgreSQL 17** (bukan 16) — menyamai versi server sumber Supabase agar `pg_restore` dump lintas-major tidak gagal. Diagram lama menyebut 16; gunakan 17.

---

## 2. Prasyarat

| Komponen | Keterangan |
|---|---|
| aaPanel | Ubuntu 24.04, Docker Manager module terinstall |
| Docker | `docker` + `docker compose` (v2) aktif |
| Domain | A-record mengarah ke IP VPS (mis. `admin.kakaramaroom.com`) |
| Port | 80/443 terbuka (Nginx), 3000 hanya loopback |

---

## 3. Persiapan di aaPanel

```bash
# 1. Install Docker via aaPanel App Store (Docker Manager) atau:
curl -fsSL https://get.docker.com | sh

# 2. Direktori project
mkdir -p /www/wwwroot/kr/storage
cd /www/wwwroot/kr

# 3. Upload / clone source branch docker-local ke /www/wwwroot/kr
git clone -b docker-local <repo-url> .

# 4. Storage milik user kontainer (UID 1001 = user `krapp` di image)
chown -R 1001:1001 /www/wwwroot/kr/storage
chmod 755 /www/wwwroot/kr/storage
```

---

## 4. Konfigurasi `.env`

```bash
cp .env.example .env
nano .env
```

Variabel **wajib** diisi (lihat `.env.example` untuk komentar lengkap):

| Variabel | Nilai | Keterangan |
|---|---|---|
| `POSTGRES_USER` | `kr_user` | user DB |
| `POSTGRES_PASSWORD` | *(acak kuat)* | password DB — **jangan sama dengan JWT** |
| `POSTGRES_DB` | `kr_production` | nama DB |
| `DATABASE_URL` | `postgresql://kr_user:***@postgres:5432/kr_production` | host = nama service compose `postgres` |
| `JWT_SECRET` | *(≥32 char acak)* | server menolak start jika pendek di production |
| `APP_URL` | `https://admin.kakaramaroom.com` | origin aplikasi |
| `COOKIE_SECURE` | `true` | wajib karena HTTPS |
| `STORAGE_DRIVER` | `local` | storage lokal (atau `s3`/`r2`) |
| `VITE_API_MODE` | `native` | **wajib** — mode self-hosted tanpa Supabase |

> ⚠️ Jangan set `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` di `.env` production.
> `VITE_API_MODE=native` membuat aplikasi berjalan **tanpa** Supabase runtime.
> Dockerfile meng-*default* `VITE_API_MODE=native` saat build (image tak bawa `.env`).

---

## 5. Menjalankan Stack

```bash
cd /www/wwwroot/kr

# Build image (VITE_API_MODE default native) + jalankan
docker compose up -d --build

# Status
docker compose ps

# Logs
docker compose logs -f app
```

Verifikasi kesehatan:

```bash
curl -s http://127.0.0.1:3000/health          # {"status":"ok",...}
curl -s http://127.0.0.1:3000/health/db       # {"status":"ok","database":"connected"}
```

---

## 6. Inisialisasi Database (dua jalur)

### Jalur A — Migrasi dari Supabase (data produksi ada)

```bash
# 1. Export dump dari Supabase (butuh MIGRATION_SUPABASE_DB_URL)
export MIGRATION_SUPABASE_DB_URL="postgresql://postgres:***@db.<ref>.supabase.co:5432/postgres"
npm run migration:db -- export

# 2. Siapkan target (roles, schema auth/storage, tabel native users)
export MIGRATION_TARGET_DB_URL="postgresql://kr_user:***@127.0.0.1:5432/kr_production"
npm run migration:db -- prepare-target

# 3. Restore (NON-destructive, tanpa --clean)
npm run migration:db -- restore

# 4. Perbaiki sequences + map auth.users -> public.users (bcrypt dipertahankan)
npm run migration:db -- fix-sequences
npm run migration:db -- auth

# 5. Verifikasi baris & tabel
npm run migration:db -- verify
```

### Jalur B — Fresh install (tanpa data lama)

Aplikasi **tidak** punya public signup (keamanan). Buat admin pertama lewat CLI:

```bash
export DATABASE_URL="postgresql://kr_user:***@127.0.0.1:5432/kr_production"

# Buat akun super_admin pertama (atau --role admin)
node tools/create-admin.js --email admin@kakaramaroom.com --password 'PilihPasswordKuat!' --role super_admin
```

> Skema business tables untuk fresh install belum di-otomatisasi penuh; bila
> memulai kosong, jalankan `supabase/supabase-schema.sql` + `supabase/migrations/*.sql`
> (urutan kronologis) pada database target, lalu `create-admin.js`. Jalur **A**
> (restore dump) adalah jalur yang didukung penuh & teruji — gunakan itu bila
> data produksi harus dipertahankan.

---

## 7. Konfigurasi Reverse Proxy Nginx (aaPanel)

1. **Website** → **Add Site**, isi domain (mis. `admin.kakaramaroom.com`).
2. Aktifkan **SSL** (Let's Encrypt) — DNS/File verification.
3. Pengaturan site → **Reverse Proxy** → **Add Reverse Proxy**:
   - Proxy Name: `kr-backend`
   - Target URL: `http://127.0.0.1:3000`
4. Konfigurasi proxy penting (file konfigurasi site):

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_read_timeout 300s;
    # Upload (foto KTP / bukti transfer) — jangan batasi terlalu kecil
    client_max_body_size 15m;
}
```

> Fastify `trustProxy: true` membaca `X-Forwarded-*` — pastikan header di atas ada agar
> rate-limit & originGuard memakai IP/asal benar.

---

## 8. Update Workflow

```bash
cd /www/wwwroot/kr
git pull origin docker-local
docker compose up -d --build app
```

Volume `kr_pgdata` & `kr_storage` persist — data tidak hilang saat container di-recreate.

---

## 9. Backup & Restore

### 9.1 Database (cron aaPanel)

```bash
# Setiap hari 03:00 — dump + gzip
docker exec kr-postgres pg_dump -U kr_user -d kr_production | gzip > /www/backup/database/kr_db_$(date +\%Y\%m\%d_\%H\%M\%S).sql.gz

# Retensi: hapus backup > 30 hari (cron terpisah)
find /www/backup/database -name "kr_db_*.sql.gz" -mtime +30 -delete
```

**Restore + verifikasi:**

```bash
# 1. Stop app agar tidak menulis selama restore
docker compose stop app

# 2. Restore ke database (buang DB lama hanya bila yakin backup valid)
gunzip -c /www/backup/database/kr_db_YYYYMMDD_HHMMSS.sql.gz | \
  docker exec -i kr-postgres psql -U kr_user -d kr_production

# 3. Verifikasi: jumlah baris tabel kunci
docker exec kr-postgres psql -U kr_user -d kr_production -c \
  "SELECT (SELECT count(*) FROM transactions) AS tx, (SELECT count(*) FROM users) AS users;"

# 4. Start lagi
docker compose start app
```

> Jangan percaya `pg_dump` exit 0 saja. Selalu **verifikasi row count** setelah restore.

### 9.2 Media

```bash
# Folder storage — backup berkala (aaPanel Directory backup / rsync)
#   /www/wwwroot/kr/storage  ->  /www/backup/storage/
rsync -a /www/wwwroot/kr/storage/ /www/backup/storage/$(date +\%Y\%m\%d)/
```

### 9.3 Konfigurasi & secret

`.env` (rahasia: `JWT_SECRET`, `POSTGRES_PASSWORD`, VAPID) — simpan salinan di lokasi aman kedua (password manager / vault). Tanpa `.env` yang benar, container **tidak** bisa start di production (fail-fast).

---

## 10. Pemecahan Masalah

| Gejala | Penyebab & Solusi |
|---|---|
| `/health` ok tapi `/health/db` 503 | `DATABASE_URL` salah / Postgres belum siap — cek `docker compose logs postgres` |
| Login selalu gagal | DB belum di-*seed* user (jalankan `create-admin.js`) ATAU role user salah |
| Halaman SPA blank / error "VITE_SUPABASE_URL tidak valid" | Build tanpa `VITE_API_MODE=native` — rebuild dengan `docker compose build --build-arg VITE_API_MODE=native` |
| Upload gagal 413 | Nginx `client_max_body_size` terlalu kecil (> 15m) |
| Upload gagal 415 | Tipe file tidak di allowlist (`UPLOAD_ALLOWED_MIME` / `UPLOAD_ALLOWED_EXT`) |
| Query data kosong padahal DB ada isinya | RLS aktif pasca-restore & server tidak set GUC `request.jwt.*` — pastikan image ≥ commit yang memuat `runAsActor` |
| 429 rate-limit | Wajar dari IP publik — naikkan `RATE_LIMIT_MAX` bila perlu |

---

## 11. Keamanan

- `.env` **tidak pernah** di-commit (`.gitignore`) dan tidak ikut image (`.dockerignore`).
- Postgres **tidak** di-expose ke publik (hanya network internal Docker).
- App hanya listen `127.0.0.1:3000` via Nginx.
- Cookie sesi: `HttpOnly`, `SameSite=Lax`, `Secure` (production).
- CORS allowlist ketat (originGuard) — bukan `*`.
- Image berjalan sebagai user non-root (`krapp`, UID 1001), `no-new-privileges`.
- Healthcheck aktif untuk app & postgres.

---

## 12. Rollback

Selama masa retensi 14–30 hari setelah cutover, **Vercel + Supabase lama dibiarkan hidup**:

- **Rollback traffic**: balikkan DNS A-record ke Vercel (`cname.vercel-dns.com`) — aplikasi lama langsung melayani.
- **Rollback DB**: tidak ada *zero-loss* setelah server baru menerima write — data baru di server self-hosted harus diekspor manual/delta bila ingin digabung.
- **Rollback media**: objek baru di storage self-hosted perlu disalin balik manual.
