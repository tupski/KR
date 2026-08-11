1// A5 — apiClient query builder: return shape { data, error }, URL building,
// pagination params, error handling (network + HTTP). Mocks global.fetch.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as api from './apiClient';

describe('apiClient A5', () => {
  let mockFetch;
  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    globalThis.document = { cookie: '' };
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.fetch;
    delete globalThis.document;
  });

  it('rpc → POST /api/rpc/:name dengan body params; return { data, error }', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ data: [{ total_count: 3 }] }),
    });
    const r = await api.rpc('get_category_summary', { p_apartment: 'Tower A' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/rpc/get_category_summary'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(mockFetch.mock.calls[0][1].body).toContain('"p_apartment":"Tower A"');
    expect(r.data[0].total_count).toBe(3);
    expect(r.error).toBeNull();
  });

  it('from(t).select().eq().gte().order().range() → query string benar + count', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ data: [], totalCount: 0 }),
    });
    const r = await api
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('apartment_location', 'Tower A')
      .gte('checkin_at', '2026-01-01')
      .order('created_at', { ascending: false })
      .range(0, 9);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/db/transactions');
    expect(url).toContain('count=exact');
    expect(decodeURIComponent(url)).toContain('range=0,9');
    expect(url).toContain('order=created_at');
    expect(url).toContain('asc=false');
    expect(decodeURIComponent(url).replace(/\+/g, ' ')).toContain('"col":"apartment_location","op":"eq","value":"Tower A"');
    expect(r.error).toBeNull();
  });

  it('filter in + or + maybeSingle → serialized benar', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ data: [{ id: 1 }], totalCount: 1 }),
    });
    const r = await api
      .from('notifications')
      .select('id')
      .in('audience_role', ['admin', 'all'])
      .or('and(a.gte.1,a.lt.2),and(b.is.null)')
      .maybeSingle();
    const [url] = mockFetch.mock.calls[0];
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('"op":"in"');
    expect(decoded).toContain('"op":"or"');
    expect(r.data.id).toBe(1);
  });

  it('maybeSingle kosong → data null tanpa error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ data: [], totalCount: 0 }),
    });
    const r = await api.from('user_roles').select('role').eq('user_id', 'x').maybeSingle();
    expect(r.data).toBeNull();
    expect(r.error).toBeNull();
  });

  it('HTTP error → { data:null, error:{ message, code } }', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 401, json: async () => ({ error: 'Session expired' }),
    });
    const r = await api.rpc('x', {});
    expect(r.data).toBeNull();
    expect(r.error.code).toBe(401);
    expect(r.error.message).toBe('Session expired');
  });

  it('network error → { data:null, error:{ message } } tanpa throw', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'));
    const r = await api.from('notifications').select('id');
    expect(r.error.message).toBe('Failed to fetch');
    expect(r.data).toBeNull();
  });

  it('update memakai .eq("id") → PATCH /api/db/:table/:id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ data: { id: 7 } }),
    });
    const r = await api.from('transactions').update({ checkout_at: '2026-01-02' }).eq('id', 7);
    expect(mockFetch.mock.calls[0][0]).toContain('/api/db/transactions/7');
    expect(mockFetch.mock.calls[0][1].method).toBe('PATCH');
    expect(r.data.id).toBe(7);
  });

  it('insert (single) → POST /api/db/:table; insert().select().single() → data row', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ data: { id: 'tx1', created_at: '2026-01-01' } }),
    });
    const r = await api.from('transactions').insert({ user_id: 'u1' }).select('id, created_at').single();
    expect(mockFetch.mock.calls[0][0]).toContain('/api/db/transactions');
    expect(r.data.id).toBe('tx1');
  });

  it('delete .eq("id") → DELETE /api/db/:table/:id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ data: { deleted: 1 } }),
    });
    const r = await api.from('pengeluaran').delete().eq('id', 12);
    expect(mockFetch.mock.calls[0][0]).toContain('/api/db/pengeluaran/12');
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    expect(r.data.deleted).toBe(1);
  });

  it('auth.getSession 401 → session null tanpa error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }),
    });
    const { data } = await api.auth.getSession();
    expect(data.session).toBeNull();
  });

  it('auth.signInWithPassword sukses → session + event fired', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ user: { id: 'u1', email: 'a@b.c' } }),
    });
    const events = [];
    api.auth.onAuthStateChange((ev) => events.push(ev));
    // buang event INITIAL_SESSION dari subscribe
    events.length = 0;
    const r = await api.auth.signInWithPassword({ email: 'a@b.c', password: 'x' });
    expect(r.error).toBeNull();
    expect(r.data.session.user.id).toBe('u1');
    expect(events).toContain('SIGNED_IN');
    api.auth._listeners.clear();
  });

  it('credentials include + X-Requested-With header selalu dipasang', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ data: [] }),
    });
    await api.from('system_settings').select('*');
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.credentials).toBe('include');
    expect(opts.headers['X-Requested-With']).toBe('XMLHttpRequest');
  });
});