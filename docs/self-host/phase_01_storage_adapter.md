# Phase 01 — Storage Adapter

File target:
- `server/storage/adapter.js` — factory
- `server/storage/r2.js`, `server/storage/vercelBlob.js`, `server/storage/supabase.js`
- `server/storage/routes.js` — upload / proxy / test / delete
- `server/storage/adapter.test.js`, `server/storage/r2.test.js` (TDD A1, A2)

Keputusan: secret dibaca dari `process.env` di sisi server (K4). UI hanya menyimpan
`storage_provider` + field non-secret di `system_settings`. Proxy URL opaque (`?ref=`).

---

## 1. Interface adapter

```js
// server/storage/adapter.js
//
// StorageAdapter interface (semua impl wajib):
//   put({ buffer, fileName, folder, contentType }) -> Promise<{ key, url }>
//   get(key)                    -> Promise<{ stream|buffer, contentType }>
//   del(key)                    -> Promise<void>
//   proxyUrl(key)               -> string   // opaque, untuk disimpan ke DB
//   ping()                      -> Promise<{ ok, latencyMs, detail }>

const IMPLEMENTATIONS = {
  r2:          () => import('./r2.js'),
  vercel_blob: () => import('./vercelBlob.js'),
  supabase:    () => import('./supabase.js'),
};

export function getStorageAdapter({ provider, config, env }) {
  // preconditions
  if (!provider)                        throw new Error('storage.provider required');
  const factory = IMPLEMENTATIONS[provider];
  if (!factory)                         throw new Error(`unknown storage provider: ${provider}`);

  const impl = factory();               // dynamic import
  return impl.create({ config, env });  // config = non-secret dari system_settings,
                                        // env     = secret dari process.env
}
```

Catatan: `config` berisi `bucket`, `endpoint`, `region`, `publicUrl` (non-secret).
`env` berisi `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `BLOB_READ_WRITE_TOKEN`,
`SUPABASE_SERVICE_ROLE_KEY`, dst (secret, tidak pernah ke klien).

---

## 2. Implementasi R2 (S3-compatible)

```js
// server/storage/r2.js
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';

