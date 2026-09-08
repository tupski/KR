import { parseOrString } from '../src/lib/apiClient.js';
import { describe, it, expect } from 'vitest';

// Regression: DashboardPemasukan.jsx:200 / KetersediaanKamar.jsx:363 use
// postgrest-style nested and() groups inside .or(). Before the fix these were
// mangled into garbage columns ("and(checkin_at") and rejected server-side.
describe('parseOrString: nested and() groups', () => {
  const s = 'and(checkin_at.gte.2026-01-01T00:00:00.000Z,checkin_at.lt.2026-02-01T00:00:00.000Z),and(checkin_at.is.null,created_at.gte.2026-01-01T00:00:00.000Z,created_at.lt.2026-02-01T00:00:00.000Z)';

  it('parses and(...) groups into { and: [...] } structures', () => {
    const parsed = parseOrString(s);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      and: [
        { column: 'checkin_at', op: 'gte', value: '2026-01-01T00:00:00.000Z' },
        { column: 'checkin_at', op: 'lt', value: '2026-02-01T00:00:00.000Z' },
      ],
    });
    expect(parsed[1].and).toHaveLength(3);
    expect(parsed[1].and[0]).toEqual({ column: 'checkin_at', op: 'is-null', value: null });
  });

  it('does not mangle timestamps containing dots', () => {
    const parsed = parseOrString(s);
    expect(parsed[0].and[0].value).toBe('2026-01-01T00:00:00.000Z');
  });

  it('simple or() strings still parse to flat filters', () => {
    expect(parseOrString('status.eq.Checked-In,status.eq.Booked')).toEqual([
      { column: 'status', op: 'eq', value: 'Checked-In' },
      { column: 'status', op: 'eq', value: 'Booked' },
    ]);
  });

  it('nested or() groups still parse to { or: [...] }', () => {
    expect(parseOrString('or(a.eq.1,b.eq.2)')).toEqual([
      { or: [{ column: 'a', op: 'eq', value: '1' }, { column: 'b', op: 'eq', value: '2' }] },
    ]);
  });
});
