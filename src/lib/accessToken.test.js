import { describe, it, expect, beforeEach } from 'vitest';
import { getAccessToken } from './accessToken';

describe('getAccessToken', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('membaca access_token dari session supabase di localStorage (sb-*-auth-token)', () => {
    localStorage.setItem('sb-ref-auth-token', JSON.stringify({ access_token: 'tok-123', expires_at: 9999999999 }));
    expect(getAccessToken()).toBe('tok-123');
  });

  it('mengabaikan key lain dan code-verifier', () => {
    localStorage.setItem('sb-ref-auth-token-code-verifier', JSON.stringify('verifier'));
    localStorage.setItem('other-key', 'x');
    expect(getAccessToken()).toBeNull();
  });

  it('null bila localStorage rusak', () => {
    localStorage.setItem('sb-ref-auth-token', '{not-json');
    expect(getAccessToken()).toBeNull();
  });
});
