# Egress Report — Proyek KR

> Dokumen ini mendokumentasikan metodologi pengukuran egress Supabase, estimasi penggunaan saat ini, rencana optimasi, dan dampak yang diharapkan.

---

## 1. Egress Test (Metodologi)

### 1.1 Network DevTools Browser

Cara mengukur payload REST API Supabase secara manual:

1. Buka aplikasi di browser, masuk ke halaman yang ingin diukur (misal: Dashboard, Tagihan).
2. Buka **DevTools** → tab **Network** (`F12` atau `Ctrl+Shift+I`).
3. Filter request: klik tombol **Fetch/XHR**.
4. Reload halaman (`Ctrl+R`) agar semua request tertangkap dari awal.
5. Klik kolom **Size** untuk sort dari terbesar ke terkecil.
6. Identifikasi request ke endpoint Supabase:
   ```
   https://xtpgbsdrfqnsolozybui.supabase.co/rest/v1/transactions
   https://xtpgbsdrfqnsolozybui.supabase.co/rest/v1/rpc/<nama_rpc>
   ```
7. Klik salah satu request → tab **Response** untuk melihat data mentah, tab **Headers** untuk melihat `Content-Length`.
8. Di bagian bawah Network panel, catat **transferred** (ukuran compressed) vs **resources** (ukuran decompressed).

> **Tips:** Gunakan kolom "Transferred" untuk estimasi egress aktual karena Supabase mengirim gzip.

### 1.2 Membaca Response Size dari Supabase REST

Setiap baris hasil query dikembalikan sebagai JSON array. Estimasi ukuran:

- `select('*')` pada tabel `transactions` → ~2 KB/baris (semua kolom)
- `select('kolom1, kolom2, ...')` → ~0.3–0.5 KB/baris (kolom spesifik)
- Tambahkan overhead header HTTP ~1–2 KB per request

Rumus estimasi:
```
Payload = jumlah_baris × ukuran_per_baris + overhead_header
```

### 1.3 Mengukur Realtime WebSocket Traffic

Supabase Realtime menggunakan WebSocket. Untuk memantau:

1. Di DevTools → tab **Network** → filter **WS** (WebSocket).
2. Klik koneksi WebSocket aktif ke `wss://xtpgbsdrfqnsolozybui.supabase.co/realtime/v1/websocket`.
3. Tab **Messages** menampilkan setiap event yang masuk/keluar.
4. Setiap event `INSERT/UPDATE/DELETE` yang dikonfigurasi dengan `broadcast` atau `postgres_changes` akan terlihat di sini.

> **Penting:** Realtime sendiri hanya mengirim event kecil (~1–5 KB per notifikasi), tapi masalahnya ada di **refetch penuh** yang dipicu setiap event — itulah sumber egress besar.

### 1.4 Supabase Dashboard → Reports → API Usage

