# Database Migration Guide (Supabase PostgreSQL -> Self-Hosted PostgreSQL 16)

## Overview
Dokumentasi panduan migrasi basis data dari Supabase PostgreSQL ke Self-Hosted PostgreSQL 16.
Proses menggunakan Postgres native tooling (`pg_dump` dan `psql`) yang diorkestrasi melalui `tools/migrate-supabase-db.js`.

---

## Prerequisites
* PostgreSQL client utilities terpasang (`pg_dump`, `psql`).
* Akses connection string ke database Supabase dan database target.

---

## Environment Variables
Simpan di `.env` (tidak di-commit):
```env
MIGRATION_SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
MIGRATION_TARGET_DB_URL=postgresql://[USER]:[PASSWORD]@127.0.0.1:5432/[DB_NAME]
```

---

## Steps & Commands

### 1. Export dari Supabase
Mengekspor public schema dan data ke direktori `migration/database/YYYYMMDD-HHmmss/dump.sql`:
```bash
npm run migration:db -- export
# atau:
node tools/migrate-supabase-db.js export
```
Menghasilkan:
* `dump.sql`: Berkas dump schema & data PostgreSQL native.
* `manifest.json`: Metadata timestamp, ukuran file, dan SHA-256 hash.

### 2. Restore ke Target PostgreSQL
Merestorasi dump hasil export ke target database:
```bash
npm run migration:db -- restore
# atau menyertakan path spesifik:
node tools/migrate-supabase-db.js restore migration/database/20260908120000/dump.sql
```

### 3. Verifikasi
Memvalidasi status target database:
```bash
npm run migration:db -- verify
```

---

## Rollback & Safety
* Proses ekspor bersifat murni **READ ONLY** pada database Supabase.
* Data Supabase asli tetap utuh dan tidak tersentuh.
