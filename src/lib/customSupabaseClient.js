import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
  || import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[Supabase] Konfigurasi client belum lengkap. Set VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY, lalu restart Vite.'
  );
}

let supabaseProjectRef = 'unknown';
try {
  const hostname = new URL(supabaseUrl).hostname;
  supabaseProjectRef = hostname.split('.')[0] || 'unknown';
} catch {
  throw new Error('[Supabase] VITE_SUPABASE_URL bukan URL yang valid.');
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  console.info('[Supabase] Endpoint aktif:', supabaseUrl);
}

const customSupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export default customSupabaseClient;

export { 
    customSupabaseClient,
    customSupabaseClient as supabase,
    supabaseProjectRef,
};