export function create({ config, env }) {
  const client = new S3Client({
    region: config.region || 'auto',
    endpoint: config.endpoint,                 // https://<account>.r2.cloudflarestorage.com
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  const bucket = config.bucket;                // wajib
  const publicUrl = config.publicUrl?.replace(/\/+$/, '') || ''; // opsional

  return {
    async put({ buffer, fileName, folder }) {
      const key = [folder, fileName].filter(Boolean).join('/');
      await client.send(new PutObjectCommand({
        Bucket: bucket, Key: key, Body: buffer,
        ContentType: contentTypeFromName(fileName),
      }));
      return { key, url: publicUrl ? `${publicUrl}/${key}` : proxyUrl(key) };
    },

    async get(key) {
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return { stream: out.Body, contentType: out.ContentType || 'application/octet-stream' };
    },

    async del(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    proxyUrl(key) { return `/api/v1/storage/proxy?ref=${Buffer.from(key).toString('base64url')}`; },

    async ping() {
      const t0 = Date.now();
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return { ok: true, latencyMs: Date.now() - t0, detail: `bucket=${bucket}` };
    },
  };
}

function contentTypeFromName(name) {
  const ext = name.split('.').pop()?.toLowerCase();
  const map = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', pdf:'application/pdf' };
  return map[ext] || 'application/octet-stream';
}
```

`ponytail:` signed URL via `@aws-sdk/s3-request-presigner` bila klien butuh akses langsung — add when proxy bandwidth jadi bottleneck.

---

## 3. Implementasi Vercel Blob

```js
// server/storage/vercelBlob.js
import { put, del } from '@vercel/blob';

export function create({ config, env }) {
  const token = env.BLOB_READ_WRITE_TOKEN;      // wajib
  return {
    async put({ buffer, fileName, folder }) {
      const pathname = `${folder}/${fileName}`;
      const blob = await put(pathname, buffer, {
        access: 'private', addRandomSuffix: true,
        contentType: contentTypeFromName(fileName), token,
      });
      return { key: blob.pathname, url: proxyUrl(blob.pathname) };
    },

    async get(key) {
      const base = env.VERCEL_BLOB_BASE_URL || deriveBaseUrl(env.VERCEL_BLOB_STORE_ID);
      const res = await fetch(`${base}/${key}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`blob fetch ${res.status}`);
      return { buffer: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') };
    },

    async del(key) { await del(key, { token }); },
    proxyUrl(key)  { return `/api/v1/storage/proxy?ref=${Buffer.from(`v:${key}`).toString('base64url')}`; },

    async ping() {
      // upload 1 byte dummy lalu hapus — bukti token valid
      const t0 = Date.now();
      const b = await put('ping.txt', Buffer.from('ping'), { access:'private', token });
      await del(b.pathname, { token });
      return { ok: true, latencyMs: Date.now() - t0, detail: 'token ok' };
    },
  };
}
```

Catatan: prefiks `v:` pada `ref` membedakan key space antar provider di proxy.

---

## 4. Implementasi Supabase Storage (server)

```js
// server/storage/supabase.js
import { createClient } from '@supabase/supabase-js';   // pakai dep yang sudah ada

export function create({ config, env }) {
  const client = createClient(
    env.SUPABASE_URL,                    // instance URL (bukan base URL app)
    env.SUPABASE_SERVICE_ROLE_KEY        // service role — server only
  );
  const bucket = config.bucket;          // mis. 'transaction_receipts'

  return {
    async put({ buffer, fileName, folder }) {
      const key = `${folder}/${fileName}`;
      const { error } = await client.storage.from(bucket).upload(key, buffer, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = client.storage.from(bucket).getPublicUrl(key);
      return { key, url: publicUrl || proxyUrl(key) };
    },

    async get(key) {
      const { data, error } = await client.storage.from(bucket).download(key);
      if (error) throw error;
      return { buffer: Buffer.from(await data.arrayBuffer()), contentType: data.type };
    },

    async del(key) {
      const { error } = await client.storage.from(bucket).remove([key]);
      if (error) throw error;
    },

    proxyUrl(key) { return `/api/v1/storage/proxy?ref=${Buffer.from(`s:${key}`).toString('base64url')}`; },

    async ping() {
      const t0 = Date.now();
      const { data, error } = await client.storage.from(bucket).list('', { limit: 1 });
      if (error) throw error;
      return { ok: true, latencyMs: Date.now() - t0, detail: `bucket=${bucket}` };
    },
  };
}
```

---

## 5. Routes

```js
// server/storage/routes.js
// Mount di /api/v1/storage & /api/v1/upload. Semua butuh requireAuth; upload butuh role >= karyawan.

router.post('/upload', requireAuth, async (req, res) => {
  const adapter = storageForRequest(req);          // dari system_settings.storage_provider
  const buffer = await readRawBody(req);           // stream → Buffer
  const fileName = sanitize(req.headers['x-file-name'] || `file-${Date.now()}`);
  const folder = sanitizeFolder(req.headers['x-folder'] || 'uploads');
  if (buffer.length === 0) return res.status(400).json({ error: 'File kosong.' });
  const { key, url } = await adapter.put({ buffer, fileName, folder });
  res.json({ url, key, provider: req.settings.storage_provider });
});

router.get('/storage/proxy', requireAuth, async (req, res) => {
  const ref = String(req.query.ref || '');
  const { provider, key } = decodeRef(ref);        // 'v:'|'s:'|'' → provider, base64url → key
  const adapter = getStorageAdapter(providerConfig(provider));
  const out = await adapter.get(key);
  res.set('Content-Type', out.contentType);
  res.set('Cache-Control', 'private, max-age=300');
  res.send(out.buffer ?? out.stream);
});

router.post('/storage/test', requireAuth, requireRole('super_admin'), async (req, res) => {
  const { provider, config } = req.body;           // config non-secret; env dari server
  const adapter = getStorageAdapter({ provider, config, env: process.env });
  res.json(await adapter.ping());                  // { ok, latencyMs, detail } atau error → 400
});

router.delete('/storage', requireAuth, requireRole('super_admin'), async (req, res) => {
  const { key } = req.body;
  const adapter = storageForRequest(req);
  await adapter.del(key);
  res.json({ ok: true });
});

function storageForRequest(req) {
  const provider = req.settings.storage_provider || 'r2';
  return getStorageAdapter({ provider, config: providerConfig(provider), env: process.env });
}
```

`readRawBody`, `sanitize`, `decodeRef` helpers di file terpisah `server/storage/util.js` (< 100 baris).

---

## 6. TDD Anchors

### A1 — `server/storage/adapter.test.js`
```js
// property: factory routing
for (const [name, mod] of [['r2','r2.js'],['vercel_blob','vercelBlob.js'],['supabase','supabase.js']]) {
  it(`${name} → impl correct`, () => {
    const impl = getStorageAdapter({ provider: name, config: cfg(name), env: stubEnv(name) });
    expect(impl.put).toBeTypeOf('function');
    expect(impl.proxyUrl('k')).toContain('/api/v1/storage/proxy?ref=');
  });
}
it('unknown provider throws', () => {
  expect(() => getStorageAdapter({ provider: 'dropbox', config: {}, env: {} })).toThrow(/unknown/);
});
it('missing provider throws', () => {
  expect(() => getStorageAdapter({ config: {}, env: {} })).toThrow(/required/);
});
```

### A2 — `server/storage/r2.test.js`
```js
// stub S3Client commands (vitest mock @aws-sdk/client-s3)
it('put → PutObjectCommand dengan Bucket+Key benar, url proxy opaque', async () => {
  const adapter = create({ config: { bucket: 'receipts', region: 'auto', endpoint: 'https://x.r2.dev' }, env: stubEnv() });
  const { key, url } = await adapter.put({ buffer: Buffer.from('a'), fileName: 'f.png', folder: 'uploads' });
  expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ Bucket: 'receipts', Key: 'uploads/f.png' }) }));
  expect(url).toContain('/api/v1/storage/proxy?ref=');
  expect(url).not.toContain('r2.dev');            // path upstream tersembunyi
});
it('get → GetObjectCommand + content type', async () => { ... });
it('upstream error diteruskan (throw)', async () => {
  mockSend.mockRejectedValueOnce(new Error('AccessDenied'));
  await expect(adapter.get('x')).rejects.toThrow('AccessDenied');
});
```

Skenario tambahan (bukan anchor wajib): `vercelBlob.ping()` gagal saat token salah → error jelas; `supabase.put` bucket tidak ada → error diteruskan.
