# Phase 04 — Client Adapter + GlobalSettings Storage Section

File target:
- `src/lib/apiClient.js` — query builder minimal menggantikan supabase-js
- `src/lib/customSupabaseClient.js` — re-export (impor lama ~40 file tetap jalan)
- `src/lib/authClient.js` — login/logout/me
- `src/lib/storageUpload.js` — upload via `/api/v1/upload`
- `src/components/GlobalSettings.jsx` — tambah section "Penyimpanan File"
- `src/lib/apiClient.test.js` (TDD A5)

---

## 1. apiClient.js — surface adapter

Kontrak: **setiap pemanggilan mengembalikan `{ data, error }`** (identik supabase-js) sehingga
komponen tidak diedit. Session: cookie `kr_session` (httpOnly) → fetch dengan `credentials: 'include'`
dan header `X-Requested-With: XMLHttpRequest` (CSRF guard).

```js
// src/lib/apiClient.js
const API = import.meta.env.VITE_API_BASE_URL || '';   // VITE_* publik; '' = same-origin (self-host)

async function http(method, path, body) {
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { data: null, error: { message: json.error || `HTTP ${res.status}`, code: res.status } };
    return { data: json.data ?? json, error: null };
  } catch (e) {
    return { data: null, error: { message: e.message } };
  }
}

export function rpc(name, params) {
  return http('POST', `/api/v1/rpc/${name}`, params);
}

// --- query builder (chainable, bentuk .from() .select() .eq() ... sama) ---
export function from(table) {
  const q = { table, select: '*', filters: [], order: null, ascending: false, range: null, count: null, head: false };

  return {
    select(cols, opts = {}) { q.select = cols || '*'; q.count = opts.count || null; q.head = !!opts.head; return this; },
    eq(col, v)          { q.filters.push({ col, op: 'eq', value: v }); return this; },
    gte(col, v)         { q.filters.push({ col, op: 'gte', value: v }); return this; },
    lt(col, v)          { q.filters.push({ col, op: 'lt', value: v }); return this; },
    lte(col, v)         { q.filters.push({ col, op: 'lte', value: v }); return this; },
    in(col, arr)        { q.filters.push({ col, op: 'in', value: arr }); return this; },
    is(col, v)          { q.filters.push({ col, op: 'is', value: v }); return this; },
    not(col, op, v)     { q.filters.push({ col, op: `not_${op}`, value: v }); return this; },
    or(str)             { q.filters.push({ col: '__or', op: 'or', value: str }); return this; },  // raw PostgREST-style
    order(col, { ascending = false } = {}) { q.order = col; q.ascending = ascending; return this; },
    range(a, b)         { q.range = [a, b]; return this; },
    limit(n)            { q.limit = n; return this; },
    maybeSingle()       { q.single = true; return this; },

    async then() { return execute(q); },              // await-able (thenable)

    async insert(rows)   { return http('POST',   `/api/v1/db/${table}`, { rows: Array.isArray(rows) ? rows : [rows] }); },
    async upsert(rows, o){ return http('POST',   `/api/v1/db/${table}?onConflict=${o?.onConflict || ''}`, { rows: Array.isArray(rows) ? rows : [rows], upsert: true }); },
    async update(patch)  { return http('PATCH',  `/api/v1/db/${table}?${qs(q.filters)}`, patch); },
    async delete()       { return http('DELETE', `/api/v1/db/${table}?${qs(q.filters)}`); },
  };
}

async function execute(q) {
  const params = new URLSearchParams();
  if (q.select) params.set('select', q.select);
  if (q.filters.length) params.set('filter', JSON.stringify(q.filters));
  if (q.order)  { params.set('order', q.order); params.set('asc', String(q.ascending)); }
  if (q.range)  params.set('range', q.range.join(','));
  if (q.count)  params.set('count', q.count);
  if (q.head)   params.set('head', '1');
  return http('GET', `/api/v1/db/${q.table}?${params.toString()}`);
}
```

Catatan penting:
- `.or(str)` mengirim string PostgREST-style (`and(col.gte.x,col.lt.y)`) → server parse ke JSON filter
  (lihat `buildWhere` di phase_02). Kompatibel dengan pemakaian di KetersediaanKamar & NotificationsInbox.
