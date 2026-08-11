// Vercel Blob adapter — server-side token via env.
import { put, del } from '@vercel/blob';

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf',
  txt: 'text/plain', json: 'application/json',
};

function contentTypeFromName(name) {
  const ext = name.split('.').pop()?.toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

function proxyUrl(key) {
  return `/api/storage/proxy?ref=${Buffer.from(`v:${key}`).toString('base64url')}`;
}

export function create({ config, env }) {
  const token = env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN required');
  const base = env.VERCEL_BLOB_BASE_URL || config.publicUrl || '';

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
      if (!base) throw new Error('VERCEL_BLOB_BASE_URL or config.publicUrl required for get');
      const res = await fetch(`${base}/${key}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`blob fetch ${res.status}`);
      return {
        buffer: Buffer.from(await res.arrayBuffer()),
        contentType: res.headers.get('content-type') || 'application/octet-stream',
      };
    },

    async del(key) { await del(key, { token }); },

    proxyUrl,

    async ping() {
      const t0 = Date.now();
      const b = await put('ping.txt', Buffer.from('ping'), { access: 'private', token });
      await del(b.pathname, { token });
      return { ok: true, latencyMs: Date.now() - t0, detail: 'token ok' };
    },
  };
}
