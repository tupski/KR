/**
 * src/lib/nativeClient.js
 *
 * Compatibility layer that makes the self-hosted backend (server/) look like
 * supabase-js to the ~35 components that import `supabase` from
 * '@/lib/customSupabaseClient'.
 *
 * createNativeSupabaseCompat(apiClient, options?) wraps the supabase-js-shaped
 * data shim from './apiClient.js' (.from()/.rpc()) and ADDS:
 *
 *   .auth.getSession()            -> { data: { session } }   (via GET /api/auth/me)
 *   .auth.signInWithPassword()    -> POST /api/auth/login    (httpOnly cookie set by server)
 *   .auth.signOut()               -> POST /api/auth/logout, emits SIGNED_OUT
 *   .auth.onAuthStateChange(cb)   -> { data: { subscription: { unsubscribe } } }
 *                                    Events: INITIAL_SESSION (on subscribe, via
 *                                    GET /api/auth/me), SIGNED_IN (after login),
 *                                    SIGNED_OUT (after logout or on 401 for a
 *                                    previously-cached session), USER_UPDATED
 *                                    (after updateUser).
 *   .auth.updateUser({ data })    -> PATCH /api/auth/me if the server implements
 *                                    it; otherwise a no-op returning { error: null }.
 *   .auth.getUser()               -> { data: { user } } via GET /api/auth/me
 *   .auth.signUp()                -> always { error: { message: 'Pendaftaran harus melalui admin.' } }
 *                                    (native backend has no public signup; admin-only /api/auth/register)
 *
 *   .channel(name)                -> POLLING-BASED realtime shim (see below)
 *   .removeChannel(channel)       -> clears the polling interval
 *
 * Session/user shape (mirrors supabase-js so components keep working):
 *   session = { access_token: 'native-cookie-session', token_type: 'bearer', user }
 *   user    = { id, email, user_metadata: { full_name, avatar_url, phone, role, ... } }
 *
 * ── REALTIME IS POLLING, NOT PUSH ─────────────────────────────────────────────
 * .channel(name).on('postgres_changes', { event, schema, table, filter }, cb)
 *   .subscribe(cb?) starts a setInterval (default 15000 ms, configurable via
 *   options.pollMs / window.NATIVE_REALTIME_POLL_MS /
 *   import.meta.env.VITE_NATIVE_REALTIME_POLL_MS). On every tick ALL registered
 *   callbacks are invoked so components refetch their data.
 *
 * There is NO server->client push and NO change payloads: callbacks receive a
 * payload object with EMPTY `new`/`old` records — the filters ({event, schema,
 * table, filter}) are NOT evaluated against actual row changes; every tick
 * fires every binding. This is safe for the current consumers, which were
 * verified to only refetch inside the callback and ignore the payload:
 *   - src/App.jsx ~110-115: system_settings channel -> fetchSettings() (ignores args)
 *   - src/App.jsx ~272-286: notifications/notification_reads/notification_hidden
 *     channels -> refreshUnread() (ignores args)
 *   - src/contexts/SupabaseAuthContext.jsx ~136-144: user_roles channel ->
 *     () => checkUserRole(userId) (ignores args)
 *
 * .subscribe() returns the channel itself (supabase-js returns a
 * RealtimeChannel whose .unsubscribe() stops it); channel.unsubscribe() clears
 * the interval and resolves { status: 'ok' }. removeChannel(channel) delegates
 * to channel.unsubscribe().
 */

const DEFAULT_POLL_MS = 15000;
const REGISTRATION_DISABLED_MESSAGE = 'Pendaftaran harus melalui admin.';