- `head: true` → server jalankan count-only (status 200, body kosong) — kompatibel pola
  DashboardPemasukan `{ count, error }`.
- `maybeSingle` → server tambah `LIMIT 1`; klien return `data[0] ?? null`.
- Backend `POST /db/:table` menjalankan INSERT dalam satu transaksi + return rows (untuk pola
  "insert lalu verify" di FormTransaksiModern).

---

## 2. customSupabaseClient.js (rewrite, impor lama tetap)

```js
// src/lib/customSupabaseClient.js
import * as api from './apiClient';
// Ekspor bentuk yang sama agar seluruh komponen & hook tidak berubah:
export const customSupabaseClient = api;
export const supabase = api;
export const supabaseProjectRef = 'selfhost';   // placeholder; hanya dipakai log dev
export default customSupabaseClient;
```

Blok `if (import.meta.env.DEV)` peringatan fallback dihapus (tidak ada hardcoded URL lagi).

---

## 3. authClient.js

```js
// src/lib/authClient.js
export const authClient = {
  async getSession()      { const r = await http('GET', '/api/v1/auth/me'); return { data: { session: r.data?.user ? { user: r.data.user } : null }, error: null }; },
  async signInWithPassword({ email, password }) { const r = await http('POST', '/api/v1/auth/login', { email, password }); return { data: r.data, error: r.error }; },
  async signUp(payload)   { const r = await http('POST', '/api/v1/auth/register', payload); return { data: r.data, error: r.error }; },
  async signOut()         { await http('POST', '/api/v1/auth/logout'); return { error: null }; },
  async updateUser(patch) { const r = await http('PATCH', '/api/v1/auth/me', patch); return { data: r.data, error: r.error }; },
  async onAuthStateChange(cb) {
    // polling ringan: cek /me tiap 60s saat tab aktif → cb('SIGNED_IN'|'SIGNED_OUT'|'TOKEN_REFRESHED')
    const timer = setInterval(async () => {
      const { data } = await authClient.getSession();
      cb(data.session ? 'SIGNED_IN' : 'SIGNED_OUT', data.session);
    }, 60_000);
    return { data: { subscription: { unsubscribe: () => clearInterval(timer) } } };
  },
};
```

`SupabaseAuthContext` tidak berubah logika; hanya sumber `supabase` yang kini adapter.
`checkUserRole` tetap memakai `.from('user_roles').select('role').eq(...)` → server.

---

## 4. storageUpload.js

```js
// src/lib/storageUpload.js
export async function uploadFile(file, folder = 'uploads') {
  const safeName = `${Date.now()}-${String(file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const res = await fetch(`${API}/api/v1/upload`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-file-name': safeName, 'x-folder': folder },
    body: file,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Gagal upload.');
  return (await res.json()).url;      // opaque proxy URL — disimpan ke kolom *_url di DB
}

// ManajemenDeposit: ganti supabase.storage.from(...).upload → uploadFile(file, 'refund_proofs')
// komponen lain via vercelBlobUpload → re-export uploadFile.
```

`resolveStorageUrl` (src/lib/storageUrl.js) tetap: URL `/api/v1/storage/proxy?ref=` sudah diawali
`/api/...` → langsung dikembalikan (kompatibel: cek `startsWith('/api/')` perlu diperluas dari
`/api/blob` ke `/api/v1/storage/proxy`).

---

## 5. GlobalSettings — section "Penyimpanan File"

```jsx
// src/components/GlobalSettings.jsx — tambah state & card baru
const [storage, setStorage] = useState({
  provider: settings.storage_provider || 'r2',     // 'r2'|'vercel_blob'|'supabase'
  r2_bucket: '', r2_endpoint: '', r2_public_url: '',
  supabase_storage_bucket: '',
});

const PROVIDER_META = {
  r2:          { label: 'Cloudflare R2',   fields: ['r2_bucket','r2_endpoint','r2_public_url'], secretHint: 'R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY' },
  vercel_blob: { label: 'Vercel Blob',     fields: [], secretHint: 'BLOB_READ_WRITE_TOKEN' },
  supabase:    { label: 'Supabase Storage', fields: ['supabase_storage_bucket'], secretHint: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' },
};

// simpan non-secret ke system_settings (key = storage_provider + r2_bucket, ...)
// tombol "Test Koneksi":
async function testStorage() {
  const r = await api.http('POST', '/api/v1/storage/test', {
    provider: storage.provider,
    config: nonSecretConfig(storage),     // secret diisi server dari env — tidak pernah ke browser
  });
  setTestResult(r.data?.ok ? '✓ OK' : `✗ ${r.error?.message}`);
}

// catatan UI: secret TIDAK diinput di sini → instruksi "isi di .env server" (mode default K4)
// toggle "Simpan secret di database (terenkripsi)" → aktifkan input secret (opsional, aaPanel)
```

Provider switch → simpan `storage_provider`; perubahan provider berikutnya dipakai server
seketika (baca `system_settings` per request via middleware `loadSettings`).

---

## 6. TDD Anchor

### A5 — `src/lib/apiClient.test.js`
```js
// mock global.fetch (vitest) — verifikasi URL + return shape
it('rpc → POST /api/v1/rpc/:name dengan body params; return { data, error }', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [{ total_count: 3 }] }) });
  const r = await rpc('get_dashboard_kpis', { p_start_date: '2026-01-01' });
  expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/rpc/get_dashboard_kpis'), expect.objectContaining({ method: 'POST' }));
  expect(r.data[0].total_count).toBe(3);
});

