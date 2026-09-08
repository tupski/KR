# Storage Architecture (KR App)

## 1. Overview
Lapisan abstraksi penyimpanan (Storage Abstraction Layer) dirancang agar aplikasi independen dari Vercel Blob dan mendukung pergantian provider tanpa mengubah logika bisnis.

Driver yang didukung:
- `local` (Default): Filesystem lokal pada kontainer atau persistent volume aaPanel (`/app/storage`).
- `r2`: Cloudflare R2 (menggunakan implementasi S3-compatible).
- `s3`: AWS S3, MinIO, atau layanan generic S3 lainnya.

---

## 2. Format Canonical Key
Database dan API menggunakan format canonical key seragam:
```text
uploads/{folder}/{filename}
```
Contoh:
`uploads/ktp-images/1725800000-ktp_user.webp`

Semua path dinormalisasi dan dilindungi dari eksploitasi path traversal (`../`).

---

## 3. Storage Interface
- `upload(key, buffer, options)`: Menyimpan data binary.
- `get(key)`: Mengambil stream / buffer data.
- `exists(key)`: Pengecekan ketersediaan objek.
- `delete(key)`: Menghapus berkas.
- `getUrl(key)`: Menghasilkan URL publik atau rute internal.

---

## 4. Konfigurasi Lingkungan
```env
STORAGE_DRIVER=local
LOCAL_STORAGE_PATH=/app/storage

# Untuk Cloudflare R2 / AWS S3:
# STORAGE_DRIVER=s3
# S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
# S3_ACCESS_KEY_ID=...
# S3_SECRET_ACCESS_KEY=...
# S3_BUCKET=kr-media
# S3_REGION=auto
# S3_PUBLIC_DOMAIN=https://media.kakaramaroom.com
```
