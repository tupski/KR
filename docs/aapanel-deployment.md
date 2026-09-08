# Panduan Deployment aaPanel (KR Self-Hosted)

## 1. Arsitektur Target
```text
                    Internet (HTTPS Port 443)
                               │
                               ▼
                   aaPanel Nginx (Reverse Proxy)
                               │
                               ▼
                   http://127.0.0.1:3000
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
     Docker: kr-app                       Docker: kr-postgres
     Node.js 24.20.0 (Port 3000)          PostgreSQL 16 (Port 5432)
            │                                     │
            ▼                                     ▼
     Mount Persistent:                     Mount Persistent:
     /www/wwwroot/kr/storage               kr_pgdata volume
```

---

## 2. Persiapan di aaPanel
1. Masuk ke panel aaPanel Anda.
2. Install modul **Docker Manager** melalui App Store aaPanel (atau pastikan `docker` & `docker compose` sudah aktif via terminal server).
3. Buat direktori project di server:
   ```bash
   mkdir -p /www/wwwroot/kr/storage
   cd /www/wwwroot/kr
   ```
4. Atur kepemilikan direktori storage ke user kontainer (UID 1001):
   ```bash
   chown -R 1001:1001 /www/wwwroot/kr/storage
   chmod -R 755 /www/wwwroot/kr/storage
   ```

---

## 3. Menyiapkan Repositori & Environment
1. Clone project atau upload source code branch `docker-local` ke `/www/wwwroot/kr`.
2. Buat berkas `.env` dari template:
   ```bash
   cp .env.example .env
   nano .env
   ```
3. Sesuaikan variabel di `.env`:
   - `POSTGRES_PASSWORD`: Password database yang kuat.
   - `JWT_SECRET`: Minimal 32 karakter acak.
   - `STORAGE_DRIVER`: `local`.
   - `APP_URL`: Domain produksi Anda (misal `https://admin.kakaramaroom.com`).

---

## 4. Menjalankan Docker Stack
Jalankan perintah berikut di `/www/wwwroot/kr`:
```bash
# Build dan jalankan background container
docker compose up -d --build

# Periksa status container
docker compose ps

# Periksa logs jika diperlukan
docker compose logs -f app
```

---

## 5. Konfigurasi Reverse Proxy Nginx di aaPanel
1. Buka menu **Website** > **Add Site** di aaPanel.
2. Masukkan Domain Anda (misal `admin.kakaramaroom.com`).
3. Aktifkan **SSL** menggunakan Let's Encrypt (DNS / File verification).
4. Masuk ke pengaturan website > tab **Reverse Proxy** > klik **Add Reverse Proxy**:
   - Proxy Name: `kr-backend`
   - Target URL: `http://127.0.0.1:3000`
   - Sent Domain: `$host`
5. Tambahkan konfigurasi proxy berikut di tab konfigurasi Nginx situs Anda untuk mendukung upload berkas dan websocket:
   ```nginx
   client_max_body_size 50M;

   location / {
       proxy_pass http://127.0.0.1:3000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection 'upgrade';
       proxy_set_header Host $host;
       proxy_cache_bypass $http_upgrade;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

---

## 6. Prosedur Pembaruan Aplikasi (Update Workflow)
Saat ada update kode di repositori:
```bash
cd /www/wwwroot/kr
git pull origin docker-local
docker compose up -d --build app
```
Proses ini tidak akan menghapus data PostgreSQL maupun berkas media yang tersimpan di volume persistent.

---

## 7. Strategi Backup Otomatis
1. **Database PostgreSQL:**
   Buat cronjob di aaPanel (Cron tab):
   ```bash
   docker exec kr-postgres pg_dump -U kr_user kr_production | gzip > /www/backup/database/kr_db_$(date +\%Y\%m\%d_\%H\%M\%S).sql.gz
   ```
2. **Media Storage:**
   Backup folder `/www/wwwroot/kr/storage` secara berkala via Cron aaPanel (Directory backup).
