/* eslint-env node */
import { describe, it, expect, vi } from 'vitest';
import {
  createRepository,
  buildSelect,
  buildInsert,
  buildUpdate,
  buildDelete,
  buildUpsert,
  buildRpc,
  PolicyError,
} from '../server/db/repository.js';

const USER_A = { userId: '11111111-1111-1111-1111-111111111111', role: 'karyawan' };
const USER_B_ID = '22222222-2222-2222-2222-222222222222';
const ADMIN = { userId: '33333333-3333-3333-3333-333333333333', role: 'admin' };
const SUPER = { userId: '44444444-4444-4444-4444-444444444444', role: 'super_admin' };

function fakeQuery(rows = []) {
  const calls = [];
  const fn = vi.fn(async (text, params) => {
    calls.push({ text, params });
    return { rows, rowCount: rows.length };
  });
  fn.calls = calls;
  return fn;
}

describe('repository: parameterization', () => {
  it('select builds $n placeholders and never interpolates values into SQL', () => {
    const { text, params } = buildSelect(
      {
        table: 'transactions',
        columns: ['id', 'customer_name'],
        filters: [{ column: 'customer_name', op: 'eq', value: "Robert'); DROP TABLE transactions;--" }],
        order: [{ column: 'created_at', direction: 'desc' }],
        limit: 10,
        offset: 20,
      },
      USER_A
    );
    expect(text).toContain('$1');
    expect(text).not.toContain('Robert');
    expect(text).not.toContain('DROP TABLE');
    expect(params).toContain("Robert'); DROP TABLE transactions;--");
    // owner scope (karyawan) + filter + limit + offset all parameterized
    expect(text).toMatch(/WHERE "user_id" = \$\d+ AND "customer_name" = \$\d+/);
    expect(text).toMatch(/LIMIT \$\d+ OFFSET \$\d+/);
  });

  it('in-filter expands to placeholders', () => {
    const { text, params } = buildSelect(
      { table: 'pengeluaran', filters: [{ column: 'category', op: 'in', value: ['Air', 'Listrik'] }] },
      USER_A
    );
    expect(text).toMatch(/"category" IN \(\$\d+, \$\d+\)/);
    expect(params).toEqual(expect.arrayContaining(['Air', 'Listrik']));
  });

  it('insert parameterizes every value and server-enforces owner user_id', () => {
    const { text, params } = buildInsert(
      { table: 'transactions', values: { customer_name: 'Budi', cash_amount: 50000 } },
      USER_A
    );
    expect(text).toMatch(/INSERT INTO "transactions"/);
    expect(text).toContain('"user_id"');
    expect(text).not.toContain('Budi');
    // user_id forced to actor even though client omitted (or tried) it
    expect(params).toContain(USER_A.userId);
  });

  it('insert ignores client-supplied user_id (cannot insert as another user)', () => {
    const { params } = buildInsert(
      { table: 'pengeluaran', values: { nama_pengeluaran: 'x', jumlah: 1, tanggal: '2026-01-01', user_id: USER_B_ID } },
      USER_A
    );
    expect(params).toContain(USER_A.userId);
    expect(params).not.toContain(USER_B_ID);
  });

  it('update requires pk filter and parameterizes SET', () => {
    const { text, params } = buildUpdate(
      { table: 'transactions', values: { cash_amount: 10 }, filters: [{ column: 'id', op: 'eq', value: 5 }] },
      USER_A
    );
    expect(text).toMatch(/UPDATE "transactions" SET "cash_amount" = \$\d+ WHERE "user_id" = \$\d+ AND "id" = \$\d+/);
    expect(params).toEqual(expect.arrayContaining([10, USER_A.userId, 5]));
  });

  it('update without pk filter is rejected', () => {
    expect(() =>
      buildUpdate({ table: 'transactions', values: { cash_amount: 10 }, filters: [{ column: 'customer_name', op: 'eq', value: 'x' }] }, USER_A)
    ).toThrow(PolicyError);
  });

  it('delete requires pk filter', () => {
    const { text } = buildDelete(
      { table: 'transactions', filters: [{ column: 'id', op: 'eq', value: 7 }] },
      USER_A
    );
    expect(text).toMatch(/DELETE FROM "transactions" WHERE/);
    expect(() => buildDelete({ table: 'transactions', filters: [] }, USER_A)).toThrow(PolicyError);
  });

  it('upsert emits ON CONFLICT ... DO UPDATE with parameterized values', () => {
    const { text, params } = buildUpsert(
      { table: 'notification_preferences', values: { push_enabled: false }, onConflict: ['user_id'] },
      USER_A
    );
    expect(text).toMatch(/ON CONFLICT \("user_id"\) DO UPDATE SET/);
    expect(params).toContain(USER_A.userId);
    expect(params).toContain(false);
  });
});

