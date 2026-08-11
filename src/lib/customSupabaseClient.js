// Shared entry point. Self-host mode → apiClient adapter (K6); Vercel mode → supabase-js.
// Exports preserved (supabase, customSupabaseClient, supabaseProjectRef) so ~40
// components keep working without edits.
import { createClient } from '@supabase/supabase-js';

import * as apiClient from './apiClient';
import { IS_SELF_HOST } from './config';

const fallbackSupabaseUrl = 'https://xtpgbsdrfqnsolozybui.supabase.co';
const fallbackSupabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0cGdic2RyZnFuc29sb3p5YnVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1OTM1OTMsImV4cCI6MjA3NTE2OTU5M30.zzTzLEOrWsxXB60VcQJst0VqO8YdpatF7YyDsf2vbWs';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || fallbackSupabaseUrl;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY || fallbackSupabaseAnonKey;

let client;
let projectRef;
let usedFallback = false;

if (IS_SELF_HOST) {
  client = api;
  projectRef = 'selfhost';
} else {
  usedFallback = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  client = createClient(supabaseUrl, supabaseAnonKey);
  try {
    projectRef = new URL(supabaseUrl).hostname.split('.')[0] || 'unknown';
  } catch {
    projectRef = 'unknown';
  }
}

const customSupabaseClient = client;

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  if (!IS_SELF_HOST && usedFallback) {
    console.warn('[Supabase] ENV tidak lengkap. Aplikasi memakai fallback project Supabase.');
  }
  if (IS_SELF_HOST) {
    console.info('[Self-host] API adapter aktif.');
  }
}

export default customSupabaseClient;

export {
  customSupabaseClient,
  customSupabaseClient as supabase,
  supabaseProjectRef: projectRef,
};
