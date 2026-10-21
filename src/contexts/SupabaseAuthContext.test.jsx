/**
 * Regression tests — auth-triggered page remount fix.
 *
 * Bug: SIGNED_IN / USER_UPDATED untuk user yang sama memicu role sync ulang
 * sehingga `loading: loading || isSyncingRole` flip true → konten terautentikasi
 * (termasuk form) unmount dan state form hilang.
 *
 * Fix yang diuji:
 * - Same-user refresh: TIDAK restart role sync, TIDAK ada frame loading=true
 * - Ganti user sungguhan: role query di-issued ulang untuk user baru
 * - Stale guard: response role lama tidak menimpa role user baru
 * - SIGNED_OUT: reset bersih, loading tidak stuck
 */

import React, { useEffect, useRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup, waitFor } from '@testing-library/react';

// ── Fake supabase client (vi.hoisted — factory mock tidak boleh akses outer let) ──

const { fakeSupabase, mockState } = vi.hoisted(() => {
  const state = {
    roleQueryCount: 0,
    roleResolver: null, // manual control untuk stale-response test
  };

  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: vi.fn(async () => ({ error: null })),
      signInWithPassword: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn((table) => {
      if (table === 'user_roles') {
        state.roleQueryCount += 1;
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => new Promise((resolve) => {
                if (state.roleResolver) state.roleResolver(resolve);
                else resolve({ data: { role: 'admin' }, error: null });
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
    channel: vi.fn(() => {
      const chain = { on: () => chain, subscribe: () => chain };
      return chain;
    }),
    removeChannel: vi.fn(),
  };

  return { fakeSupabase: client, mockState: state };
});

vi.mock('@/lib/customSupabaseClient', () => ({ supabase: fakeSupabase }));
vi.mock('@/components/ui/use-toast', () => ({ toast: vi.fn() }));

let AuthProvider, useAuth;

const loadContext = async () => {
  const mod = await import('./SupabaseAuthContext');
  AuthProvider = mod.AuthProvider;
  useAuth = mod.useAuth;
};

// ── Harness ─────────────────────────────────────────────────────────────────

const makeSession = (userId, token) => ({
  access_token: token || `token-${userId}`,
  user: { id: userId, user_metadata: { name: `user-${userId}` } },
});

const loadingLog = [];
let emitContextValue = null;
let authCallback = null;

const Probe = () => {
  const value = useAuth();
  const prevLoading = useRef(null);

  useEffect(() => {
    // Log setiap frame loading=true (deteksi loading flash)
    if (value.loading && prevLoading.current !== true) {
      loadingLog.push(true);
    }
    prevLoading.current = value.loading;
  });

  useEffect(() => {
    emitContextValue = () => value;
  });

  return <div data-testid="probe">{JSON.stringify({ u: value.user?.id, r: value.userRole, l: value.loading })}</div>;
};

const renderProvider = () => render(
  <AuthProvider>
    <Probe />
  </AuthProvider>
);

const emit = (event, session) => act(async () => {
  await authCallback(event, session);
});

// Fire event TANPA menunggu callback selesai (meniru supabase-js, yang tidak
// menunggu listener) — TANPA membuka scope act baru, supaya scope act berikutnya
// tidak saling interleaving.
const emitNoAwait = (event, session) => {
  Promise.resolve().then(() => authCallback(event, session)).catch(() => { });
};

const flush = () => act(async () => { await Promise.resolve(); });

describe('SupabaseAuthContext — remount fix regression', () => {
  beforeEach(async () => {
    await loadContext();
    vi.clearAllMocks();
    loadingLog.length = 0;
    mockState.roleQueryCount = 0;
    mockState.roleResolver = null;
    authCallback = null;
    emitContextValue = null;
    localStorage.clear();
    fakeSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
  });

  afterEach(() => cleanup());

  it('initial session with user → user set, role resolved, loading false', async () => {
    fakeSupabase.auth.getSession.mockResolvedValue({ data: { session: makeSession('user-1') } });
    fakeSupabase.auth.onAuthStateChange.mockImplementation((cb) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    renderProvider();
    await flush();

    expect(emitContextValue().user?.id).toBe('user-1');
    expect(emitContextValue().userRole).toBe('admin');
    expect(emitContextValue().loading).toBe(false);
    expect(mockState.roleQueryCount).toBe(1);
  });

  it('SIGNED_IN same user → NO loading frame, NO role re-query, session updated', async () => {
    fakeSupabase.auth.getSession.mockResolvedValue({ data: { session: makeSession('user-1', 'tok-a') } });
    fakeSupabase.auth.onAuthStateChange.mockImplementation((cb) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    renderProvider();
    await flush();
    mockState.roleQueryCount = 0;
    loadingLog.length = 0; // buang frame loading initial mount — yang diuji: TIDAK ada frame loading TAMBAHAN

    await emit('SIGNED_IN', makeSession('user-1', 'tok-b'));

    expect(loadingLog).not.toContain(true);
    expect(mockState.roleQueryCount).toBe(0);
    expect(emitContextValue().session?.access_token).toBe('tok-b');
    expect(emitContextValue().loading).toBe(false);
  });

  it('TOKEN_REFRESHED same user → no loading frame, no role query, session updated', async () => {
    fakeSupabase.auth.getSession.mockResolvedValue({ data: { session: makeSession('user-1', 'tok-a') } });
    fakeSupabase.auth.onAuthStateChange.mockImplementation((cb) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    renderProvider();
    await flush();
    mockState.roleQueryCount = 0;
    loadingLog.length = 0; // buang frame loading initial mount

    await emit('TOKEN_REFRESHED', makeSession('user-1', 'tok-c'));

    expect(loadingLog).not.toContain(true);
    expect(mockState.roleQueryCount).toBe(0);
    expect(emitContextValue().session?.access_token).toBe('tok-c');
  });

  it('SIGNED_IN different user → role query re-issued for new user, role updated', async () => {
    fakeSupabase.auth.getSession.mockResolvedValue({ data: { session: makeSession('user-1') } });
    fakeSupabase.auth.onAuthStateChange.mockImplementation((cb) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    renderProvider();
    await flush();
    mockState.roleQueryCount = 0;

    // User baru punya role 'karyawan'
    // PENTING: increment counter manual — mockImplementationOnce MENGGANTIKAN
    // implementasi hoisted default yang biasanya menghitung query
    fakeSupabase.from.mockImplementationOnce(() => {
      mockState.roleQueryCount += 1;
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'karyawan' }, error: null }) }) }),
      };
    });

    await emit('SIGNED_IN', makeSession('user-2', 'tok-2'));

    expect(mockState.roleQueryCount).toBe(1);
    expect(emitContextValue().user?.id).toBe('user-2');
    expect(emitContextValue().userRole).toBe('karyawan');
    expect(emitContextValue().loading).toBe(false);
  });

  it('stale role response: role A resolving after B must NOT overwrite B role', async () => {
    // Initial: user-1, role query A manual-controlled
    // (mockImplementationOnce MENGGANTIKAN implementasi hoisted yang menghitung
    // query — increment manual di setiap Once impl)
    let resolveA;
    fakeSupabase.from.mockImplementationOnce(() => {
      mockState.roleQueryCount += 1;
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => new Promise((res) => { resolveA = res; }) }) }),
      };
    });
    fakeSupabase.auth.getSession.mockResolvedValue({ data: { session: makeSession('user-1') } });
    fakeSupabase.auth.onAuthStateChange.mockImplementation((cb) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    renderProvider();
    await flush();

    // Query A harus resolve supaya initial load selesai (initialLoadDone = true),
    // sebelum event SIGNED_IN manapun diproses
    await act(async () => {
      resolveA({ data: { role: 'admin' }, error: null });
      await Promise.resolve();
    });
    await flush();
    expect(emitContextValue().userRole).toBe('admin');

    // Switch ke user-2 — query B manual-pending (in flight saat user berganti lagi)
    let resolveB;
    fakeSupabase.from.mockImplementationOnce(() => {
      mockState.roleQueryCount += 1;
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => new Promise((res) => { resolveB = res; }) }) }),
      };
    });
    // Sengaja TIDAK di-await: handleSession menunggu query role B yang manual-pending.
    // Di produksi supabase-js TIDAK menunggu callback listener — fire-and-forget
    // meniru perilaku aslinya. (Await di sini = deadlock: act queue tidak pernah
    // drain → test timeout + test berikutnya kehilangan efek render.)
    emitNoAwait('SIGNED_IN', makeSession('user-2', 'tok-2'));
    await waitFor(() => expect(mockState.roleQueryCount).toBe(2)); // A=1, B=2

    // Switch ke user-3 — query C resolve langsung (karyawan)
    fakeSupabase.from.mockImplementationOnce(() => {
      mockState.roleQueryCount += 1;
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'karyawan' }, error: null }) }) }),
      };
    });
    await emit('SIGNED_IN', makeSession('user-3', 'tok-3'));
    expect(emitContextValue().userRole).toBe('karyawan');

    // Response stale user-2 (admin) tiba belakangan → harus diabaikan (guard userRef)
    await act(async () => {
      resolveB({ data: { role: 'admin' }, error: null });
      await Promise.resolve();
    });
    await flush();

    expect(emitContextValue().userRole).toBe('karyawan');
    expect(emitContextValue().user?.id).toBe('user-3');
    expect(emitContextValue().loading).toBe(false);
  });

  it('SIGNED_OUT → user/session/role null, loading false (not stuck)', async () => {
    fakeSupabase.auth.getSession.mockResolvedValue({ data: { session: makeSession('user-1') } });
    fakeSupabase.auth.onAuthStateChange.mockImplementation((cb) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    renderProvider();
    await flush();

    await emit('SIGNED_OUT', null);

    const value = emitContextValue();
    expect(value.user).toBeNull();
    expect(value.session).toBeNull();
    expect(value.userRole).toBeNull();
    expect(value.loading).toBe(false);
  });

  it('USER_UPDATED same user → metadata updated, no loading flash, no duplicate role query', async () => {
    fakeSupabase.auth.getSession.mockResolvedValue({ data: { session: makeSession('user-1') } });
    fakeSupabase.auth.onAuthStateChange.mockImplementation((cb) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    renderProvider();
    await flush();
    mockState.roleQueryCount = 0;
    loadingLog.length = 0; // buang frame loading initial mount

    const updated = {
      access_token: 'tok-b',
      user: { id: 'user-1', user_metadata: { name: 'renamed' } },
    };
    await emit('USER_UPDATED', updated);

    expect(loadingLog).not.toContain(true);
    expect(mockState.roleQueryCount).toBe(0);
    expect(emitContextValue().user?.user_metadata?.name).toBe('renamed');
    expect(emitContextValue().userRole).toBe('admin'); // role tetap
  });

  it('INITIAL_SESSION → session/user updated without loading frame or role re-query', async () => {
    // Setup: tidak ada user awal (getSession → null)
    fakeSupabase.auth.onAuthStateChange.mockImplementation((cb) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    renderProvider();
    await flush();
    mockState.roleQueryCount = 0;
    loadingLog.length = 0; // buang frame loading initial mount

    await emit('INITIAL_SESSION', makeSession('user-1', 'tok-i'));

    expect(emitContextValue().user?.id).toBe('user-1');
    expect(emitContextValue().session?.access_token).toBe('tok-i');
    expect(loadingLog).not.toContain(true);
    expect(mockState.roleQueryCount).toBe(0); // INITIAL_SESSION tidak trigger role sync
    expect(emitContextValue().userRole).toBeNull(); // tidak ada query user_roles
    expect(emitContextValue().loading).toBe(false);
  });

  it('INITIAL_SESSION with null session → no state change, no crash', async () => {
    fakeSupabase.auth.onAuthStateChange.mockImplementation((cb) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    renderProvider();
    await flush();
    mockState.roleQueryCount = 0;
    loadingLog.length = 0;

    await emit('INITIAL_SESSION', null);

    expect(emitContextValue().user).toBeNull();
    expect(emitContextValue().session).toBeNull();
    expect(emitContextValue().userRole).toBeNull();
    expect(mockState.roleQueryCount).toBe(0);
    expect(loadingLog).not.toContain(true);
  });
});
