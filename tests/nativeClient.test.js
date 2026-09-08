/**
 * tests/nativeClient.test.js
 *
 * Covers:
 *  - createNativeSupabaseCompat auth contract (getSession / signInWithPassword /
 *    signOut / onAuthStateChange events) with a mocked fetch — no live server.
 *  - Polling-based .channel() shim (interval fires callbacks; unsubscribe /
 *    removeChannel clears it) with vi.useFakeTimers.
 *  - VITE_API_MODE fallback logic in src/lib/customSupabaseClient.js
 *    ('native' -> native compat client; unset -> legacy @supabase/supabase-js).
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createNativeSupabaseCompat } from '../src/lib/nativeClient.js';

// customSupabaseClient statically imports './apiClient.js' (owned by another
// agent). Mock it so these tests never depend on its internals.
vi.mock('../src/lib/apiClient.js', () => ({
  createApiClient: vi.fn(() => ({
    from: vi.fn(() => ({ select: vi.fn(() => Promise.resolve({ data: [], error: null })) })),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  })),
  apiClient: {},
}));

// The mocked @/components/ui/use-toast keeps SupabaseAuthContext importable,
// but this suite does not render components — no extra mocks needed beyond
// apiClient.

function makeFetchMock(routes) {
  // routes: (url, init) => ({ status, body }) | undefined (undefined -> 404)
  return vi.fn(async (url, init = {}) => {
    const match = routes(url, init);
    const status = match?.status ?? 404;
    const body = match?.body ?? { error: 'Not found' };
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  });
}

const NATIVE_USER = {
  id: 'u-1',
  email: 'boss@example.com',
  full_name: 'Juragan Kos',
  phone: '08123',
  avatar_url: 'https://x/avatar.png',
  role: 'super_admin',
};

describe('createNativeSupabaseCompat — auth', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('getSession returns a supabase-shaped session after GET /api/auth/me 200', async () => {
    fetchMock = makeFetchMock((url, init) => {
      if (url.endsWith('/api/auth/me') && (init.method ?? 'GET') === 'GET') {
        return { status: 200, body: { user: NATIVE_USER } };
      }
    });
    const client = createNativeSupabaseCompat({ from: vi.fn(), rpc: vi.fn() }, { fetchImpl: fetchMock });

    const { data } = await client.auth.getSession();
    expect(data.session).toBeTruthy();
    expect(data.session.user.id).toBe('u-1');
    expect(data.session.user.email).toBe('boss@example.com');
    expect(data.session.user.user_metadata.full_name).toBe('Juragan Kos');
    expect(data.session.user.user_metadata.avatar_url).toBe('https://x/avatar.png');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/auth/me'), expect.objectContaining({ credentials: 'include' }));
  });

  it('getSession returns { session: null } after 401', async () => {
    fetchMock = makeFetchMock((url) => {
      if (url.endsWith('/api/auth/me')) return { status: 401, body: { error: 'Sesi tidak valid atau telah kadaluarsa.' } };
    });
    const client = createNativeSupabaseCompat({ from: vi.fn(), rpc: vi.fn() }, { fetchImpl: fetchMock });

    const { data } = await client.auth.getSession();
    expect(data.session).toBeNull();
  });

  it('signInWithPassword success: POSTs /api/auth/login, returns { data: { user, session } }, fires SIGNED_IN', async () => {
    const calls = [];
    fetchMock = makeFetchMock((url, init) => {
      if (url.endsWith('/api/auth/login')) {
        calls.push(JSON.parse(init.body));
        return { status: 200, body: { user: NATIVE_USER, token: 'jwt-abc' } };
      }
      if (url.endsWith('/api/auth/me') && (init.method ?? 'GET') === 'GET') {
        // Server holds the httpOnly cookie — after login /me returns the user.
        return calls.length > 0
          ? { status: 200, body: { user: NATIVE_USER } }
          : { status: 401, body: { error: 'unauthenticated' } };
      }
    });
    const client = createNativeSupabaseCompat({ from: vi.fn(), rpc: vi.fn() }, { fetchImpl: fetchMock });

    const events = [];
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      events.push({ event, session });
    });

    const res = await client.auth.signInWithPassword({ email: 'boss@example.com', password: 'secret123' });
    expect(calls[0]).toEqual({ email: 'boss@example.com', password: 'secret123' });
    expect(res.error).toBeNull();
    expect(res.data.user.id).toBe('u-1');
    expect(res.data.user.user_metadata.full_name).toBe('Juragan Kos');
    expect(res.data.session.user.id).toBe('u-1');
    expect(res.data.session.access_token).toBe('native-cookie-session');

    const signedIn = events.filter((e) => e.event === 'SIGNED_IN');
    expect(signedIn.length).toBe(1);
    expect(signedIn[0].session.user.id).toBe('u-1');

    // getSession after login uses cache, does not refetch /api/auth/me
    const after = await client.auth.getSession();
    expect(after.data.session.user.id).toBe('u-1');

    subscription.unsubscribe();
  });

  it('signInWithPassword failure: returns { error }, does NOT fire SIGNED_IN', async () => {
    fetchMock = makeFetchMock((url) => {
      if (url.endsWith('/api/auth/login')) return { status: 401, body: { error: 'Email atau password salah.' } };
      if (url.endsWith('/api/auth/me')) return { status: 401, body: { error: 'unauthenticated' } };
    });
    const client = createNativeSupabaseCompat({ from: vi.fn(), rpc: vi.fn() }, { fetchImpl: fetchMock });

    const events = [];
    const { data: { subscription } } = client.auth.onAuthStateChange((event) => events.push(event));
    await new Promise((r) => setTimeout(r, 0)); // let INITIAL_SESSION settle

    const res = await client.auth.signInWithPassword({ email: 'boss@example.com', password: 'wrong' });
    expect(res.error).toBeTruthy();
    expect(res.error.message).toBe('Email atau password salah.');
    expect(res.data.user).toBeNull();
    expect(events).not.toContain('SIGNED_IN');

    subscription.unsubscribe();
  });

  it('signOut: POSTs /api/auth/logout and fires SIGNED_OUT', async () => {
    let logoutCalled = false;
    fetchMock = makeFetchMock((url, init) => {
      if (url.endsWith('/api/auth/login')) return { status: 200, body: { user: NATIVE_USER, token: 'jwt' } };
      if (url.endsWith('/api/auth/me') && (init.method ?? 'GET') === 'GET') {
        return logoutCalled
          ? { status: 401, body: { error: 'cookie cleared' } }
          : { status: 200, body: { user: NATIVE_USER } };
      }
      if (url.endsWith('/api/auth/logout')) { logoutCalled = true; return { status: 200, body: { ok: true } }; }
    });
    const client = createNativeSupabaseCompat({ from: vi.fn(), rpc: vi.fn() }, { fetchImpl: fetchMock });

    const events = [];
    const { data: { subscription } } = client.auth.onAuthStateChange((event) => events.push(event));

    await client.auth.signInWithPassword({ email: 'boss@example.com', password: 'secret123' });
    const out = await client.auth.signOut();
    expect(out.error).toBeNull();
    expect(logoutCalled).toBe(true);
    expect(events).toContain('SIGNED_IN');
    expect(events).toContain('SIGNED_OUT');

    // After signOut, getSession returns null session
    const after = await client.auth.getSession();
    expect(after.data.session).toBeNull();

    subscription.unsubscribe();
  });

  it('onAuthStateChange fires INITIAL_SESSION with null session when logged out', async () => {
    fetchMock = makeFetchMock((url) => {
      if (url.endsWith('/api/auth/me')) return { status: 401, body: { error: 'unauthenticated' } };
    });
    const client = createNativeSupabaseCompat({ from: vi.fn(), rpc: vi.fn() }, { fetchImpl: fetchMock });

    const events = [];
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      events.push({ event, session });
    });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(events.some((e) => e.event === 'INITIAL_SESSION')).toBe(true);
    const initial = events.find((e) => e.event === 'INITIAL_SESSION');
    expect(initial.session).toBeNull();

    subscription.unsubscribe();
  });

  it('401 on /api/auth/me after a cached session emits SIGNED_OUT', async () => {
    let meStatus = 200;
    fetchMock = makeFetchMock((url, init) => {
      if (url.endsWith('/api/auth/login')) return { status: 200, body: { user: NATIVE_USER, token: 'jwt' } };
      if (url.endsWith('/api/auth/me') && (init.method ?? 'GET') === 'GET') {
        return meStatus === 200
          ? { status: 200, body: { user: NATIVE_USER } }
          : { status: 401, body: { error: 'expired' } };
      }
    });
    const client = createNativeSupabaseCompat({ from: vi.fn(), rpc: vi.fn() }, { fetchImpl: fetchMock });

    const events = [];
    const { data: { subscription } } = client.auth.onAuthStateChange((event) => events.push(event));
    await client.auth.signInWithPassword({ email: 'boss@example.com', password: 'x' });

    meStatus = 401; // server-side session invalidated
    const { data } = await client.auth.getUser();
    expect(data.user).toBeNull();
    expect(events.filter((e) => e === 'SIGNED_OUT').length).toBeGreaterThanOrEqual(1);

    subscription.unsubscribe();
  });

  it('signUp returns registration-disabled error; updateUser no-ops with { error: null } on 404', async () => {
    fetchMock = makeFetchMock((url, init) => {
      if (url.endsWith('/api/auth/me') && init.method === 'PATCH') return { status: 404, body: { error: 'Not found' } };
    });
    const client = createNativeSupabaseCompat({ from: vi.fn(), rpc: vi.fn() }, { fetchImpl: fetchMock });

    const up = await client.auth.signUp({ email: 'new@example.com', password: 'x' });
    expect(up.error.message).toBe('Pendaftaran harus melalui admin.');
    expect(up.data.session).toBeNull();

    const upd = await client.auth.updateUser({ data: { full_name: 'Nama Baru' } });
    expect(upd.error).toBeNull();
  });
});

describe('createNativeSupabaseCompat — channel polling shim', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const noopFetch = () => Promise.resolve({ ok: true, status: 200, json: async () => ({}) });

  it('channel().on(postgres_changes).subscribe() invokes callbacks on interval', () => {
    const client = createNativeSupabaseCompat({ from: vi.fn(), rpc: vi.fn() }, { fetchImpl: noopFetch });

    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const ch = client
      .channel('system_settings_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings' }, cb1)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, cb2)
      .subscribe();

    expect(cb1).not.toHaveBeenCalled();
    vi.advanceTimersByTime(15000);
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);

    // Payload is empty (polling, not push) — consumers ignore it and refetch.
    const payload = cb1.mock.calls[0][0];
    expect(payload.table).toBe('system_settings');
    expect(payload.new).toEqual({});
    expect(payload.old).toEqual({});

    vi.advanceTimersByTime(30000);
    expect(cb1).toHaveBeenCalledTimes(3);

    client.removeChannel(ch);
  });

  it('subscribe() returns the channel; pollMs is configurable', () => {
    const client = createNativeSupabaseCompat({ from: vi.fn(), rpc: vi.fn() }, { fetchImpl: noopFetch, pollMs: 5000 });

    const cb = vi.fn();
    const ch = client.channel('c').on('postgres_changes', { event: '*', schema: 'public', table: 't' }, cb).subscribe();
    expect(ch.on).toBe(ch.on); // subscribe() returned the channel itself
    expect(typeof ch.unsubscribe).toBe('function');

    vi.advanceTimersByTime(5000);
    expect(cb).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(4999);
    expect(cb).toHaveBeenCalledTimes(1);

    ch.unsubscribe();
  });

  it('unsubscribe() and removeChannel() stop the interval', () => {
    const client = createNativeSupabaseCompat({ from: vi.fn(), rpc: vi.fn() }, { fetchImpl: noopFetch });

    const cb = vi.fn();
    const ch = client.channel('role_sync_u1').on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles', filter: 'user_id=eq.u-1' }, cb).subscribe();

    vi.advanceTimersByTime(15000);
    expect(cb).toHaveBeenCalledTimes(1);

    client.removeChannel(ch);
    vi.advanceTimersByTime(60000);
    expect(cb).toHaveBeenCalledTimes(1); // no further ticks

    // Second channel, cleared via channel.unsubscribe() directly
    const cb2 = vi.fn();
    const ch2 = client.channel('notif').on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, cb2).subscribe();
    vi.advanceTimersByTime(15000);
    expect(cb2).toHaveBeenCalledTimes(1);
    ch2.unsubscribe();
    vi.advanceTimersByTime(45000);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('wraps and preserves the underlying apiClient (.from/.rpc)', async () => {
    const fromSpy = vi.fn(() => ({ select: () => Promise.resolve({ data: [{ id: 1 }], error: null }) }));
    const rpcSpy = vi.fn(() => Promise.resolve({ data: 42, error: null }));
    const client = createNativeSupabaseCompat({ from: fromSpy, rpc: rpcSpy }, { fetchImpl: noopFetch });

    const q = await client.from('user_roles').select('role');
    expect(fromSpy).toHaveBeenCalledWith('user_roles');
    expect(q.data).toEqual([{ id: 1 }]);

    const r = await client.rpc('some_fn', {});
    expect(rpcSpy).toHaveBeenCalled();
    expect(r.data).toBe(42);
    expect(client.isNativeCompat).toBe(true);
  });
});

describe('customSupabaseClient — VITE_API_MODE fallback logic', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('../src/lib/apiClient.js', () => ({
      createApiClient: vi.fn(() => ({
        from: vi.fn(() => ({ select: vi.fn(() => Promise.resolve({ data: [], error: null })) })),
        rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
      apiClient: {},
    }));
  });

  afterEach(() => {
    vi.doUnmock('../src/lib/apiClient.js');
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("VITE_API_MODE=native -> client is the native compat shim", async () => {
    vi.stubEnv('VITE_API_MODE', 'native');
    const mod = await import('../src/lib/customSupabaseClient.js');
    expect(mod.supabase.isNativeCompat).toBe(true);
    expect(mod.default).toBe(mod.supabase);
    expect(mod.customSupabaseClient).toBe(mod.supabase);
    expect(typeof mod.supabase.auth.getSession).toBe('function');
    expect(typeof mod.supabase.channel).toBe('function');
    expect(typeof mod.supabase.removeChannel).toBe('function');
    expect(typeof mod.supabaseProjectRef).toBe('string');
  });

  it("VITE_API_MODE unset + no Supabase env -> fails fast (no hardcoded fallback)", async () => {
    vi.stubEnv('VITE_API_MODE', undefined);
    // Repo previously had a hardcoded project URL fallback — removed for the
    // self-hosted migration. Legacy mode now requires explicit env config.
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY', '');
    await expect(import('../src/lib/customSupabaseClient.js')).rejects.toThrow(/VITE_SUPABASE_URL/);
  });

  it("VITE_API_MODE unset + valid legacy env -> legacy supabase-js client", async () => {
    vi.stubEnv('VITE_API_MODE', undefined);
    vi.stubEnv('VITE_SUPABASE_URL', 'https://xtpgbsdrfqnsolozybui.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY', 'eyJhbGciOi.test');
    const mod = await import('../src/lib/customSupabaseClient.js');
    expect(mod.supabase.isNativeCompat).toBeUndefined();
    // supabase-js client has its own auth namespace, no polling channel marker
    expect(typeof mod.supabase.auth.getSession).toBe('function');
    expect(mod.supabaseProjectRef).toBe('xtpgbsdrfqnsolozybui');
  });

  it("VITE_API_MODE=other value -> legacy supabase-js client", async () => {
    vi.stubEnv('VITE_API_MODE', 'supabase');
    const mod = await import('../src/lib/customSupabaseClient.js');
    expect(mod.supabase.isNativeCompat).toBeUndefined();
  });
});
