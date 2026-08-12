// Supabase Storage adapter — server-side, service role via env.
import { createClient } from '@supabase/supabase-js';

function proxyUrl(key) {
  return `/api/storage/proxy?ref=${Buffer.from(`s:${key}`).toString('base64url')}`;
}

export function create({ config, env }) {
  const bucket = config.bucket;
  if (!bucket) throw new Error('supabase.bucket required');
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  }
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async put({ buffer, fileName, folder }) {
      const key = `${folder}/${fileName}`;
      const { error } = await client.storage.from(bucket).upload(key, buffer, { upsert: false });
      if (error) throw error;
      const { data } = client.storage.from(bucket).getPublicUrl(key);
      return { key, url: data.publicUrl || proxyUrl(key) };
    },

    async get(key) {
      const { data, error } = await client.storage.from(bucket).download(key);
      if (error) throw error;
      return {
        buffer: Buffer.from(await data.arrayBuffer()),
        contentType: data.type || 'application/octet-stream',
      };
    },

    async del(key) {
      const { error } = await client.storage.from(bucket).remove([key]);
      if (error) throw error;
    },

    proxyUrl,

    async ping() {
      const t0 = Date.now();
      const { error } = await client.storage.from(bucket).list('', { limit: 1 });
      if (error) throw error;
      return { ok: true, latencyMs: Date.now() - t0, detail: `bucket=${bucket}` };
    },
  };
}
