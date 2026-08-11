// Storage adapter factory. Secret dari env (server-only), non-secret dari config.
import { create as createR2 } from './r2.js';
import { create as createVercelBlob } from './vercelBlob.js';
import { create as createSupabase } from './supabase.js';

const IMPLEMENTATIONS = {
  r2: createR2,
  vercel_blob: createVercelBlob,
  supabase: createSupabase,
};

/**
 * getStorage(config, env) -> StorageAdapter
 * config: { provider, bucket?, endpoint?, region?, publicUrl?, publicBaseUrl? }
 * env (default process.env): secret per provider.
 */
export function getStorage(config = {}, env = process.env) {
  const { provider } = config;
  if (!provider) throw new Error('storage.provider required');
  const factory = IMPLEMENTATIONS[provider];
  if (!factory) throw new Error(`unknown storage provider: ${provider}`);
  return factory({ config, env });
}