it('from(t).select().eq().gte().order().range() → query string benar', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [] }) });
  await from('transactions')
    .select('*', { count: 'exact' })
    .eq('apartment_location', 'Tower A').gte('checkin_at', '2026-01-01')
    .order('created_at', { ascending: false }).range(0, 9);
  const [url] = mockFetch.mock.calls[0];
  expect(url).toContain('/api/v1/db/transactions');
  expect(url).toContain('count=exact');
  expect(url).toContain('range=0,9');
  expect(decodeURIComponent(url)).toContain('"col":"apartment_location","op":"eq","value":"Tower A"');
});

it('from(t).select().in().or() → filter or serialized benar (KetersediaanKamar)', async () => {
  // or('and(checkin_at.gte.X,checkin_at.lt.Y),and(...)') → filter JSON berisi op:"or"
  const r = await from('transactions').select('id').or('and(a.gte.1,a.lt.2),and(b.is.null)');
  expect(decodeURIComponent(mockFetch.mock.calls[0][0])).toContain('"op":"or"');
  expect(r.error).toBeNull();
});

it('HTTP error → { data:null, error:{ message, code } }', async () => {
  mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Session expired' }) });
  const r = await rpc('x', {});
  expect(r.data).toBeNull(); expect(r.error.code).toBe(401);
});

it('network error → { data:null, error:{ message } } tanpa throw', async () => {
  mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'));
  const r = await from('notifications').select('id');
  expect(r.error.message).toBe('Failed to fetch');
});
```

---

## 7. Checklist migrasi komponen (bukan ulang tulis)

| File | Perubahan |
|---|---|
| `src/lib/customSupabaseClient.js` | ganti isi → re-export apiClient (bukan edit 40 komponen) |
| `src/contexts/SupabaseAuthContext.jsx` | `supabase.auth.*` → `authClient.*` (mekanik) |
| `src/lib/pushClient.js` | `from('push_subscriptions').upsert` tetap (via adapter) |
| `src/lib/vercelBlobUpload.js` | re-export `uploadFile` |
| `src/components/ManajemenDeposit.jsx` | storage.upload → `uploadFile` |
| `src/hooks/useRpcQuery.js`, `useCategorySummary.js`, `usePaginatedQuery.js` | **tanpa perubahan** |
| `src/components/GlobalSettings.jsx` | + section storage (F2) |
| `src/App.jsx` (realtime subs) | channel → polling `usePageVisibility` + `/changes` |

---

## 8. Catatan build

- `VITE_API_BASE_URL`: opsional; default `''` (same-origin, satu server). Di deploy Vercel lama
  tanpa server self-host, value diarahkan ke endpoint server.
- Audit bundle: `grep -riE "service_role|R2_SECRET|BLOB_READ_WRITE" dist/` harus kosong (CI, R4).
