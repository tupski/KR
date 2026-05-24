import { createClient } from '@supabase/supabase-js';

const fallbackSupabaseUrl = 'https://xtpgbsdrfqnsolozybui.supabase.co';
const fallbackSupabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0cGdic2RyZnFuc29sb3p5YnVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1OTM1OTMsImV4cCI6MjA3NTE2OTU5M30.zzTzLEOrWsxXB60VcQJst0VqO8YdpatF7YyDsf2vbWs';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || fallbackSupabaseUrl;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY || fallbackSupabaseAnonKey;
const supabaseProjectRef = (() => {
  try {
    return new URL(supabaseUrl).hostname.split('.')[0] || 'unknown';
  } catch {
    return 'unknown';
  }
})();

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  const usingFallback = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (usingFallback) {
    console.warn('[Supabase] ENV tidak lengkap. Aplikasi memakai fallback project Supabase.');
  }
  console.info('[Supabase] Endpoint aktif:', supabaseUrl);
}

const customSupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export default customSupabaseClient;

export { 
    customSupabaseClient,
    customSupabaseClient as supabase,
    supabaseProjectRef,
};
