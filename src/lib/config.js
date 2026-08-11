// Mode detection: VITE_SELF_HOST === 'true' → self-host apiClient; else supabase-js.
export const IS_SELF_HOST = import.meta.env.VITE_SELF_HOST === 'true';

export const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Polling-based realtime (K3). Replaces supabase .channel('x').on('postgres_changes').
 * cb fired each tick; interval 15s when tab visible, 60s hidden (R3).
 */
export function subscribeChanges({ tables = [], intervalSec = 15, callback }) {
  const tick = () => {
    // Lightweight: no watermark endpoint yet — just re-poll callback.
    if (typeof callback !== 'function') return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    callback();
  };
  const id = setInterval(tick, intervalSec * 1000);
  return () => clearInterval(id);
}