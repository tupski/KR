/* eslint-env node */
import { describe, it, expect, vi } from 'vitest';
import { buildSelect, buildDelete } from '../server/db/repository.js';

const USER_A = { userId: '11111111-1111-1111-1111-111111111111', role: 'karyawan' };
const ADMIN = { userId: '33333333-3333-3333-3333-333333333333', role: 'admin' };

/**
 * Server-side boolean group filters: the apiClient compiles postgrest-style
 * `.or('and(a.gte.x,b.is.null),and(...)')` strings into { and: [...] } groups.
 * The repository MUST compile them into parenthesized SQL — not reject as
 * unknown columns (pre-fix regression from DashboardPemasukan/KetersediaanKamar).
 */
describe('repository: and() boolean group filters', () => {
  it('select compiles or-of-and groups into correct boolean SQL (OR-joined groups)', () => {
    const built = buildSelect({
      table: 'transactions',
      filters: [
        {
          or: [
            { and: [{ column: 'checkin_at', op: 'gte', value: '2026-01-01T00:00:00.000Z' }, { column: 'checkin_at', op: 'lt', value: '2026-02-01T00:00:00.000Z' }] },
            { and: [{ column: 'checkin_at', op: 'is-null', value: null }, { column: 'created_at', op: 'gte', value: '2026-01-01T00:00:00.000Z' }] },
          ],
        },
      ],
    }, ADMIN);
    // admin → no owner scope; WHERE = the or-group, members OR-joined
    expect(built.text).toContain('"checkin_at" >= $');
    expect(built.text).toContain('"checkin_at" < $');
    expect(built.text).toContain('"checkin_at" IS NULL');
    expect(built.text).toContain('"created_at" >= $');
    expect(built.text).toMatch(/\("checkin_at" >= \$\d+ AND "checkin_at" < \$\d+\) OR \("checkin_at" IS NULL AND "created_at" >= \$\d+\)/);
    // every value parameterized (LIMIT/OFFSET appended after filters)
    expect(built.params.slice(0, 3)).toEqual(['2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']);
  });

  it('flat or() members are OR-joined, not AND-joined (status.eq.X,status.eq.Y)', () => {
    const built = buildSelect({
      table: 'nomor_kamar',
      filters: [
        { or: [{ column: 'status', op: 'eq', value: 'Checked-In' }, { column: 'status', op: 'eq', value: 'Booked' }] },
      ],
    }, ADMIN);
    expect(built.text).toMatch(/WHERE \("status" = \$1 OR "status" = \$2\)/);
  });

  it('or() group ANDs with sibling filters and owner scope', () => {
    const built = buildSelect({
      table: 'transactions',
      filters: [
        { column: 'apartment_location', op: 'eq', value: 'A' },
        { or: [{ column: 'shift', op: 'eq', value: 'pagi' }, { column: 'shift', op: 'eq', value: 'siang' }] },
      ],
    }, USER_A);
    expect(built.text).toMatch(/WHERE "user_id" = \$1 AND "apartment_location" = \$2 AND \("shift" = \$3 OR "shift" = \$4\)/);
  });

  it('and() groups combine with owner scope for karyawan (AND semantics preserved)', () => {
    const built = buildSelect({
      table: 'transactions',
      filters: [{ and: [{ column: 'shift', op: 'eq', value: 'malam' }] }],
    }, USER_A);
    expect(built.text).toMatch(/WHERE "user_id" = \$1 AND \("shift" = \$2\)/);
  });

  it('empty and() group is skipped safely', () => {
    const built = buildSelect({ table: 'transactions', filters: [{ and: [] }] }, ADMIN);
    expect(built.text).not.toContain('undefined');
  });

  it('delete accepts and() group containing the pk equality', () => {
    const built = buildDelete({
      table: 'pengeluaran',
      filters: [{ and: [{ column: 'id', op: 'eq', value: 5 }] }],
    }, USER_A);
    expect(built.text).toMatch(/DELETE FROM "pengeluaran" WHERE "user_id" = \$1 AND \("id" = \$2\)/);
  });
});
