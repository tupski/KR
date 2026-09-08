# Prosedur Cutover & Kesiapan Migrasi Produksi (KR App)

## 1. Ikhtisar & Prinsip Keamanan
Dokumen ini mengatur urutan langkah manual untuk mengeksekusi migrasi produksi dari infrastruktur Vercel + Supabase ke infrastruktur Self-Hosted aaPanel (Node.js 24 + PostgreSQL 17 + Local Storage).

> **Prinsip:**
> - Non-destructive: Infrastruktur lama tidak dihapus selama proses.
> - Data correctness > Zero-downtime.
> - Pembatalan (Rollback) dapat dilakukan kapan saja sebelum DNS A-Record dipindah penuh.
> - **Verifikasi nyata setiap langkah** — jangan lanjut hanya karena command exit 0.

---

## 2. Urutan Eksekusi Cutover (17 Langkah)

```text
0. Backup & VERIFIKASI Supabase (pg_dump + test restore di tempat staging)
1. Pre-copy Vercel Blob ke Target Storage
2. Deploy Infrastruktur Target di aaPanel (docker compose up -d)
3. Ekspor Dump Akhir Supabase (npm run migration:db -- export)
4. Restore ke Database Target (npm run migration:db -- restore)
5. Verifikasi Integritas Database Target (npm run migration:db -- verify)
6. Final Sync Vercel Blob (npm run migration:blob -- migrate)
7. Transformasi URL Media Legacy (Ubah URL Vercel ke Key Canonical)
8. Verifikasi Aset Media (npm run migration:verify)
9. Smoke Test Aplikasi Target pada Domain Staging / IP Server
10. Aktifkan Maintenance Mode pada Vercel Lama (Opsional)
11. Alihkan DNS A-Record Domain ke IP Server aaPanel
12. Terbitkan Sertifikat SSL Let's Encrypt di aaPanel Nginx
13. Pantau Log Aplikasi (docker compose logs -f app)
14. Evaluasi Kestabilan (Masa Retensi 14-30 Hari)
15. Decommissioning Infrastruktur Lama (Secara Manual)
```

### Prasyarat wajib sebelum mulai
- Image dibangun dengan `VITE_API_MODE=native` (Dockerfile default; jangan override ke supabase).
- Server berisi commit yang memuat `runAsActor` (GUC `request.jwt.*`) — TANPA itu, RLS pasca-restore menolak semua query & RPC SECURITY DEFINER (admin_*, pay_*, log_activity) gagal.
- `DATABASE_URL`, `JWT_SECRET`, `APP_URL`, `COOKIE_SECURE=true` sudah benar di `.env`.

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
Rollback **bukan zero-loss** setelah server baru menerima write. Bedakan:

| Jenis | Mekanisme | Proteksi |
|---|---|---|
| **Traffic rollback** | Balik DNS A-record ke Vercel CNAME | Instan — Vercel + Supabase lama masih utuh |
| **Application rollback** | `docker compose down` di aaPanel | Menghentikan layanan baru |
| **Database rollback** | Kembali ke Supabase | Hanya aman jika belum ada write baru di server baru |
| **Media rollback** | Objek baru di storage self-hosted | Perlu disalin manual balik ke Vercel Blob |

**Jika server baru telah menerima transaksi/notifikasi baru selama masa uji (pasca cutover sebagian):**
1. Balikkan DNS dulu (traffic kembali ke Vercel).
2. Ekspor data baru dari PostgreSQL self-hosted (`pg_dump` tabel yang berubah: transactions, tagihan_*, pengeluaran, requests, notifications, user_roles).
3. Lakukan sync manual / delta ke Supabase.
4. **Jangan matikan** PostgreSQL self-hosted sampai delta terverifikasi.

Jika ditemukan kegagalan kritis pada server baru **sebelum** DNS menyebar penuh:
1. Kembalikan DNS A-Record atau CNAME pada DNS Manager (Cloudflare / Registrar) mengarah kembali ke Vercel CNAME (`cname.vercel-dns.com`).
2. Aplikasi Vercel & Supabase asli yang tetap utuh akan langsung menerima traffic kembali.
3. *Catatan Pasca-Cutover:* Jika server baru telah menerima transaksi baru selama masa pengujian, lakukan penyesuaian/export delta manual pada data transaksi baru sebelum mematikan server baru.

---

## 5. Kriteria Decommissioning Infrastruktur Lama
Jangan mematikan Supabase atau Vercel Blob sampai:
- Aplikasi beroperasi stabil tanpa masalah selama minimal **14 hari**.
- Backup lengkap database dan media sudah tersimpan aman di lokasi kedua.
- Semua URL media terbukti berhasil disajikan dari storage baru.
