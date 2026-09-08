import { createClient } from '@supabase/supabase-js';
import { createApiClient } from './apiClient.js';
import { createNativeSupabaseCompat } from './nativeClient.js';

// ── Mode selection ──────────────────────────────────────────────────────────
// VITE_API_MODE=native  -> self-hosted Fastify backend via the apiClient shim,
//                          wrapped by createNativeSupabaseCompat (auth +
//                          polling-based realtime, supabase-js-shaped).
//                          The native client never performs a Supabase network
//                          call — no URL/key below is read or used.
// anything else         -> legacy Supabase (createClient) path, unchanged.
//                          Requires VITE_SUPABASE_URL + anon key from env; a
//                          missing/invalid config fails fast with a clear
//                          error instead of silently pointing at a hardcoded
//                          project (no credentials in source).
const isNativeMode = import.meta.env.VITE_API_MODE === 'native';

function resolveLegacyConfig() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!supabaseUrl || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl)) {
    throw new Error(
      '[Supabase] VITE_SUPABASE_URL tidak valid dan mode bukan native. ' +
      'Set VITE_API_MODE=native untuk backend self-hosted.'
    );
  }
  if (!supabaseAnonKey) {
    throw new Error(
      '[Supabase] VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY kosong. ' +
      'Set VITE_API_MODE=native untuk backend self-hosted.'
    );
  }
  return { supabaseUrl, supabaseAnonKey };
}

function buildClient() {
  if (isNativeMode) {
    return createNativeSupabaseCompat(createApiClient());
  }
  const { supabaseUrl, supabaseAnonKey } = resolveLegacyConfig();
  return createClient(supabaseUrl, supabaseAnonKey);
}

const customSupabaseClient = buildClient();

const supabaseProjectRef = (() => {
  if (isNativeMode) return 'native';
  try {
    const cfg = resolveLegacyConfig();
    return new URL(cfg.supabaseUrl).hostname.split('.')[0] || 'unknown';
  } catch {
    return 'unknown';
  }
})();

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  if (isNativeMode) {
    console.info('[API] Mode native aktif — backend self-hosted (/api/*), tanpa Supabase runtime.');
  } else {
    // Never log secrets — only the endpoint URL.
    console.info('[Supabase] Endpoint aktif:', import.meta.env.VITE_SUPABASE_URL);
  }
}

export default customSupabaseClient;

export {
    customSupabaseClient,
    customSupabaseClient as supabase,
    supabaseProjectRef,
};
