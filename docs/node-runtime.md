# Node.js 24 Backend Runtime (KR App)

## 1. Overview
Node.js 24 API runtime dibangun menggunakan Fastify untuk menggantikan fungsi Vercel Serverless Functions (`api/*.js`).

Fitur utama runtime:
* Menyajikan berkas statis frontend Vite (`dist/`) dengan SPA fallback (`index.html`).
* Routing `/api/*` untuk fungsionalitas upload, blob proxy, notifikasi, dan health check.
* Menyajikan media lokal secara langsung melalui prefix `/storage/*`.
* Proteksi path traversal dan sanitasi payload upload.
* Graceful shutdown untuk sinyal `SIGINT` dan `SIGTERM`.

---

## 2. API Endpoints Mapping
* `GET /health`: Pemeriksaan kesehatan aplikasi dan uptime.
* `POST /api/upload`: Endpoint upload multi-part dan binary stream, terhubung ke Storage Abstraction Layer.
* `GET /api/blob?pathname=...`: Kompatibilitas proxy untuk berkas privat/legacy.
* `GET /storage/*`: Serving berkas media langsung saat menggunakan driver `local`.

---

## 3. Menjalankan Server
```bash
npm run build
node server/index.js
```
