# Panduan Deploy KR (Kakarama Room) ke AaPanel

Dokumentasi lengkap untuk men-deploy aplikasi KR ke server dengan AaPanel.

---

## Daftar Isi

1. [Prasyarat](#prasyarat)
2. [Instalasi AaPanel](#instalasi-aapanel)
3. [Setup Environment](#setup-environment)
4. [Konfigurasi Database Supabase](#konfigurasi-database-supabase)
5. [Deploy Backend dengan PM2](#deploy-backend-dengan-pm2)
6. [Build dan Deploy Frontend](#build-dan-deploy-frontend)
7. [Konfigurasi Nginx](#konfigurasi-nginx)
8. [Setup SSL/HTTPS](#setup-sslhttps)
9. [Troubleshooting](#troubleshooting)

---

## Prasyarat

Sebelum memulai, pastikan Anda memiliki:

- Server VPS dengan minimal **2GB RAM** dan **2 CPU cores**
- Sistem operasi **Ubuntu 20.04/22.04 LTS** atau **CentOS 7/8**
- Akses root atau sudo ke server
- Domain yang sudah diarahkan ke IP server
- Akun Supabase dengan project yang sudah dikonfigurasi

### Port yang Diperlukan

Pastikan port berikut terbuka di firewall:

| Port | Kegunaan |
|------|----------|
| 22 | SSH |
| 80 | HTTP |
| 443 | HTTPS |
| 3000 | Backend API (internal) |
| 8888 | AaPanel Panel |

---

## Instalasi AaPanel

### Langkah 1: Install AaPanel

Untuk **Ubuntu/Debian**:

```bash
wget -O install.sh http://www.aapanel.com/script/install-ubuntu_6.0_en.sh && sudo bash install.sh
```

Untuk **CentOS**:

```bash
yum install -y wget && wget -O install.sh http://www.aapanel.com/script/install_6.0_en.sh && sh install.sh
```

### Langkah 2: Akses AaPanel

Setelah instalasi selesai, Anda akan melihat informasi login:

```
==================================================================
AaPanel address: http://YOUR_IP:8888/xxxxxxxx
Username: xxxxxxxx
Password: xxxxxxxx
==================================================================
```

Buka URL tersebut di browser dan login dengan kredensial yang diberikan.

### Langkah 3: Install Software yang Diperlukan

Di dashboard AaPanel, install software berikut melalui **App Store**:

1. **Nginx** (versi 1.24 atau terbaru)
2. **PM2 Manager** (versi terbaru)
3. **Node.js** (versi 18.x atau lebih baru)

Atau gunakan terminal:

```bash
# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Harus v18.x.x atau lebih baru
npm --version
```

---

## Setup Environment

### Langkah 1: Buat Directory Project

```bash
# Buat directory untuk aplikasi
sudo mkdir -p /www/wwwroot/kr-app
sudo chown -R www-data:www-data /www/wwwroot/kr-app

# Buat directory untuk backend
sudo mkdir -p /www/wwwroot/kr-app/server
```

### Langkah 2: Clone atau Upload Project

**Opsi A: Menggunakan Git**

```bash
cd /www/wwwroot/kr-app
git clone https://github.com/your-username/kr-project.git .
```

**Opsi B: Upload via SFTP**

Upload file project ke `/www/wwwroot/kr-app/` menggunakan FileZilla atau SFTP client.

### Langkah 3: Setup Environment Variables

Buat file `.env` untuk backend:

```bash
cd /www/wwwroot/kr-app/apps/server
nano .env
```

Isi dengan konfigurasi berikut:

```env
# Server Configuration
PORT=3000
NODE_ENV=production

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# JWT Configuration
JWT_SECRET=your-jwt-secret-key-min-32-characters
JWT_EXPIRES_IN=7d

# Web Push Configuration (Optional)
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_SUBJECT=mailto:your-email@example.com

# Frontend URL (untuk CORS)
FRONTEND_URL=https://yourdomain.com

# Other Configuration
BCRYPT_SALT_ROUNDS=10
```

> **Penting**: Jangan pernah commit file `.env` ke repository. Pastikan file ini sudah ada di `.gitignore`.

---

## Konfigurasi Database Supabase

### Langkah 1: Dapatkan Kredensial Supabase

1. Login ke [Supabase Dashboard](https://app.supabase.com)
2. Pilih project Anda
3. Buka **Settings** → **API**
4. Salin nilai berikut:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (hati-hati, key ini sensitif!)

### Langkah 2: Konfigurasi Connection Pooling (Opsional tapi Direkomendasikan)

Untuk produksi, gunakan connection pooling:

1. Di Supabase Dashboard, buka **Settings** → **Database**
2. Cari bagian **Connection Pooling**
3. Aktifkan dan salin connection string

Format connection string:
```
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

### Langkah 3: Jalankan Migrasi Database

Jika ada migrasi yang perlu dijalankan:

```bash
cd /www/wwwroot/kr-app/database

# Gunakan Supabase CLI atau jalankan SQL secara manual
# via Supabase Dashboard → SQL Editor
```

---

## Deploy Backend dengan PM2

### Langkah 1: Install Dependencies Backend

```bash
cd /www/wwwroot/kr-app/apps/server
npm install --production
```

### Langkah 2: Test Backend

```bash
# Test apakah server bisa berjalan
npm start
```

Jika tidak ada error, tekan `Ctrl+C` untuk menghentikan.

### Langkah 3: Konfigurasi PM2

Buat file `ecosystem.config.js`:

```bash
cd /www/wwwroot/kr-app/apps/server
nano ecosystem.config.js
```

Isi dengan:

```javascript
module.exports = {
  apps: [{
    name: 'kr-backend',
    script: './src/server.js',
    cwd: '/www/wwwroot/kr-app/apps/server',
    instances: 2,
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/www/wwwroot/kr-app/logs/backend-error.log',
    out_file: '/www/wwwroot/kr-app/logs/backend-out.log',
    log_file: '/www/wwwroot/kr-app/logs/backend-combined.log',
    time: true
  }]
};
```

### Langkah 4: Buat Directory Logs

```bash
mkdir -p /www/wwwroot/kr-app/logs
```

### Langkah 5: Start Backend dengan PM2

```bash
cd /www/wwwroot/kr-app/apps/server
pm2 start ecosystem.config.js
```

### Langkah 6: Simpan Konfigurasi PM2

```bash
# Simpan konfigurasi agar auto-start saat reboot
pm2 save

# Setup startup script
pm2 startup
```

Jalankan command yang ditampilkan oleh `pm2 startup` untuk mengaktifkan auto-start.

### Langkah 7: Verifikasi Backend

```bash
# Cek status PM2
pm2 status

# Cek logs
pm2 logs kr-backend

# Test endpoint
curl http://localhost:3000/api/health
```

---

## Build dan Deploy Frontend

### Langkah 1: Install Dependencies Frontend

```bash
cd /www/wwwroot/kr-app
npm install
```

### Langkah 2: Buat Environment File untuk Frontend

```bash
cd /www/wwwroot/kr-app
nano .env.production
```

Isi dengan:

```env
VITE_API_URL=https://api.yourdomain.com
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_APP_NAME=KR - Kakarama Room
```

### Langkah 3: Build Frontend

```bash
cd /www/wwwroot/kr-app
npm run build
```

Output build akan berada di directory `dist/`.

### Langkah 4: Verifikasi Build

```bash
# Cek isi directory dist
ls -la dist/

# Harus ada:
# - index.html
# - assets/
# - favicon.svg
# - dll.
```

---

## Konfigurasi Nginx

### Langkah 1: Buat Website di AaPanel

1. Buka AaPanel → **Website**
2. Klik **Add site**
3. Isi domain (contoh: `yourdomain.com`)
4. Pilih **PHP version**: Pure Static
5. Klik **Submit**

### Langkah 2: Konfigurasi Nginx untuk Frontend

Di AaPanel, buka **Website** → klik domain → **Config**:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    # Root directory untuk frontend
    root /www/wwwroot/kr-app/dist;
    index index.html;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml application/javascript application/json;
    gzip_disable "MSIE [1-6]\.";
    
    # Frontend - React Router support
    location / {
        try_files $uri $uri/ /index.html;
        
        # Cache untuk static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Disable access to hidden files
    location ~ /\. {
        deny all;
    }
}
```

### Langkah 3: Konfigurasi Nginx untuk Backend API

Buat konfigurasi baru untuk subdomain API:

1. Di AaPanel, buat website baru dengan subdomain `api.yourdomain.com`
2. Edit konfigurasi:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;
    
    # Proxy ke backend PM2
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
    }
    
    # Increase max body size for file uploads
    client_max_body_size 50M;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

### Langkah 4: Test dan Reload Nginx

```bash
# Test konfigurasi Nginx
nginx -t

# Reload Nginx
nginx -s reload

# Atau via AaPanel: Website → klik "Reload" di samping domain
```

---

## Setup SSL/HTTPS

### Langkah 1: Install SSL Certificate

Di AaPanel:

1. Buka **Website** → klik domain
2. Klik **SSL**
3. Pilih **Let's Encrypt**
4. Klik **Apply**

### Langkah 2: Verifikasi SSL

Tunggu beberapa menit hingga certificate terinstall. Status akan berubah menjadi **Active**.

### Langkah 3: Force HTTPS

Masih di halaman SSL, aktifkan opsi **Force HTTPS** untuk mengarahkan semua traffic HTTP ke HTTPS.

### Langkah 4: Konfigurasi SSL Manual (Opsional)

Jika menggunakan SSL dari provider lain:

1. Buka **Website** → klik domain → **SSL**
2. Pilih **Other certificate**
3. Paste certificate dan private key
4. Klik **Save**

### Langkah 5: Test HTTPS

```bash
# Test SSL dengan openssl
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com

# Atau gunakan SSL Labs
# https://www.ssllabs.com/ssltest/analyze.html?d=yourdomain.com
```

---

## Monitoring dan Maintenance

### PM2 Monitoring

```bash
# Monitor resources
pm2 monit

# Cek logs real-time
pm2 logs kr-backend --lines 100

# Cek status detail
pm2 show kr-backend

# Restart aplikasi
pm2 restart kr-backend

# Stop aplikasi
pm2 stop kr-backend
```

### Nginx Logs

```bash
# Access logs
tail -f /www/wwwlogs/yourdomain.com.log

# Error logs
tail -f /www/wwwlogs/yourdomain.com.error.log
```

### Setup Log Rotation

Buat file `/etc/logrotate.d/kr-app`:

```
/www/wwwroot/kr-app/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

---

## Troubleshooting

### Backend Tidak Bisa Start

**Gejala**: PM2 status menunjukkan `errored` atau `stopped`

**Solusi**:

```bash
# Cek logs untuk error detail
pm2 logs kr-backend --err --lines 50

# Kemungkinan penyebab:
# 1. Port 3000 sudah digunakan
lsof -i :3000
kill -9 <PID>

# 2. Environment variables tidak terbaca
pm2 delete kr-backend
pm2 start ecosystem.config.js --update-env

# 3. Dependencies tidak terinstall
cd /www/wwwroot/kr-app/apps/server
npm install
```

### Frontend Menampilkan Halaman Kosong

**Gejala**: Halaman loading terus atau blank page

**Solusi**:

```bash
# 1. Cek console browser untuk error JavaScript

# 2. Pastikan .env.production sudah benar
cat /www/wwwroot/kr-app/.env.production

# 3. Rebuild frontend
cd /www/wwwroot/kr-app
npm run build

# 4. Clear browser cache dan reload
```

### Koneksi Database Gagal

**Gejala**: Error `ECONNREFUSED` atau authentication failed

**Solusi**:

```bash
# 1. Verifikasi kredensial Supabase di .env
cd /www/wwwroot/kr-app/apps/server
cat .env | grep SUPABASE

# 2. Test koneksi dari server
curl -I https://your-project.supabase.co/rest/v1/

# 3. Cek firewall
sudo ufw status
sudo ufw allow out 5432

# 4. Gunakan connection pooling jika masih bermasalah
```

### SSL Certificate Gagal

**Gejala**: Let's Encrypt tidak bisa verify domain

**Solusi**:

```bash
# 1. Pastikan domain sudah mengarah ke IP server yang benar
dig yourdomain.com

# 2. Pastikan port 80 tidak diblok
sudo ufw allow 80

# 3. Cek Nginx config
nginx -t

# 4. Restart Nginx
systemctl restart nginx

# 5. Coba apply ulang SSL di AaPanel
```

### Upload File Gagal

**Gejala**: Error saat upload file ke Supabase Storage

**Solusi**:

```bash
# 1. Cek ukuran max upload di Nginx
# Tambahkan di server block:
client_max_body_size 50M;

# 2. Cek di backend limit upload
# Pastikan multer dikonfigurasi dengan benar

# 3. Reload Nginx
nginx -s reload
```

### Memory Kehabisan (OOM)

**Gejala**: Server crash atau restart sendiri

**Solusi**:

```bash
# 1. Cek penggunaan memory
free -h
pm2 monit

# 2. Kurangi instances PM2 atau set limit memory
# Di ecosystem.config.js:
max_memory_restart: '300M',
instances: 1

# 3. Tambah swap memory jika perlu
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 4. Restart PM2
pm2 restart kr-backend
```

### CORS Error

**Gejala**: Browser menampilkan CORS error di console

**Solusi**:

```bash
# 1. Pastikan FRONTEND_URL di .env backend sudah benar
FRONTEND_URL=https://yourdomain.com

# 2. Cek konfigurasi CORS di backend (src/app.js)
# Pastikan origin sesuai dengan frontend URL

# 3. Restart backend
pm2 restart kr-backend
```

---

## Checklist Deployment

Sebelum menganggap deployment selesai, pastikan:

- [ ] Node.js versi 18+ terinstall
- [ ] PM2 terinstall dan backend berjalan
- [ ] Nginx terinstall dan dikonfigurasi
- [ ] SSL certificate aktif (HTTPS)
- [ ] Environment variables sudah dikonfigurasi
- [ ] Database Supabase terkoneksi
- [ ] Frontend bisa diakses
- [ ] API endpoint berfungsi
- [ ] Upload file berfungsi
- [ ] Log rotation dikonfigurasi
- [ ] Monitoring aktif

---

## Update Aplikasi

### Update Backend

```bash
# 1. Backup versi lama
cp -r /www/wwwroot/kr-app/apps/server /www/wwwroot/kr-app/server-backup-$(date +%Y%m%d)

# 2. Pull code terbaru
cd /www/wwwroot/kr-app
git pull origin main

# 3. Install dependencies baru
cd /www/wwwroot/kr-app/apps/server
npm install --production

# 4. Restart PM2
pm2 restart kr-backend

# 5. Cek logs
pm2 logs kr-backend --lines 20
```

### Update Frontend

```bash
# 1. Pull code terbaru
cd /www/wwwroot/kr-app
git pull origin main

# 2. Install dependencies baru
npm install

# 3. Build ulang
npm run build

# 4. Clear browser cache untuk memastikan perubahan terlihat
```

---

## Kontak dan Support

Jika mengalami masalah yang tidak tercover dalam dokumentasi ini:

- Buka issue di GitHub repository
- Hubungi tim development
- Konsultasi dengan komunitas AaPanel

---

*Dokumentasi terakhir diperbarui: Januari 2025*
