import { describe, it, expect } from 'vitest';
import { unwrapEnvelope } from './unwrapEnvelope.js';

describe('unwrapEnvelope', () => {
  it('unwraps sole { data } key to its value', () => {
    expect(unwrapEnvelope({ data: [{ a: 1 }] })).toEqual([{ a: 1 }]);
  });

  it('unwraps { data: { rooms } } object envelope', () => {
    expect(unwrapEnvelope({ data: { rooms: [], transactions: [] } }))
      .toEqual({ rooms: [], transactions: [] });
  });

  it('preserves paginated { data, total, page, limit }', () => {
    const body = { data: [{ a: 1 }], total: 42, page: 1, limit: 20 };
    expect(unwrapEnvelope(body)).toEqual(body);
  });

  it('preserves bare arrays', () => {
    const arr = [{ a: 1 }];
    expect(unwrapEnvelope(arr)).toEqual(arr);
  });

  it('preserves non-data-key objects like { user }', () => {
    const body = { user: { id: 'x' } };
    expect(unwrapEnvelope(body)).toEqual(body);
  });

  it('preserves primitives and null', () => {
    expect(unwrapEnvelope(42)).toBe(42);
    expect(unwrapEnvelope(null)).toBeNull();
  });
});