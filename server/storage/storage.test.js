// @vitest-environment node
// TDD A1 (factory) + A2 (r2 proxy URL logic). Mock upstream, no network.
import { describe, it, expect, vi } from 'vitest';
import { getStorage } from './index.js';
import { decodeRef } from './util.js';

function stubEnv(provider) {
  const base = {
    r2: { R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's' },
    vercel_blob: { BLOB_READ_WRITE_TOKEN: 't', VERCEL_BLOB_BASE_URL: 'https://blob.local' },
    supabase: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'sr' },
  };
  return base[provider] || {};
}

function cfg(provider) {
  const c = { provider };
  if (provider === 'r2') Object.assign(c, { bucket: 'receipts', region: 'auto', endpoint: 'https://x.r2.dev' });
  if (provider === 'vercel_blob') c.publicUrl = 'https://blob.local';
  if (provider === 'supabase') c.bucket = 'transaction_receipts';
  return c;
}

describe('A1: factory provider selection', () => {
  it.each(['r2', 'vercel_blob', 'supabase'])('%s → impl with required methods', (provider) => {
    const impl = getStorage(cfg(provider), stubEnv(provider));
    for (const m of ['put', 'get', 'del', 'proxyUrl', 'ping']) {
      expect(impl[m]).toBeTypeOf('function');
    }
    expect(impl.proxyUrl('k')).toContain('/api/storage/proxy?ref=');
  });

  it('unknown provider throws', () => {
    expect(() => getStorage({ provider: 'dropbox' }, {})).toThrow(/unknown/);
  });

  it('missing provider throws', () => {
    expect(() => getStorage({}, {})).toThrow(/required/);
  });

  it('missing required env secret throws', () => {
    expect(() => getStorage(cfg('r2'), {})).toThrow(/credentials required/);
  });
});

describe('A2: proxy URL path logic', () => {
  it('r2 proxyUrl is opaque, no upstream host leaked', () => {
    const impl = getStorage(cfg('r2'), stubEnv('r2'));
    const url = impl.proxyUrl('uploads/f.png');
    expect(url).toContain('/api/storage/proxy?ref=');
    expect(url).not.toContain('r2.dev');
    const { provider, key } = decodeRef(url.split('ref=')[1]);
    expect(provider).toBeNull();
    expect(key).toBe('uploads/f.png');
  });

  it('vercel_blob ref carries v: prefix', () => {
    const impl = getStorage(cfg('vercel_blob'), stubEnv('vercel_blob'));
    const { provider, key } = decodeRef(impl.proxyUrl('dir/a.txt').split('ref=')[1]);
    expect(provider).toBe('vercel_blob');
    expect(key).toBe('dir/a.txt');
  });

  it('supabase ref carries s: prefix', () => {
    const impl = getStorage(cfg('supabase'), stubEnv('supabase'));
    const { provider, key } = decodeRef(impl.proxyUrl('dir/b.pdf').split('ref=')[1]);
    expect(provider).toBe('supabase');
    expect(key).toBe('dir/b.pdf');
  });

  it('empty ref throws', () => {
    expect(() => decodeRef('')).toThrow(/invalid storage ref/);
  });
});

// A2: put/get command routing — mock @aws-sdk/client-s3
vi.mock('@aws-sdk/client-s3', () => {
  const send = vi.fn().mockResolvedValue({ ContentType: 'image/png', Body: 'x' });
  return {
    S3Client: vi.fn(() => ({ send })),
    PutObjectCommand: vi.fn((input) => ({ input })),
    GetObjectCommand: vi.fn((input) => ({ input })),
    DeleteObjectCommand: vi.fn((input) => ({ input })),
    HeadBucketCommand: vi.fn((input) => ({ input })),
  };
});

describe('A2: r2 put/get command routing', () => {
  it('put → key + opaque url', async () => {
    const { create } = await import('./r2.js');
    const adapter = create({ config: { bucket: 'receipts', region: 'auto', endpoint: 'https://x.r2.dev' }, env: stubEnv('r2') });
    const { key, url } = await adapter.put({ buffer: Buffer.from('a'), fileName: 'f.png', folder: 'uploads' });
    expect(key).toBe('uploads/f.png');
    expect(url).toContain('/api/storage/proxy?ref=');
    expect(url).not.toContain('r2.dev');
  });

  it('get → content type passthrough', async () => {
    const { create } = await import('./r2.js');
    const adapter = create({ config: { bucket: 'receipts', region: 'auto', endpoint: 'https://x.r2.dev' }, env: stubEnv('r2') });
    const out = await adapter.get('uploads/f.png');
    expect(out.contentType).toBe('image/png');
  });

  it('upstream error propagates', async () => {
    const mod = await import('@aws-sdk/client-s3');
    const send = mod.S3Client.mock.results.at(-1).value.send;
    send.mockRejectedValueOnce(new Error('AccessDenied'));
    const { create } = await import('./r2.js');
    const adapter = create({ config: { bucket: 'receipts', region: 'auto', endpoint: 'https://x.r2.dev' }, env: stubEnv('r2') });
    await expect(adapter.get('x')).rejects.toThrow('AccessDenied');
  });
});
