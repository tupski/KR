# Prosedur Cutover & Kesiapan Migrasi Produksi (KR App)

## 1. Ikhtisar & Prinsip Keamanan
Dokumen ini mengatur urutan langkah manual untuk mengeksekusi migrasi produksi dari infrastruktur Vercel + Supabase ke infrastruktur Self-Hosted aaPanel (Node.js 24 + PostgreSQL 16 + Local Storage).

> **Prinsip:**
> - Non-destructive: Infrastruktur lama tidak dihapus selama proses.
> - Data correctness > Zero-downtime.
> - Pembatalan (Rollback) dapat dilakukan kapan saja sebelum DNS A-Record dipindah penuh.

---

## 2. Urutan Eksekusi Cutover (16 Langkah)

```text
1. Backup Supabase PostgreSQL
2. Pre-copy Vercel Blob ke Target Storage
3. Deploy Infrastruktur Target di aaPanel (docker compose up -d)
4. Ekspor Dump Akhir Supabase (npm run migration:db -- export)
5. Restore ke Database Target (npm run migration:db -- restore)
6. Verifikasi Integritas Database Target (npm run migration:db -- verify)
7. Final Sync Vercel Blob (npm run migration:blob -- migrate)
8. Transformasi URL Media Legacy (Ubah URL Vercel ke Key Canonical)
9. Verifikasi Aset Media (npm run migration:verify)
10. Smoke Test Aplikasi Target pada Domain Staging / IP Server
11. Aktifkan Maintenance Mode pada Vercel Lama (Opsional)
12. Alihkan DNS A-Record Domain ke IP Server aaPanel
13. Terbitkan Sertifikat SSL Let's Encrypt di aaPanel Nginx
14. Pantau Log Aplikasi (docker compose logs -f app)
15. Evaluasi Kestabilan (Masa Retensi 14-30 Hari)
16. Decommissioning Infrastruktur Lama (Secara Manual)
```

---

## 3. Detail Perintah Migrasi

### A. Ekspor & Restore Database
```bash
# 1. Ekspor dari Supabase
export MIGRATION_SUPABASE_DB_URL="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"
npm run migration:db -- export

# 2. Restore ke PostgreSQL Target
export MIGRATION_TARGET_DB_URL="postgresql://kr_user:[PASSWORD]@127.0.0.1:5432/kr_production"
npm run migration:db -- restore

# 3. Verifikasi Jumlah Baris & Tabel
npm run migration:db -- verify
```

### B. Migrasi Aset Media Vercel Blob
```bash
# 1. Copy Objek dari Vercel Blob ke Storage Lokal
export MIGRATION_VERCEL_BLOB_TOKEN="vercel_blob_rw_..."
export STORAGE_DRIVER="local"
export LOCAL_STORAGE_PATH="/www/wwwroot/kr/storage"
npm run migration:blob -- migrate

# 2. Jika Terputus, Lanjutkan Dengan:
npm run migration:blob -- resume

# 3. Verifikasi Konsistensi Berkas
npm run migration:verify
```

---

## 4. Rencana Pembatalan (Rollback Strategy)
Jika ditemukan kegagalan kritis pada server baru sebelum DNS menyebar penuh:
1. Kembalikan DNS A-Record atau CNAME pada DNS Manager (Cloudflare / Registrar) mengarah kembali ke Vercel CNAME (`cname.vercel-dns.com`).
2. Aplikasi Vercel & Supabase asli yang tetap utuh akan langsung menerima traffic kembali.
3. *Catatan Pasca-Cutover:* Jika server baru telah menerima transaksi baru selama masa pengujian, lakukan penyesuaian/export delta manual pada data transaksi baru sebelum mematikan server baru.

---

## 5. Kriteria Decommissioning Infrastruktur Lama
Jangan mematikan Supabase atau Vercel Blob sampai:
- Aplikasi beroperasi stabil tanpa masalah selama minimal **14 hari**.
- Backup lengkap database dan media sudah tersimpan aman di lokasi kedua.
- Semua URL media terbukti berhasil disajikan dari storage baru.