function resolvePollMs(options = {}) {
  const candidates = [
    options.pollMs,
    typeof window !== 'undefined' ? window.NATIVE_REALTIME_POLL_MS : undefined,
    typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_NATIVE_REALTIME_POLL_MS : undefined,
    typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.NATIVE_REALTIME_POLL_MS : undefined,
    typeof process !== 'undefined' && process.env ? process.env.NATIVE_REALTIME_POLL_MS : undefined,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (c !== undefined && c !== null && c !== '' && Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_POLL_MS;
}

/** Convert native backend user { id, email, full_name, phone, avatar_url, role } to supabase-js user. */
export function toSupabaseUser(nativeUser) {
  if (!nativeUser) return null;
  const { id, email, ...rest } = nativeUser;
  return {
    id,
    email,
    // supabase-js components read user.user_metadata.full_name / .avatar_url
    user_metadata: {
      full_name: rest.full_name ?? null,
      avatar_url: rest.avatar_url ?? null,
      phone: rest.phone ?? null,
      role: rest.role ?? null,
      ...rest,
    },
    app_metadata: { role: rest.role ?? null },
    aud: 'authenticated',
    created_at: rest.created_at ?? null,
  };
}

/** Wrap a supabase-js-shaped user into a minimal session object. */
export function toSession(user) {
  if (!user) return null;
  return {
    access_token: 'native-cookie-session', // auth lives in the httpOnly cookie, not JS
    token_type: 'bearer',
    expires_in: 7 * 24 * 60 * 60,
    expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    refresh_token: null,
    user,
  };
}

/**
 * @param {object} apiClient - shim from createApiClient() ('./apiClient.js')
 * @param {object} [options] - { baseUrl?: string, pollMs?: number, fetchImpl?: Function }
 */
export function createNativeSupabaseCompat(apiClient, options = {}) {
  const baseUrl = options.baseUrl ?? '';
  const fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
  const pollMs = resolvePollMs(options);

  // ── auth state ──────────────────────────────────────────────────────────────
  let cachedSession = null;
  // Bumped on every LOCAL cache mutation (login/logout/401). In-flight
  // fetchSessionFromServer calls compare versions before writing, so a stale
  // response can't clobber a fresher login/logout (INITIAL_SESSION race).
  let sessionVersion = 0;
  const listeners = new Set();

  function emit(event, session) {
    for (const cb of Array.from(listeners)) {
      try {
        cb(event, session);
      } catch (err) {
        console.error('[nativeClient] onAuthStateChange listener error:', err);
      }
    }
  }

  async function rawFetch(path, init = {}) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch (_e) {
      payload = null;
    }
    return { ok: response.ok, status: response.status, payload };
  }

  function authError(message, status) {
    return {
      message: message || 'AuthApiError',
      status,
      name: 'AuthApiError',
    };
  }

  /** GET /api/auth/me -> supabase-shaped { session, user } or null when 401/404. */
  async function fetchSessionFromServer() {
    const versionAtStart = sessionVersion;
    let res;
    try {
      res = await rawFetch('/api/auth/me', { method: 'GET' });
    } catch (e) {
      return { session: null, error: authError(`Network error: ${e.message}`, 0) };
    }
    if (res.status === 401 || res.status === 404 || !res.ok) {
      const hadSession = cachedSession !== null;
      cachedSession = null;
      sessionVersion++;
      // Session expired / invalidated server-side -> notify SIGNED_OUT so the
      // app can reset state (only when we previously believed we were signed in).
      if (res.status === 401 && hadSession) emit('SIGNED_OUT', null);
      return {
        session: null,
        error: res.ok ? null : authError((res.payload && (res.payload.error || res.payload.message)) || `HTTP ${res.status}`, res.status),
      };
    }
    const nativeUser = res.payload?.user ?? res.payload ?? null;
    const user = toSupabaseUser(nativeUser);
    const session = toSession(user);
    if (versionAtStart === sessionVersion) {
      cachedSession = session;
    }
    // Stale response: don't overwrite; caller falls back to current cache.
    return { session, error: null };
  }

  const auth = {
    async getSession() {
      const { session } = await fetchSessionFromServer();
      // Stale-guard: if a login/logout landed mid-flight, trust the cache.
      return { data: { session: cachedSession ?? session ?? null } };
    },

    async getUser() {
      const { session, error } = await fetchSessionFromServer();
      if (error && !session) return { data: { user: null }, error };
      return { data: { user: session?.user ?? null }, error: null };
    },

    async signInWithPassword(credentials = {}) {
      const { email, password } = credentials;
      let res;
      try {
        res = await rawFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
      } catch (e) {
        return {
          data: { user: null, session: null },
          error: authError(`Network error: ${e.message}`, 0),
        };
      }
      if (!res.ok || !res.payload?.user) {
        const message =
          (res.payload && (res.payload.error || res.payload.message)) ||
          'Email atau password salah.';
        // Never log credentials.
        return { data: { user: null, session: null }, error: authError(message, res.status) };
      }
      const user = toSupabaseUser(res.payload.user);
      cachedSession = toSession(user);
      sessionVersion++; // invalidate in-flight /me fetches (INITIAL_SESSION race)
      emit('SIGNED_IN', cachedSession);
      return { data: { user, session: cachedSession }, error: null };
    },

    async signOut() {
      try {
        await rawFetch('/api/auth/logout', { method: 'POST' });
      } catch (_e) {
        // Even on network failure, clear local state so the UI signs out.
      }
      cachedSession = null;
      sessionVersion++; // invalidate in-flight /me fetches
      emit('SIGNED_OUT', null);
      return { error: null };
    },

    /**
     * Native backend has no public signup (POST /api/auth/register is
     * admin-only). Always fail with a clear, user-facing message so
     * SupabaseAuthContext.signUp surfaces it via toast.
     */
    async signUp() {
      return {
        data: { user: null, session: null },
        error: authError(REGISTRATION_DISABLED_MESSAGE, 403),
      };
    },

    /**
     * PATCH /api/auth/me if the server implements profile updates.
     * The current server does NOT (404/405) -> no-op returning { error: null }
     * so AccountSettings.jsx does not break. On success, refetch and emit
     * USER_UPDATED.
     */
    async updateUser(attributes = {}) {
      let res;
      try {
        res = await rawFetch('/api/auth/me', {
          method: 'PATCH',
          body: JSON.stringify(attributes?.data ?? attributes ?? {}),
        });
      } catch (_e) {
        // Endpoint unreachable -> treat as no-op success (spec).
        return { data: { user: cachedSession?.user ?? null }, error: null };
      }
      if (res.status === 404 || res.status === 405) {
        // No update endpoint on the server: no-op success.
        return { data: { user: cachedSession?.user ?? null }, error: null };
      }
      if (!res.ok) {
        return {
          data: { user: cachedSession?.user ?? null },
          error: authError((res.payload && (res.payload.error || res.payload.message)) || `HTTP ${res.status}`, res.status),
        };
      }
      const { session } = await fetchSessionFromServer();
      if (session) emit('USER_UPDATED', session);
      return { data: { user: session?.user ?? null }, error: null };
    },

    onAuthStateChange(callback) {
      if (typeof callback === 'function') listeners.add(callback);

      // supabase-js fires INITIAL_SESSION (async) for every new subscriber.
      let cancelled = false;
      Promise.resolve().then(async () => {
        const session = cachedSession ?? (await fetchSessionFromServer()).session;
        if (cancelled) return;
        try {
          callback('INITIAL_SESSION', session ?? null);
        } catch (err) {
          console.error('[nativeClient] INITIAL_SESSION listener error:', err);
        }
      });

      const subscription = {
        unsubscribe() {
          cancelled = true;
          listeners.delete(callback);
        },
      };
      return { data: { subscription } };
    },
  };

  // ── realtime: polling shim ──────────────────────────────────────────────────
  const channels = new Map();

  function channel(name) {
    const ch = {
      _name: name,
      _bindings: [],
      _intervalId: null,
      _status: 'CLOSED',

      /**
       * .on('postgres_changes', { event, schema, table, filter }, cb)
       * Filter metadata is stored but NOT evaluated — every tick invokes every
       * callback with an EMPTY payload ({ new: {}, old: {} }); consumers only
       * refetch. Also accepts .on('broadcast'|'presence', ...) as no-ops that
       * still register the callback (nothing else uses them today).
       */
      on(type, filterOrEvent, cb) {
        ch._bindings.push({ type, filter: filterOrEvent, cb });
        return ch;
      },

      /** supabase-js: .subscribe(cb?) where cb is (status, err) => void. */
      subscribe(cb) {
        if (typeof cb === 'function') {
          // supabase-js also treats a function passed to .subscribe() as a
          // status callback — call it with SUBSCRIBED, but do NOT register it
          // as a polling binding.
          try {
            cb('SUBSCRIBED', null);
          } catch (_e) { /* ignore */ }
        }
        if (ch._intervalId === null && ch._bindings.length > 0) {
          ch._status = 'SUBSCRIBED';
          ch._intervalId = setInterval(() => {
            for (const binding of Array.from(ch._bindings)) {
              if (typeof binding.cb !== 'function') continue;
              try {
                binding.cb({
                  schema: binding.filter?.schema ?? 'public',
                  table: binding.filter?.table ?? null,
                  commit_timestamp: new Date().toISOString(),
                  eventType: binding.filter?.event ?? '*',
                  // POLLING: no real change data — payloads are empty.
                  new: {},
                  old: {},
                  errors: null,
                });
              } catch (err) {
                console.error('[nativeClient] channel polling callback error:', err);
              }
            }
          }, pollMs);
        }
        // supabase-js .subscribe() returns the channel itself.
        return ch;
      },

      /** Stops polling. Resolves like RealtimeChannel.unsubscribe(). */
      unsubscribe() {
        if (ch._intervalId !== null) {
          clearInterval(ch._intervalId);
          ch._intervalId = null;
        }
        ch._status = 'CLOSED';
        channels.delete(name);
        return Promise.resolve({ status: 'ok' });
      },
    };

    channels.set(name, ch);
    return ch;
  }

  function removeChannel(ch) {
    if (ch && typeof ch.unsubscribe === 'function') return ch.unsubscribe();
    return Promise.resolve({ status: 'ok' });
  }

  function removeAllChannels() {
    const results = Array.from(channels.values()).map((ch) => ch.unsubscribe());
    channels.clear();
    return Promise.all(results);
  }

  // Merge the data shim (.from/.rpc) with auth + realtime namespaces.
  const client = Object.assign({}, apiClient, {
    auth,
    channel,
    removeChannel,
    removeAllChannels,
    getChannels: () => Array.from(channels.values()),
    // Marker so code can detect mode at runtime if ever needed.
    isNativeCompat: true,
  });

  return client;
}

export default createNativeSupabaseCompat;