1. Masuk ke [Supabase Dashboard](https://supabase.com/dashboard/project/xtpgbsdrfqnsolozybui).
2. Navigasi ke **Reports** → **API** atau **Usage**.
3. Lihat grafik **Egress** (Data Transfer Out) per hari/bulan.
4. Bandingkan dengan free tier limit: **5 GB/bulan**.

---

## 2. Hasil Egress Test Saat Ini (Estimasi)

### Asumsi Dasar

| Parameter | Nilai |
|---|---|
| Ukuran 1 baris `select('*')` | ~2 KB |
| Ukuran 1 baris kolom spesifik | ~0.5 KB |
| Transaksi per bulan | 1.500–3.000 baris |
| Transaksi per hari | 50–100 baris |
| User aktif simultan | 5–10 user |
| Sesi aktif per hari | ~20 sesi |

### 2.1 DashboardPemasukan

**File:** [`DashboardPemasukan.jsx`](../src/components/DashboardPemasukan.jsx:125)

- Query: [`supabase.from('transactions').select('*')`](../src/components/DashboardPemasukan.jsx:125) tanpa pagination
- Mode bulanan: menarik semua transaksi 1 bulan sekaligus
- Realtime: **refetch penuh** setiap ada event di tabel `transactions`

| Skenario | Kalkulasi | Total |
|---|---|---|
| Per load | 1.500 baris × 2 KB | **3 MB** |
| Per hari (20 sesi) | 20 × 3 MB | **60 MB/hari** |

### 2.2 HalamanTagihan — `loadData`

**File:** [`HalamanTagihan.jsx`](../src/components/HalamanTagihan.jsx:849)

- Query: [`supabase.from('transactions').select('*')`](../src/components/HalamanTagihan.jsx:849) filter 1 bulan
- Hanya butuh 6 kolom tapi menarik semua kolom (~30 kolom)
- 2 channel Realtime subscribe ke tabel yang sama

| Skenario | Kalkulasi | Total |
|---|---|---|
| Per load | 1.500 baris × 2 KB | **3 MB** |
| Per hari (15 sesi) | 15 × 3 MB | **45 MB/hari** |

### 2.3 KetersediaanKamar

**File:** [`KetersediaanKamar.jsx`](../src/components/KetersediaanKamar.jsx:261)

- Query: 14 kolom spesifik, filter 3 hari terakhir ✅ (sudah bagus)
- Realtime: refetch **tanpa debounce** setiap event `transactions`
- Dibuka sering karena merupakan halaman utama operasional

| Skenario | Kalkulasi | Total |
|---|---|---|
| Per load | 300 baris × 1 KB | **300 KB** |
| Per hari (50 sesi) | 50 × 300 KB | **15 MB/hari** |

### 2.4 AnalyticsDashboard

**File:** [`AnalyticsDashboard.jsx`](../src/components/AnalyticsDashboard.jsx)

- 16+ RPC call setiap kali halaman dibuka atau filter periode berubah
- Cache in-memory TTL 5 menit ([`DEFAULT_TTL_MS = 5 * 60_000`](../src/hooks/useRpcQuery.js:16)), hilang saat refresh
- Export CSV: [`p_limit: 1000`](../src/components/AnalyticsDashboard.jsx) fetch semua data

| Skenario | Kalkulasi | Total |
|---|---|---|
| Per load | 16 RPC × avg 200 KB | **3.2 MB** |
| Per hari (10 sesi) | 10 × 3.2 MB | **32 MB/hari** |

### 2.5 FormTransaksiModern

**File:** [`FormTransaksiModern.jsx`](../src/components/FormTransaksiModern.jsx:195)

- Query: [`supabase.from('transactions').select(...)`](../src/components/FormTransaksiModern.jsx:195) tanpa limit
- Menarik seluruh histori transaksi untuk cek konflik booking (tidak perlu semua data)

| Skenario | Kalkulasi | Total |
|---|---|---|
| Per buka form | 3.000 baris × 0.5 KB | **1.5 MB** |
| Per hari (20 buka form) | 20 × 1.5 MB | **30 MB/hari** |

### 2.6 Duplikasi Notifikasi

**File:** [`App.jsx`](../src/App.jsx:273), [`AllNotifications.jsx`](../src/components/AllNotifications.jsx:159), [`NotificationsInbox.jsx`](../src/components/NotificationsInbox.jsx:164)

- 3 komponen subscribe ke tabel `notifications` yang sama
- 1 event → 3 fetch paralel secara bersamaan

| Skenario | Kalkulasi | Total |
|---|---|---|
| Per event | 30 notif × 3 fetch × 5 KB | **450 KB** |
| Per hari (100 events) | 100 × 450 KB | **45 MB/hari** |

### Ringkasan Total Estimasi Saat Ini

| Komponen | MB/hari | MB/bulan |
|---|---|---|
| DashboardPemasukan | 60 | 1.800 |
| HalamanTagihan | 45 | 1.350 |
| KetersediaanKamar | 15 | 450 |
| AnalyticsDashboard | 32 | 960 |
| FormTransaksiModern | 30 | 900 |
| Duplikasi Notifikasi | 45 | 1.350 |
| **Total** | **227 MB** | **~6.810 MB (~6.8 GB)** |

> ⚠️ Free tier Supabase: **5 GB/bulan egress**. Estimasi saat ini **melampaui limit 36%**.

---

## 3. Bagian yang Akan Diubah

### 3.1 DashboardPemasukan — Ganti `select('*')` + Pindahkan Kalkulasi ke RPC

**File:** [`DashboardPemasukan.jsx`](../src/components/DashboardPemasukan.jsx:125)

**Masalah:** Query menarik semua kolom untuk kalkulasi summary yang seharusnya dilakukan di database.

**Perbaikan:**
```js
// Sebelum
const { data } = await supabase.from('transactions').select('*')

// Sesudah: gunakan RPC aggregate
const { data } = await supabase.rpc('get_category_summary', {
  p_start: startDate,
  p_end: endDate,
  p_location: location
})
```

Untuk data tabel (bukan ringkasan), batasi kolom:
```js
.select('id, checkin_at, room_number, total_amount, payment_method, category')
```

### 3.2 HalamanTagihan — Ganti `select('*')` ke 6 Kolom

**File:** [`HalamanTagihan.jsx`](../src/components/HalamanTagihan.jsx:849)

**Masalah:** [`select('*')`](../src/components/HalamanTagihan.jsx:849) menarik ~30 kolom; halaman ini hanya butuh 6.

**Perbaikan:**
```js
// Sebelum
supabase.from('transactions').select('*')

// Sesudah
supabase.from('transactions').select(
  'id, checkin_at, room_number, total_amount, payment_method, status'
)
```

### 3.3 FormTransaksiModern — Tambah Filter Tanggal + `.limit()`

**File:** [`FormTransaksiModern.jsx`](../src/components/FormTransaksiModern.jsx:195)

**Masalah:** Query tanpa batas waktu atau jumlah baris untuk cek konflik booking.

**Perbaikan:**
```js
// Sebelum
supabase.from('transactions')
  .select('apartment_location, room_number, created_at, checkin_at, rental_duration, checkout_at')
  .order('created_at', { ascending: false })

// Sesudah: batasi ke 90 hari terakhir dan 500 baris
const since = new Date()
since.setDate(since.getDate() - 90)

supabase.from('transactions')
  .select('apartment_location, room_number, checkin_at, rental_duration, checkout_at')
  .gte('checkin_at', since.toISOString())
  .order('checkin_at', { ascending: false })
  .limit(500)
```

### 3.4 Notifikasi — Konsolidasi 3 Channel Menjadi 1

**File:** [`App.jsx`](../src/App.jsx:273), [`AllNotifications.jsx`](../src/components/AllNotifications.jsx:159), [`NotificationsInbox.jsx`](../src/components/NotificationsInbox.jsx:164)

**Masalah:** 3 komponen masing-masing subscribe dan refetch sendiri saat ada event.

**Perbaikan:** Buat 1 channel di level `App` atau `Context`, distribusikan data via React Context:
```js
// NotificationsContext.jsx (baru)
const channel = supabase.channel('notifications-global')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' },
    debounce(() => refetchNotifications(), 1500)
  ).subscribe()

// Komponen lain cukup consume context — tidak perlu subscribe sendiri
const { notifications } = useNotificationsContext()
```

### 3.5 Semua Realtime Handler — Tambah Debounce 1.5 Detik

**File:** [`DashboardPemasukan.jsx`](../src/components/DashboardPemasukan.jsx), [`HalamanTagihan.jsx`](../src/components/HalamanTagihan.jsx), [`KetersediaanKamar.jsx`](../src/components/KetersediaanKamar.jsx:261)

**Masalah:** Setiap event Realtime langsung trigger refetch. Insert 5 transaksi berturut-turut = 5 refetch.

**Perbaikan:**
```js
import { debounce } from 'lodash-es' // atau implementasi manual

const debouncedRefetch = useMemo(
  () => debounce(() => loadData(), 1500),
  [loadData]
)

supabase.channel('transactions-watch')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' },
    debouncedRefetch
  ).subscribe()
```

### 3.6 useRpcQuery — Naikkan Default TTL ke 15 Menit

**File:** [`useRpcQuery.js`](../src/hooks/useRpcQuery.js:16)

**Masalah:** [`DEFAULT_TTL_MS = 5 * 60_000`](../src/hooks/useRpcQuery.js:16) (5 menit) terlalu pendek untuk data analytics yang jarang berubah.

**Perbaikan:**
```js
// Sebelum
const DEFAULT_TTL_MS = 5 * 60_000   // 5 menit

// Sesudah
const DEFAULT_TTL_MS = 15 * 60_000  // 15 menit
const DEFAULT_STALE_MS = 5 * 60_000 // 5 menit (tetap revalidate latar)
```

### 3.7 AnalyticsDashboard — Lazy Load Sections

**File:** [`AnalyticsDashboard.jsx`](../src/components/AnalyticsDashboard.jsx)

**Masalah:** 16 section semuanya di-fetch saat halaman pertama dibuka, termasuk section di bawah fold yang belum terlihat.

**Perbaikan:** Gunakan `IntersectionObserver` agar section hanya fetch saat masuk viewport:
```js
// Contoh wrapper untuk setiap section
function LazySection({ children }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { rootMargin: '200px' }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return <div ref={ref}>{visible ? children : <Skeleton />}</div>
}
```

---

## 4. Dampak dari Perubahan

### Estimasi Penghematan Per Komponen

| Komponen | Sebelum (MB/hari) | Sesudah (MB/hari) | Hemat |
|---|---|---|---|
| DashboardPemasukan | 60 | 5 | **92%** |
| HalamanTagihan | 45 | 4 | **91%** |
| KetersediaanKamar | 15 | 8 | **47%** |
| AnalyticsDashboard | 32 | 8 | **75%** |
| FormTransaksiModern | 30 | 4 | **87%** |
| Duplikasi Notifikasi | 45 | 5 | **89%** |
| **Total** | **227 MB** | **34 MB** | **85%** |

### Perbandingan Bulanan

| Metrik | Sebelum | Sesudah | Delta |
|---|---|---|---|
| Egress/hari | ~227 MB | ~34 MB | −193 MB |
| Egress/bulan | ~6.810 MB (~6.8 GB) | ~1.020 MB (~1 GB) | −5.79 GB |
| vs Free Tier (5 GB) | ❌ Melampaui limit | ✅ Di bawah limit | — |
| Margin sisa | −1.81 GB | +4 GB tersisa | — |

### Catatan Asumsi Pasca-Optimasi

- Debounce 1.5 detik mengurangi refetch realtime hingga 70–80% saat aktivitas tinggi.
- TTL 15 menit untuk analytics berarti 3× lebih sedikit RPC call dalam 1 sesi 45 menit.
- Lazy load sections mengurangi initial fetch dari 16 RPC → ~4–6 RPC (section above fold saja).
- Konsolidasi notifikasi dari 3 fetch → 1 fetch per event.

> **Target tercapai:** Estimasi pasca-optimasi ~1 GB/bulan, jauh di bawah batas free tier 5 GB/bulan dengan margin aman 4 GB.