describe('repository: policy rejection', () => {
  it('rejects unknown table', () => {
    expect(() => buildSelect({ table: 'users' }, USER_A)).toThrow(PolicyError);
    expect(() => buildSelect({ table: 'auth_users' }, USER_A)).toThrow(/Unknown table/);
  });

  it('rejects unknown column in select/insert/update/filter/order', () => {
    expect(() => buildSelect({ table: 'transactions', columns: ['password_hash'] }, USER_A)).toThrow(PolicyError);
    expect(() => buildSelect({ table: 'transactions', columns: ['nope'] }, USER_A)).toThrow(/Unknown or disallowed column/);
    expect(() => buildInsert({ table: 'transactions', values: { nope: 1 } }, USER_A)).toThrow(PolicyError);
    expect(() =>
      buildSelect({ table: 'transactions', filters: [{ column: 'nope', op: 'eq', value: 1 }] }, USER_A)
    ).toThrow(PolicyError);
    expect(() => buildSelect({ table: 'transactions', order: [{ column: 'nope' }] }, USER_A)).toThrow(PolicyError);
  });

  it('rejects password-ish columns even if they existed in a policy', () => {
    expect(() => buildSelect({ table: 'user_profiles', columns: ['password'] }, USER_A)).toThrow(PolicyError);
  });

  it('rejects unknown operator', () => {
    expect(() =>
      buildSelect({ table: 'transactions', filters: [{ column: 'id', op: 'regex', value: '.*' }] }, USER_A)
    ).toThrow(/Unknown filter operator/);
  });

  it('rejects generated (read-only) columns on write', () => {
    expect(() => buildInsert({ table: 'tagihan_fee_lunas_items', values: { paid_date: '2026-01-01' } }, USER_A))
      .toThrow(/read-only/);
  });

  it('role gates: karyawan cannot write master data (admin/super_admin only per RLS)', () => {
    expect(() => buildInsert({ table: 'lokasi_apartemen', values: { name: 'X' } }, USER_A)).toThrow(/may not insert/);
    expect(() => buildUpdate({ table: 'nomor_kamar', values: { status: 'x' }, filters: [{ column: 'id', op: 'eq', value: 1 }] }, USER_A))
      .toThrow(/may not update/);
    expect(() => buildDelete({ table: 'lokasi_apartemen', filters: [{ column: 'id', op: 'eq', value: 1 }] }, USER_A))
      .toThrow(/may not delete/);
    // admin can
    expect(() => buildInsert({ table: 'lokasi_apartemen', values: { name: 'X' } }, ADMIN)).not.toThrow();
  });

  it('role gates: system_settings write is super_admin only (schema.sql:679-680)', () => {
    expect(() => buildUpdate({ table: 'system_settings', values: { value: '{}' }, filters: [{ column: 'id', op: 'eq', value: 1 }] }, ADMIN))
      .toThrow(/may not update/);
    expect(() => buildSelect({ table: 'system_settings' }, ADMIN)).not.toThrow();
  });

  it('role gates: activity_logs select admin/super_admin only; insert denied to everyone (RPC-only)', () => {
    expect(() => buildSelect({ table: 'activity_logs' }, USER_A)).toThrow(/may not select/);
    expect(() => buildSelect({ table: 'activity_logs' }, ADMIN)).not.toThrow();
    expect(() => buildInsert({ table: 'activity_logs', values: { action: 'x' } }, SUPER)).toThrow(/may not insert/);
  });

  it('role gates: notifications update/delete denied (no RLS policy exists)', () => {
    expect(() => buildUpdate({ table: 'notifications', values: { title: 'x' }, filters: [{ column: 'id', op: 'eq', value: 1 }] }, SUPER))
      .toThrow(/may not update/);
    expect(() => buildDelete({ table: 'notifications', filters: [{ column: 'id', op: 'eq', value: 1 }] }, SUPER))
      .toThrow(/may not delete/);
  });

  it('rejects unknown op and unknown RPC', () => {
    const repo = createRepository(fakeQuery());
    expect(repo.execute('truncate', { table: 'transactions' }, USER_A)).rejects.toThrow(PolicyError);
    expect(() => buildRpc({ fn: 'drop_everything', params: {} }, SUPER)).toThrow(/non-whitelisted RPC/);
  });

  it('rejects unknown RPC params', () => {
    expect(() => buildRpc({ fn: 'get_category_summary', params: { p_evil: 'x' } }, USER_A)).toThrow(/unknown parameter/);
  });

  it('rejects missing/invalid actor', () => {
    expect(() => buildSelect({ table: 'transactions' }, null)).toThrow(/Actor/);
    expect(() => buildSelect({ table: 'transactions' }, { userId: 'x' })).toThrow(/Actor/);
  });
});

