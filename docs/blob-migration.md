# Vercel Blob Migration Guide (Vercel Blob -> Local / R2 / S3)

## Overview
Panduan migrasi aset media/foto dari Vercel Blob ke target storage (`local` filesystem / Cloudflare R2 / S3 compatible) menggunakan `tools/migrate-vercel-blob.js`.

---

## Prerequisites
* Token akses Vercel Blob (`BLOB_READ_WRITE_TOKEN`).
* Direktori tujuan / storage driver yang sesuai.

---

## Environment Variables
```env
MIGRATION_VERCEL_BLOB_TOKEN=vercel_blob_rw_...
STORAGE_DRIVER=local
LOCAL_STORAGE_PATH=./storage
```

---

## Commands

### 1. Migrasi Aset (Copy-First)
Mengunduh seluruh objek dari Vercel Blob, memvalidasi SHA-256 hash, dan menyimpannya ke direktori target:
```bash
npm run migration:blob -- migrate
# atau:
node tools/migrate-vercel-blob.js migrate
```

### 2. Resume Migrasi Terputus
Melanjutkan migrasi yang sempat berhenti, otomatis melewati berkas yang sudah berhasil diverifikasi:
```bash
npm run migration:blob -- resume
```

### 3. Retry Berkas Gagal
Mencoba ulang unduhan untuk berkas yang berstatus error:
```bash
npm run migration:blob -- retry-failed
```

---

## Manifest Log
Setiap eksekusi mencatat progres streaming ke `migration/blobs/YYYYMMDD-HHmmss/manifest.jsonl` dengan skema:
```json
{"sourceUrl":"...","pathname":"uploads/ktp/photo.webp","targetKey":"uploads/ktp/photo.webp","size":104857,"sha256":"...","status":"success"}
```

---

## Keamanan & Non-Destructive
* Script beroperasi dalam mode **COPY**.
* Tidak ada perintah `DELETE` atau `MOVE` ke Vercel Blob.
