import { IS_SELF_HOST } from './config';

// Baca access token Supabase dari localStorage secara sinkron (supabase-js v2).
// Dipakai untuk autentikasi ke API Vercel (upload + blob proxy).
// Self-host memakai cookie session → tidak perlu token di sini.
export const getAccessToken = () => {
  if (IS_SELF_HOST || typeof localStorage === 'undefined') return null;
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const parsed = JSON.parse(localStorage.getItem(key));
      if (parsed?.access_token) return parsed.access_token;
    }
  } catch (_e) {
    // Abaikan — request tanpa token akan ditolak 401 oleh API.
  }
  return null;
};
