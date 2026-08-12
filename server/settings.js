// Settings: baca config.json (non-secret) dari configDir sekali saat boot.
// Secret tetap dari process.env (K4). Priority provider: config.json > env > 'r2'.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export function loadConfigFile(configDir) {
  const file = path.join(configDir, 'config.json');
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('config.json parse failed:', e.message);
    return {};
  }
}

// Storage non-secret: config.json > env. Provider: config.json > env > 'r2'.
export function resolveStorageConfig(cfg, env = process.env) {
  const fromFile = cfg?.storage || {};
  const provider = fromFile.provider || env.STORAGE_PROVIDER || 'r2';
  return {
    provider,
    bucket: fromFile.bucket || env.R2_BUCKET || env.SUPABASE_STORAGE_BUCKET,
    endpoint: fromFile.endpoint || env.R2_ENDPOINT,
    region: fromFile.region || env.R2_REGION,
    publicUrl: fromFile.publicUrl || env.R2_PUBLIC_URL || env.VERCEL_BLOB_BASE_URL,
    publicBaseUrl: fromFile.publicBaseUrl || env.VERCEL_BLOB_BASE_URL,
  };
}
