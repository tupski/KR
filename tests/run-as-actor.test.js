/* eslint-env node */
import { describe, it, expect, vi } from 'vitest';
import { runAsActor } from '../server/db/index.js';

/**
 * runAsActor must set request.jwt.* GUCs (auth.uid()/auth.role()/auth.jwt()
 * shims) inside a transaction before executing, commit on success and release
 * the connection. RLS policies + SECURITY DEFINER RPCs read these GUCs.
 */
describe('runAsActor: GUC + transaction lifecycle', () => {
  function patchPool() {
    const calls = { begun: 0, committed: 0, released: false, setConfig: [] };
    return {
      restore: null, // set below
      calls,
      init: async () => {
        const mod = await import('../server/db/index.js');
        const origConnect = mod.pool.connect.bind(mod.pool);
        mod.pool.connect = vi.fn(async () => {
          const client = {
            async query(text, params) {
              if (text === 'BEGIN') calls.begun++;
              else if (text === 'COMMIT') calls.committed++;
              else if (text.startsWith('SELECT set_config')) calls.setConfig.push({ text, params });
              else if (text === 'ROLLBACK') calls.rolledBack = (calls.rolledBack || 0) + 1;
              return { rows: [], rowCount: 0 };
            },
            release() { calls.released = true; },
          };
          return client;
        });
        return () => { mod.pool.connect = origConnect; };
      },
    };
  }

  it('sets sub/role/claims GUCs, commits, and releases', async () => {
    const { init, calls } = patchPool();
    const restore = await init();
    try {
      await runAsActor(
        { userId: '11111111-1111-1111-1111-111111111111', role: 'super_admin', email: 'a@b.c' },
        async () => 'ok'
      );
      expect(calls.begun).toBe(1);
      expect(calls.committed).toBe(1);
      expect(calls.released).toBe(true);
      const sub = calls.setConfig.find((c) => c.text.includes('request.jwt.claim.sub'));
      expect(sub?.params?.[0]).toBe('11111111-1111-1111-1111-111111111111');
      const role = calls.setConfig.find((c) => c.text.includes('request.jwt.claim.role'));
      expect(role?.params?.[0]).toBe('super_admin');
      const claims = calls.setConfig.find((c) => c.text.includes("'request.jwt.claims'"));
      expect(JSON.parse(claims?.params?.[0])).toMatchObject({ sub: '11111111-1111-1111-1111-111111111111', role: 'super_admin' });
    } finally {
      restore();
    }
  });

  it('rolls back on error and still releases', async () => {
    const { init, calls } = patchPool();
    const restore = await init();
    try {
      await expect(runAsActor({ userId: 'x', role: 'karyawan' }, async () => {
        throw new Error('boom');
      })).rejects.toThrow('boom');
      expect(calls.begun).toBe(1);
      expect(calls.committed).toBe(0);
      expect(calls.rolledBack).toBe(1);
      expect(calls.released).toBe(true);
    } finally {
      restore();
    }
  });
});
