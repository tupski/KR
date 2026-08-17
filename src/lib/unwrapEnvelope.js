/**
 * @file unwrapEnvelope.js
 * @description Unwrap a `{ data }` response envelope only when `data` is the
 * sole key. Preserves paginated shapes like `{ data, total, page, limit }`.
 * Pure function — usable outside Vite (node, tests).
 */

export function unwrapEnvelope(body) {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const keys = Object.keys(body);
    if (keys.length === 1 && keys[0] === 'data') {
      return body.data;
    }
  }
  return body;
}