/**
 * tests/apiClient.test.js — unit tests for src/lib/apiClient.js shim.
 * Runs in jsdom (vite.config.js test.environment) but uses an injected fetchImpl,
 * so no real network.
 */
import { describe, it, expect, vi } from 'vitest';
import { createApiClient, parseOrString } from '../src/lib/apiClient.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function makeFetch(response) {
  const fn = vi.fn(async () => response);
  fn.lastBody = () => JSON.parse(fn.mock.calls[fn.mock.calls.length - 1][1].body);
  fn.lastUrl = () => fn.mock.calls[fn.mock.calls.length - 1][0];
  fn.lastInit = () => fn.mock.calls[fn.mock.calls.length - 1][1];
  return fn;
}

describe('apiClient: chain builds correct request body', () => {
  it('select with filters/order/range posts expected JSON to /api/data/query', async () => {
    const f = makeFetch(jsonResponse(200, { data: [], count: 0 }));
    const client = createApiClient({ fetchImpl: f });
    await client
      .from('transactions')
      .select('id, customer_name, cash_amount')
      .eq('apartment_location', 'L1')
      .neq('status', 'cancelled')
      .gt('cash_amount', 100)
      .gte('created_at', '2026-01-01')
      .lt('id', 50)
      .lte('id', 40)
      .in('shift', ['Pagi', 'Malam'])
      .is('checkout_at', null)
      .like('customer_name', '%bu%')
      .ilike('customer_name', '%BU%')
      .order('created_at', { ascending: false })
      .range(20, 39);

    expect(f.lastUrl()).toBe('/api/data/query');
    expect(f.lastInit().credentials).toBe('include');
    expect(f.lastInit().method).toBe('POST');
    const body = f.lastBody();
    expect(body.table).toBe('transactions');
    expect(body.op).toBe('select');
    expect(body.columns).toEqual(['id', 'customer_name', 'cash_amount']);
    expect(body.filters).toEqual(
      expect.arrayContaining([
        { column: 'apartment_location', op: 'eq', value: 'L1' },
        { column: 'status', op: 'neq', value: 'cancelled' },
        { column: 'cash_amount', op: 'gt', value: 100 },
        { column: 'created_at', op: 'gte', value: '2026-01-01' },
        { column: 'id', op: 'lt', value: 50 },
        { column: 'id', op: 'lte', value: 40 },
        { column: 'shift', op: 'in', value: ['Pagi', 'Malam'] },
        { column: 'checkout_at', op: 'is-null', value: null },
        { column: 'customer_name', op: 'like', value: '%bu%' },
        { column: 'customer_name', op: 'ilike', value: '%BU%' },
      ])
    );
    expect(body.order).toEqual([{ column: 'created_at', direction: 'desc' }]);
    expect(body.limit).toBe(20);
    expect(body.offset).toBe(20);
  });

  it('insert/update/delete/upsert bodies', async () => {
    const f = makeFetch(jsonResponse(200, { data: [{ id: 1 }], count: 1 }));
    const client = createApiClient({ fetchImpl: f });

    await client.from('pengeluaran').insert({ nama_pengeluaran: 'Air', jumlah: 5000 });
    expect(f.lastBody()).toMatchObject({ op: 'insert', table: 'pengeluaran', values: { nama_pengeluaran: 'Air', jumlah: 5000 } });

    await client.from('pengeluaran').update({ jumlah: 6000 }).eq('id', 3);
    expect(f.lastBody()).toMatchObject({ op: 'update', values: { jumlah: 6000 }, filters: [{ column: 'id', op: 'eq', value: 3 }] });

    await client.from('pengeluaran').delete().eq('id', 3);
    expect(f.lastBody()).toMatchObject({ op: 'delete', filters: [{ column: 'id', op: 'eq', value: 3 }] });

    await client.from('notification_preferences').upsert({ push_enabled: true }, { onConflict: 'user_id' });
    expect(f.lastBody()).toMatchObject({ op: 'upsert', onConflict: ['user_id'] });
  });

  it('.or() postgrest string is parsed into filter groups', async () => {
    const f = makeFetch(jsonResponse(200, { data: [], count: 0 }));
    const client = createApiClient({ fetchImpl: f });
    await client
      .from('nomor_kamar')
      .select('*')
      .or('status.eq.Checked-In,status.eq.Booked');
    const body = f.lastBody();
    expect(body.filters).toEqual([
      { or: [
        { column: 'status', op: 'eq', value: 'Checked-In' },
        { column: 'status', op: 'eq', value: 'Booked' },
      ] },
    ]);
  });

  it('parseOrString handles in() and is.null', () => {
    expect(parseOrString('id.in.(1,2,3)')).toEqual([{ column: 'id', op: 'in', value: ['1', '2', '3'] }]);
    expect(parseOrString('checkout_at.is.null')).toEqual([{ column: 'checkout_at', op: 'is-null', value: null }]);
  });

  it('.rpc() posts fn + params to /api/data/rpc', async () => {
    const f = makeFetch(jsonResponse(200, { data: [{ category: 'Air', total_amount: 5 }], count: 1 }));
    const client = createApiClient({ fetchImpl: f });
    const res = await client.rpc('get_category_summary', { p_lokasi: 'L1' });
    expect(f.lastUrl()).toBe('/api/data/rpc');
    expect(f.lastBody()).toEqual({ fn: 'get_category_summary', params: { p_lokasi: 'L1' } });
    expect(res.data).toEqual([{ category: 'Air', total_amount: 5 }]);
    expect(res.error).toBeNull();
  });
});