describe('repository: owner-scoping & IDOR prevention', () => {
  it('karyawan select on transactions gets user_id = actor filter injected', () => {
    const { text, params } = buildSelect({ table: 'transactions' }, USER_A);
    expect(text).toContain('"user_id" = $1');
    expect(params[0]).toBe(USER_A.userId);
  });

  it('admin select on transactions is NOT owner-scoped (RLS admin override 20260416:24-33)', () => {
    const { text } = buildSelect({ table: 'transactions' }, ADMIN);
    expect(text).not.toContain('"user_id" =');
  });

  it('IDOR: user A cannot update user B transaction even with explicit id filter', () => {
    // The WHERE always ANDs user_id = A; row owned by B simply matches nothing.
    const q = fakeQuery([]);
    const repo = createRepository(q);
    return repo
      .execute(
        'update',
        { table: 'transactions', values: { cash_amount: 1 }, filters: [{ column: 'id', op: 'eq', value: 42 }] },
        USER_A
      )
      .then(() => {
        const { text, params } = q.calls[0];
        expect(text).toMatch(/WHERE "user_id" = \$\d+ AND "id" = \$\d+/);
        expect(params).toContain(USER_A.userId);
        expect(params).not.toContain(USER_B_ID);
      });
  });

  it('IDOR: user A cannot delete user B pengeluaran row', () => {
    const q = fakeQuery([]);
    const repo = createRepository(q);
    return repo
      .execute('delete', { table: 'pengeluaran', filters: [{ column: 'id', op: 'eq', value: 9 }] }, USER_A)
      .then(() => {
        expect(q.calls[0].text).toContain('"user_id" = $1');
        expect(q.calls[0].params[0]).toBe(USER_A.userId);
      });
  });

  it('IDOR: user A cannot read user B push_subscriptions / user_permissions (selfOrSuperAdmin)', () => {
    const a = buildSelect({ table: 'push_subscriptions' }, USER_A);
    expect(a.text).toContain('"user_id" = $1');
    const b = buildSelect({ table: 'user_permissions', filters: [{ column: 'user_id', op: 'eq', value: USER_B_ID }] }, USER_A);
    // scope predicate ANDs with attacker filter -> matches nothing
    expect(b.text).toMatch(/WHERE "user_id" = \$1 AND "user_id" = \$2/);
    expect(b.params[0]).toBe(USER_A.userId);
    expect(b.params[1]).toBe(USER_B_ID);
  });

  it('super_admin bypasses selfOrSuperAdmin scope (user_profiles)', () => {
    const { text } = buildSelect({ table: 'user_profiles' }, SUPER);
    expect(text).not.toContain('"id" =');
    const karyawan = buildSelect({ table: 'user_profiles' }, USER_A);
    expect(karyawan.text).toContain('"id" = $1');
  });

  it('user_roles: every role is self-scoped (schema.sql:386-399)', () => {
    const { text, params } = buildSelect({ table: 'user_roles' }, ADMIN);
    expect(text).toContain('"user_id" = $1');
    expect(params[0]).toBe(ADMIN.userId);
  });

  it('notifications: audience scoping (schema.sql:627-642)', () => {
    const { text, params } = buildSelect({ table: 'notifications' }, USER_A);
    expect(text).toMatch(/"audience_user_id" = \$\d+/);
    expect(text).toMatch(/"audience_role"/);
    expect(params).toEqual(expect.arrayContaining([USER_A.userId, 'all', 'karyawan']));
  });

  it('tagihan_fee_lunas_items owner column is paid_by (20260417_fee_paid_items.sql:48-58)', () => {
    const { text, params } = buildInsert(
      { table: 'tagihan_fee_lunas_items', values: { transaction_id: 1, marketing_name: 'M', fee_amount: 10 } },
      USER_A
    );
    expect(text).toContain('"paid_by"');
    expect(params).toContain(USER_A.userId);
  });
});

