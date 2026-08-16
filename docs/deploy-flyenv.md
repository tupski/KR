# Panduan Setup KR (Kakarama Room) dengan FlyEnv

Dokumentasi lengkap untuk menjalankan aplikasi KR secara lokal menggunakan FlyEnv di Windows.

---

## Daftar Isi

1. [Tentang FlyEnv](#tentang-flyenv)
2. [Instalasi FlyEnv](#instalasi-flyenv)
3. [Layanan yang Tersedia di FlyEnv](#layanan-yang-tersedia-di-flyenv)
4. [Setup Project KR dengan FlyEnv](#setup-project-kr-dengan-flyenv)
5. [Konfigurasi Layanan](#konfigurasi-layanan)
6. [Koneksi Database](#koneksi-database)
7. [Workflow Development](#workflow-development)
8. [Troubleshooting](#troubleshooting)
9. [Tips dan Best Practices](#tips-dan-best-practices)

---

## Tentang FlyEnv

FlyEnv adalah aplikasi **local development environment** untuk Windows yang menyediakan GUI untuk mengelola berbagai server dan service secara lokal. Mirip dengan XAMPP, Laragon, atau MAMP, FlyEnv memudahkan developer untuk setup environment development tanpa perlu instalasi manual setiap komponen.

### Perbandingan dengan Tools Lain

| Fitur | FlyEnv | XAMPP | Laragon |
|-------|--------|-------|---------|
| GUI Management | ✅ | ❌ | ✅ |
| Multi-version Support | ✅ | ❌ | ✅ |
| Node.js Built-in | ✅ | ❌ | ✅ |
| PostgreSQL Built-in | ✅ | ❌ | ❌ |
| MongoDB Built-in | ✅ | ❌ | ❌ |
| Redis Built-in | ✅ | ❌ | ❌ |
| Auto-start on Boot | ✅ | ✅ | ✅ |
| SSL/HTTPS Local | ✅ | ⚠️ Manual | ⚠️ Manual |

### Keuntungan Menggunakan FlyEnv

- **All-in-One Solution**: Tidak perlu install Node.js, database, dan web server secara terpisah
- **GUI yang Intuitif**: Kelola semua service dari satu dashboard
- **Multi-Version**: Install dan switch antar versi Node.js, PHP, dll dengan mudah
- **Portable**: Bisa dijalankan dari USB drive (portable mode)
- **Resource Efficient**: Hanya jalankan service yang dibutuhkan
- **Isolated Environment**: Setiap project bisa punya konfigurasi berbeda

---

## Instalasi FlyEnv

### System Requirements

| Komponen | Requirement |
|----------|-------------|
| OS | Windows 10/11 (64-bit) |
| RAM | Minimal 4GB (8GB direkomendasikan) |
| Storage | Minimal 2GB untuk FlyEnv + space untuk services |
| CPU | 64-bit processor |

### Langkah 1: Download FlyEnv

1. Kunjungi website resmi FlyEnv: [https://flyenv.app](https://flyenv.app) atau [GitHub Releases](https://github.com/flyenv/flyenv/releases)
2. Download installer terbaru (`.exe` atau portable `.zip`)

### Langkah 2: Instalasi

**Opsi A: Installer (Direkomendasikan)**

```powershell
# Jalankan installer yang sudah didownload
# Ikuti wizard instalasi
# Lokasi default: C:\Program Files\FlyEnv
```

**Opsi B: Portable**

```powershell
# Extract file .zip ke lokasi pilihan Anda
# Misalnya: D:\Tools\FlyEnv
# Jalankan FlyEnv.exe
```

### Langkah 3: First-time Setup

1. Jalankan FlyEnv pertama kali
2. FlyEnv akan meminta izin untuk membuat folder data
3. Pilih lokasi penyimpanan data services (default di Documents)
4. Tunggu proses inisialisasi selesai

### Struktur Folder FlyEnv

```
FlyEnv/
├── bin/                    # Binary executables
├── data/                   # Data services (MySQL, PostgreSQL, dll)
├── logs/                   # Log files
├── config/                 # Konfigurasi services
└── www/                    # Default web root (opsional)
```

---

## Layanan yang Tersedia di FlyEnv

FlyEnv menyediakan berbagai service yang bisa di-install dan dikelola melalui GUI:

### Web Servers

#### Nginx
- **Fungsi**: Web server dan reverse proxy
- **Kegunaan untuk KR**: Serve frontend yang sudah di-build, reverse proxy ke backend
- **Port Default**: 80, 443
- **Konfigurasi**: [`nginx.conf`](config/nginx.conf)

#### Apache HTTP Server
- **Fungsi**: Web server dengan .htaccess support
- **Kegunaan untuk KR**: Alternatif web server
- **Port Default**: 80, 443

### Runtime Environment

#### Node.js ⭐ Required untuk KR
- **Fungsi**: JavaScript runtime environment
- **Versi yang Dibutuhkan**: >= 18.0.0 (LTS direkomendasikan)
- **Kegunaan untuk KR**: 
  - Menjalankan development server (Vite)
  - Menjalankan backend Express.js
  - Build production bundle
- **Port Default**: Development server biasanya 5173, backend 3001

#### PHP
- **Fungsi**: Server-side scripting language
- **Versi**: 7.x, 8.x
- **Kegunaan**: Opsional, tidak diperlukan untuk KR

#### Python
- **Fungsi**: Programming language
- **Kegunaan**: Opsional, untuk scripting tambahan

#### Tomcat
- **Fungsi**: Java servlet container
- **Port Default**: 8080

### Database

#### MySQL
- **Fungsi**: Relational database
- **Port Default**: 3306
- **Kegunaan untuk KR**: Opsional, KR menggunakan Supabase (PostgreSQL)

#### MariaDB
- **Fungsi**: MySQL fork dengan fitur tambahan
- **Port Default**: 3306
- **Kegunaan**: Opsional

#### PostgreSQL ⭐ Compatible dengan Supabase
- **Fungsi**: Advanced open-source database
- **Port Default**: 5432
- **Kegunaan untuk KR**: Testing lokal dengan struktur yang sama dengan Supabase
- **Note**: Supabase menggunakan PostgreSQL, jadi bisa digunakan untuk testing lokal

#### MongoDB
- **Fungsi**: NoSQL document database
- **Port Default**: 27017
- **Kegunaan**: Opsional

### Caching

#### Redis
- **Fungsi**: In-memory data store, caching, message broker
- **Port Default**: 6379
- **Kegunaan untuk KR**: Opsional, untuk caching dan session management

#### Memcached
- **Fungsi**: Distributed memory caching
- **Port Default**: 11211
- **Kegunaan**: Opsional

### Other Services

#### FTP Server
- **Fungsi**: File transfer server
- **Port Default**: 21
- **Kegunaan**: Opsional, untuk file management

---

## Setup Project KR dengan FlyEnv

### Langkah 1: Install Node.js via FlyEnv

1. Buka FlyEnv GUI
2. Klik tab **Node.js**
3. Klik **Download/Install**
4. Pilih versi Node.js LTS terbaru (minimal v18.x)
5. Tunggu proses download dan instalasi selesai
6. Verifikasi instalasi:

```powershell
# Buka terminal dari FlyEnv atau Windows Terminal
node --version
# Output: v18.x.x atau lebih tinggi

npm --version
# Output: 9.x.x atau lebih tinggi
```

### Langkah 2: Konfigurasi Versi Node.js

Jika sudah install beberapa versi Node.js:

1. Di FlyEnv GUI, tab Node.js
2. Pilih versi yang diinginkan
3. Klik **Switch Version** atau **Apply**
4. Restart terminal untuk melihat perubahan

### Langkah 3: Clone/Copy Project KR

```powershell
# Jika dari Git
git clone https://github.com/username/kr-project.git
cd kr-project

# Atau copy folder project ke lokasi kerja
# Misalnya: D:\Projects\KR
```

### Langkah 4: Install Dependencies

```powershell
# Di root project KR
cd D:\Projects\KR

# Install dependencies frontend
npm install

# Install dependencies backend
cd apps/server
npm install
cd ../..
```

### Langkah 5: Setup Environment Variables

Buat file `.env` di folder [`apps/server/`](apps/server/):

```env
# Database - Supabase (Cloud)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# Server Configuration
PORT=3001
NODE_ENV=development

# JWT Secret
JWT_SECRET=your-jwt-secret-key

# Storage (opsional)
STORAGE_PROVIDER=local
UPLOAD_DIR=./uploads
```

### Langkah 6: Jalankan Development Server

**Terminal 1 - Frontend (Vite Dev Server):**

```powershell
# Di root project
npm run dev
# Frontend berjalan di http://localhost:5173
```

**Terminal 2 - Backend (Express Server):**

```powershell
# Di folder apps/server
cd apps/server
npm run dev
# Backend berjalan di http://localhost:3001
```

### Langkah 7: Verifikasi Setup

1. Buka browser
2. Akses `http://localhost:5173`
3. Pastikan halaman login KR muncul
4. Cek API dengan akses `http://localhost:3001/api/health`

---

## Konfigurasi Layanan

### Menggunakan Nginx untuk Serve Frontend (Production Build)

Setelah build production, Anda bisa gunakan Nginx untuk serve static files.

#### Langkah 1: Build Frontend

```powershell
# Di root project
npm run build
# Output di folder dist/
```

#### Langkah 2: Konfigurasi Nginx

1. Buka FlyEnv, tab Nginx
2. Klik **Install** jika belum terinstall
3. Start Nginx
4. Buka file konfigurasi (klik **Open Config**)

Edit konfigurasi:

```nginx
server {
    listen 80;
    server_name kr.local;
    
    # Frontend static files
    root D:/Projects/KR/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Reverse proxy ke backend API
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

#### Langkah 3: Setup Local Domain

Edit file `C:\Windows\System32\drivers\etc\hosts`:

```
127.0.0.1   kr.local
```

Restart Nginx dan akses `http://kr.local` di browser.

### Konfigurasi SSL/HTTPS Lokal

#### Opsi 1: Self-signed Certificate

```powershell
# Generate certificate menggunakan OpenSSL (via FlyEnv terminal)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout kr.local.key \
  -out kr.local.crt \
  -subj "/CN=kr.local"
```

Tambahkan ke konfigurasi Nginx:

```nginx
server {
    listen 443 ssl;
    server_name kr.local;
    
    ssl_certificate D:/Projects/KR/certs/kr.local.crt;
    ssl_certificate_key D:/Projects/KR/certs/kr.local.key;
    
    # ... rest of config
}

# Redirect HTTP ke HTTPS
server {
    listen 80;
    server_name kr.local;
    return 301 https://$server_name$request_uri;
}
```

#### Opsi 2: Mkcert (Direkomendasikan)

```powershell
# Install mkcert
# Download dari https://github.com/FiloSottile/mkcert/releases

# Setup CA
mkcert -install

# Generate certificate
mkcert kr.local localhost 127.0.0.1
```

### Reverse Proxy untuk Backend API

Konfigurasi lengkap untuk production-like setup:

```nginx
upstream backend {
    server localhost:3001;
    keepalive 64;
}

server {
    listen 80;
    server_name kr.local;
    
    # Frontend
    root D:/Projects/KR/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # API Proxy
    location /api/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Host $http_host;
        proxy_set_header X-NginX-Proxy true;
        proxy_set_header Connection "";
        
        # Timeouts
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }
    
    # Upload limit
    client_max_body_size 10M;
}
```

---

## Koneksi Database

### Koneksi ke Supabase (Cloud)

KR menggunakan Supabase sebagai database utama. Konfigurasi sudah ada di environment variables.

#### Verifikasi Koneksi

```javascript
// Test connection
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const { data, error } = await supabase.from('profiles').select('*').limit(1);
console.log('Connection test:', error ? 'Failed' : 'Success');
```

### Setup PostgreSQL Lokal via FlyEnv (Opsional)

Untuk testing dengan database lokal:

#### Langkah 1: Install PostgreSQL di FlyEnv

1. Buka FlyEnv, tab PostgreSQL
2. Klik **Install**
3. Pilih versi (15.x atau terbaru)
4. Set password untuk user `postgres`
5. Start service

#### Langkah 2: Buat Database

```powershell
# Via pgAdmin atau psql
CREATE DATABASE kr_local;
```

#### Langkah 3: Jalankan Migrations

```powershell
# Copy struktur dari Supabase
# Atau gunakan file migrations di database/migrations/

# Via psql
psql -U postgres -d kr_local -f database/migrations/001_extensions.sql
psql -U postgres -d kr_local -f database/migrations/002_auth_tables.sql
# ... dan seterusnya
```

#### Langkah 4: Update Environment Variables

```env
# Untuk testing lokal, gunakan PostgreSQL lokal
DATABASE_URL=postgresql://postgres:password@localhost:5432/kr_local
```

### Environment Variables Setup

Buat file `.env` lengkap:

```env
# ============= Supabase (Production) =============
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ============= Server =============
PORT=3001
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key

# ============= Storage =============
STORAGE_PROVIDER=local
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

# ============= Optional: Local PostgreSQL =============
# DATABASE_URL=postgresql://postgres:password@localhost:5432/kr_local

# ============= Optional: Redis =============
# REDIS_URL=redis://localhost:6379
```

---

## Workflow Development

### Starting/Stopping Services via FlyEnv GUI

**Start Services:**

1. Buka FlyEnv
2. Pada tab service yang dibutuhkan (Node.js, Nginx, dll)
3. Klik **Start**
4. Status akan berubah menjadi hijau/running

**Stop Services:**

1. Klik **Stop** pada service yang sedang running
2. Atau klik **Stop All** untuk menghentikan semua services

**Auto-start on Boot:**

1. Klik **Settings** di FlyEnv
2. Centang **Auto-start services on Windows boot**
3. Pilih services yang ingin auto-start

### Viewing Logs di FlyEnv

1. Pilih service yang running
2. Klik **Logs** atau **View Logs**
3. Log akan ditampilkan di panel bawah

**Atau via file:**

```
FlyEnv/logs/
├── nginx-error.log
├── postgresql.log
├── nodejs.log
└── ...
```

**Untuk KR Project:**

```powershell
# Frontend logs (di terminal)
npm run dev

# Backend logs (di terminal terpisah)
cd apps/server && npm run dev

# Atau dengan logging ke file
npm run dev 2>&1 | tee logs/dev.log
```

### Hot Reload dan Development Tips

**Frontend (Vite):**

- Hot Module Replacement (HMR) otomatis aktif
- Perubahan langsung terlihat tanpa refresh

**Backend (Nodemon):**

```json
// apps/server/package.json
{
  "scripts": {
    "dev": "nodemon src/server.js"
  }
}
```

**Tips:**

1. Gunakan dua terminal terpisah untuk frontend dan backend
2. Install Nodemon untuk auto-restart backend saat ada perubahan
3. Gunakan VS Code dengan extension untuk debugging

### Building untuk Production Lokal

**Langkah 1: Build Frontend**

```powershell
npm run build
# Output di folder dist/
```

**Langkah 2: Prepare Backend**

```powershell
cd apps/server
npm run build  # Jika ada build step
# Atau langsung jalankan
npm start
```

**Langkah 3: Serve dengan Nginx**

1. Copy isi folder `dist/` ke web root Nginx
2. Atau update konfigurasi Nginx untuk point ke `dist/`
3. Restart Nginx

**Langkah 4: Start Backend dengan PM2 (Opsional)**

```powershell
# Install PM2 globally
npm install -g pm2

# Start backend
cd apps/server
pm2 start src/server.js --name kr-backend

# Auto-restart on boot
pm2 startup
pm2 save
```

---

## Troubleshooting

### Masalah Umum FlyEnv di Windows

#### Port Already in Use

**Gejala:** Service tidak bisa start, error "Port X already in use"

**Solusi:**

```powershell
# Cek apa yang menggunakan port
netstat -ano | findstr :80
netstat -ano | findstr :3001
netstat -ano | findstr :5173

# Kill process yang menggunakan port
taskkill /PID <process_id> /F

# Atau ganti port di konfigurasi FlyEnv
```

#### Service Not Starting

**Gejala:** Service stuck di "Starting..." atau langsung stopped

**Solusi:**

1. Cek logs di FlyEnv GUI
2. Pastikan port tidak bentrok dengan service lain
3. Jalankan FlyEnv sebagai Administrator
4. Cek antivirus/firewall yang mungkin memblokir

```powershell
# Jalankan sebagai Admin
# Right-click FlyEnv.exe → Run as Administrator
```

#### Permission Denied

**Gejala:** Error "Permission denied" saat install atau start service

**Solusi:**

1. Jalankan FlyEnv sebagai Administrator
2. Cek folder permissions
3. Disable sementara antivirus

```powershell
# Grant permissions ke folder FlyEnv
icacls "D:\Tools\FlyEnv" /grant Users:F /T
```

### Masalah Spesifik KR Project

#### Module Not Found

**Gejala:** `Error: Cannot find module 'xxx'`

**Solusi:**

```powershell
# Clear cache dan install ulang
rm -rf node_modules
rm package-lock.json
npm cache clean --force
npm install

# Untuk backend
cd apps/server
rm -rf node_modules
npm install
```

#### Database Connection Failed

**Gejala:** `Error: connect ECONNREFUSED` atau Supabase error

**Solusi:**

1. Cek koneksi internet
2. Verifikasi SUPABASE_URL dan SUPABASE_ANON_KEY
3. Cek apakah IP di-whitelist di Supabase dashboard

```powershell
# Test koneksi
curl https://your-project.supabase.co/rest/v1/ \
  -H "apikey: your-anon-key"
```

#### CORS Error

**Gejala:** Browser menampilkan CORS error

**Solusi:**

Pastikan backend sudah dikonfigurasi dengan benar di [`apps/server/src/middleware/cors.middleware.js`](apps/server/src/middleware/cors.middleware.js):

```javascript
// cors.middleware.js
const cors = require('cors');

const corsOptions = {
  origin: ['http://localhost:5173', 'http://kr.local'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

module.exports = cors(corsOptions);
```

#### Build Failed

**Gejala:** `npm run build` error

**Solusi:**

```powershell
# Clear Vite cache
rm -rf node_modules/.vite

# Clear npm cache
npm cache clean --force

# Install ulang dependencies
npm install

# Coba build lagi
npm run build
```

---

## Tips dan Best Practices

### Auto-start Services on Windows Boot

1. Buka FlyEnv Settings
2. Aktifkan **Launch on Startup**
3. Pilih services yang ingin auto-start:
   - ✅ Node.js (jika selalu develop)
   - ✅ Nginx (jika perlu serve local sites)
   - ❌ PostgreSQL (hanya saat dibutuhkan)
   - ❌ Redis (hanya saat dibutuhkan)

### Membuat Multiple Environments

**Struktur Folder:**

```
D:\Projects\
├── KR\                    # Development
│   ├── .env.development
│   └── ...
├── KR-staging\            # Staging
│   ├── .env.staging
│   └── ...
└── KR-production\         # Production local test
    ├── .env.production
    └── ...
```

**Konfigurasi Nginx untuk Multiple Sites:**

```nginx
# kr-dev.local
server {
    listen 80;
    server_name kr-dev.local;
    root D:/Projects/KR/dist;
    # ...
}

# kr-staging.local
server {
    listen 80;
    server_name kr-staging.local;
    root D:/Projects/KR-staging/dist;
    # ...
}
```

### Backup Konfigurasi

**Backup FlyEnv Config:**

```powershell
# Copy folder konfigurasi
Copy-Item "C:\Users\$env:USERNAME\Documents\FlyEnv\config" `
  -Destination "D:\Backups\FlyEnv-config" -Recurse
```

**Backup Project Environment:**

```powershell
# Backup .env files (jangan commit ke Git!)
# Simpan di lokasi aman dengan encryption
```

### Performance Optimization

**Node.js:**

- Gunakan versi LTS untuk stabilitas
- Monitor memory usage dengan `process.memoryUsage()`

**Nginx:**

- Enable gzip compression
- Set proper caching headers
- Use `worker_processes auto;`

**Database:**

- Gunakan connection pooling
- Index kolom yang sering di-query
- Regular VACUUM untuk PostgreSQL

### Security Tips untuk Development

1. **Jangan commit .env files** ke Git
2. Gunakan API keys yang berbeda untuk development dan production
3. Enable SSL untuk testing HTTPS
4. Update dependencies secara berkala:

```powershell
# Check outdated packages
npm outdated

# Update minor/patch versions
npm update

# Update major versions (review changelog dulu!)
npm install package@latest
```

### Useful Commands

```powershell
# Check Node.js version
node --version

# Check npm packages
npm list --depth=0

# Kill all Node processes
taskkill /im node.exe /f

# Check open ports
netstat -ano | findstr LISTENING

# Clear DNS cache (untuk local domain)
ipconfig /flushdns

# Check system resources
Get-Process | Sort-Object CPU -Descending | Select-Object -First 10
```

---

## Checklist Setup Lengkap

- [ ] FlyEnv terinstall dan berjalan
- [ ] Node.js >= 18.0.0 terinstall via FlyEnv
- [ ] Project KR sudah di-clone/copy
- [ ] Dependencies terinstall (`npm install`)
- [ ] File `.env` sudah dikonfigurasi
- [ ] Frontend berjalan di `http://localhost:5173`
- [ ] Backend berjalan di `http://localhost:3001`
- [ ] Koneksi ke Supabase berhasil
- [ ] Login ke aplikasi berhasil
- [ ] (Opsional) Nginx terkonfigurasi untuk local domain
- [ ] (Opsional) SSL/HTTPS aktif untuk testing

---

*Dokumentasi terakhir diperbarui: Agustus 2026*