describe('apiClient: single/maybeSingle', () => {
  it('.single() returns one object (not array)', async () => {
    const f = makeFetch(jsonResponse(200, { data: [{ id: 1, name: 'A' }], count: 1 }));
    const client = createApiClient({ fetchImpl: f });
    const res = await client.from('karyawan_list').select('*').eq('id', 1).single();
    expect(res.data).toEqual({ id: 1, name: 'A' });
    expect(res.error).toBeNull();
  });

  it('.single() with zero rows returns PGRST116-style error, data null', async () => {
    const f = makeFetch(jsonResponse(200, { data: [], count: 0 }));
    const client = createApiClient({ fetchImpl: f });
    const res = await client.from('karyawan_list').select('*').eq('id', 999).single();
    expect(res.data).toBeNull();
    expect(res.error).toBeTruthy();
    expect(res.error.code).toBe('PGRST116');
  });

  it('.maybeSingle() with zero rows returns data null and NO error', async () => {
    const f = makeFetch(jsonResponse(200, { data: [], count: 0 }));
    const client = createApiClient({ fetchImpl: f });
    const res = await client.from('karyawan_list').select('*').eq('id', 999).maybeSingle();
    expect(res.data).toBeNull();
    expect(res.error).toBeNull();
  });

  it('.maybeSingle() with one row returns the object', async () => {
    const f = makeFetch(jsonResponse(200, { data: [{ id: 2 }], count: 1 }));
    const client = createApiClient({ fetchImpl: f });
    const res = await client.from('karyawan_list').select('*').eq('id', 2).maybeSingle();
    expect(res.data).toEqual({ id: 2 });
    expect(res.error).toBeNull();
  });
});

describe('apiClient: error shape on HTTP failures', () => {
  it('401 resolves to { data: null, error: {...} } — never throws', async () => {
    const f = makeFetch(jsonResponse(401, { error: 'Sesi tidak valid atau telah kadaluarsa.', code: 'UNAUTHENTICATED' }));
    const client = createApiClient({ fetchImpl: f });
    const res = await client.from('transactions').select('*');
    expect(res.data).toBeNull();
    expect(res.error).toMatchObject({
      message: 'Sesi tidak valid atau telah kadaluarsa.',
      code: 'UNAUTHENTICATED',
      status: 401,
    });
    expect(res.error.details).toBe('');
    expect(res.error.hint).toBeNull();
  });

  it('500 resolves to error shape', async () => {
    const f = makeFetch(jsonResponse(500, { error: 'Gagal memproses permintaan data.', code: 'INTERNAL' }));
    const client = createApiClient({ fetchImpl: f });
    const res = await client.from('transactions').insert({ customer_name: 'x' });
    expect(res.data).toBeNull();
    expect(res.error.code).toBe('INTERNAL');
    expect(res.error.status).toBe(500);
  });

  it('403 policy denial surfaces server message', async () => {
    const f = makeFetch(jsonResponse(403, { error: "Role 'karyawan' may not insert on this table.", code: 'ROLE_DENIED' }));
    const client = createApiClient({ fetchImpl: f });
    const res = await client.from('lokasi_apartemen').insert({ name: 'X' });
    expect(res.error.code).toBe('ROLE_DENIED');
    expect(res.error.message).toMatch(/may not insert/);
  });

  it('network failure resolves to NETWORK_ERROR shape', async () => {
    const f = vi.fn(async () => { throw new Error('fetch failed'); });
    const client = createApiClient({ fetchImpl: f });
    const res = await client.from('transactions').select('*');
    expect(res.data).toBeNull();
    expect(res.error.code).toBe('NETWORK_ERROR');
  });

  it('rpc 401 error shape', async () => {
    const f = makeFetch(jsonResponse(401, { error: 'Sesi tidak valid.' }));
    const client = createApiClient({ fetchImpl: f });
    const res = await client.rpc('get_category_summary', {});
    expect(res.data).toBeNull();
    expect(res.error.status).toBe(401);
    expect(res.error.code).toBe('401');
  });

  it('non-JSON error response falls back to HTTP <status> Error', async () => {
    const f = makeFetch({
      ok: false,
      status: 502,
      headers: { get: () => 'text/html' },
      json: async () => { throw new Error('not json'); },
      text: async () => '<html>bad gateway</html>',
    });
    const client = createApiClient({ fetchImpl: f });
    const res = await client.from('transactions').select('*');
    expect(res.error.message).toMatch(/502|bad gateway/i);
  });
});