describe('repository: rpc building', () => {
  it('get_category_summary positional args in declared signature order', () => {
    const { text, params } = buildRpc(
      { fn: 'get_category_summary', params: { p_lokasi: 'L1', p_end_date: '2026-01-31' } },
      USER_A
    );
    expect(text).toBe('SELECT * FROM "get_category_summary"($1, $2, $3, $4)');
    expect(params).toEqual(['L1', null, null, '2026-01-31']);
  });

  it('jsonb params are serialized, not interpolated', () => {
    const { text, params } = buildRpc(
      { fn: 'update_transaction_by_privileged_role', params: { p_transaction_id: 3, p_payload: { cash_amount: '1' } } },
      ADMIN
    );
    expect(text).toBe('SELECT * FROM "update_transaction_by_privileged_role"($1, $2)');
    expect(params[0]).toBe(3);
    expect(typeof params[1]).toBe('string');
    expect(JSON.parse(params[1])).toEqual({ cash_amount: '1' });
  });

  it('super-admin RPCs reject karyawan', () => {
    expect(() => buildRpc({ fn: 'admin_create_user', params: {} }, USER_A)).toThrow(/may not call RPC/);
    expect(() => buildRpc({ fn: 'admin_create_user', params: {} }, ADMIN)).toThrow(/may not call RPC/);
    expect(() => buildRpc({ fn: 'admin_create_user', params: {} }, SUPER)).not.toThrow();
  });
});

describe('repository: executor', () => {
  it('execute passes generated SQL + params to injected query fn and returns { data, count }', async () => {
    const rows = [{ id: 1 }];
    const q = fakeQuery(rows);
    const repo = createRepository(q);
    const res = await repo.execute('select', { table: 'karyawan_list', limit: 5 }, USER_A);
    expect(res.data).toEqual(rows);
    expect(res.count).toBe(1);
    expect(q.calls).toHaveLength(1);
    expect(q.calls[0].text).toMatch(/LIMIT \$\d+/);
  });

  it('count:true select returns COUNT(*)', async () => {
    const q = fakeQuery([{ count: '7' }]);
    const repo = createRepository(q);
    const res = await repo.execute('select', { table: 'karyawan_list', count: true }, USER_A);
    expect(res.count).toBe(7);
    expect(q.calls[0].text).toMatch(/^SELECT COUNT\(\*\)/);
  });

  it('limit is clamped to MAX 1000', async () => {
    const q = fakeQuery([]);
    const repo = createRepository(q);
    await repo.execute('select', { table: 'karyawan_list', limit: 999999 }, USER_A);
    expect(q.calls[0].params).toContain(1000);
  });
});
