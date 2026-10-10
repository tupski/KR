/* eslint-env node */
import { describe, it, expect, vi } from 'vitest';
import {
  findObjectOwner,
  authorizeObjectRead,
  OWNERSHIP_RULES,
} from '../../server/storage/ownership.js';

// ── Sprint 2A / N-1: otorisasi per-objek untuk /api/blob ───────────────────

const OWNER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

/** queryFn palsu: mengembalikan baris dari map key -> {ref, user_id}. */
function fakeQuery(rows) {
  const calls = [];
  const fn = vi.fn(async (text, params) => {
    calls.push({ text, params });
    return { rows };
  });
  fn.calls = calls;
  return fn;
}

describe('N-1 — namespace mapping', () => {
  it('semua namespace privat terpetakan ke tabel+kolom pemilik', () => {
    expect(Object.keys(OWNERSHIP_RULES).sort()).toEqual(
      ['avatars', 'fee-proofs', 'ktp-images', 'refund_proofs', 'tagihan-proofs', 'transfer-proofs'].sort()
    );
    expect(OWNERSHIP_RULES['ktp-images']).toEqual({ table: 'transactions', column: 'ktp_image_url' });
    expect(OWNERSHIP_RULES.refund_proofs).toEqual({
      table: 'transactions',
      column: 'deposit_refund_proof_url',
    });
    expect(OWNERSHIP_RULES.avatars).toEqual({ table: 'users', column: 'avatar_url' });
  });
});

describe('N-1 — findObjectOwner', () => {
  it('menemukan pemilik dari canonical key (match persis in-JS)', async () => {
    const rows = [{ ref: 'ktp-images/1700000000000-ab12cd-foto.webp', user_id: OWNER }];
    const owner = await findObjectOwner('ktp-images/1700000000000-ab12cd-foto.webp', fakeQuery(rows));
    expect(owner).toEqual({ ownerUserId: OWNER, table: 'transactions' });
  });

  it('referensi DB legacy (proxy URL / blob URL lama) tetap dicocokkan', async () => {
    const rows = [
      { ref: '/api/blob?pathname=ktp-images/1700000000000-ab12cd-foto.webp', user_id: OWNER },
    ];
    const owner = await findObjectOwner('ktp-images/1700000000000-ab12cd-foto.webp', fakeQuery(rows));
    expect(owner.ownerUserId).toBe(OWNER);
  });

  it('key dengan "_" TIDAK boleh cocok ke objek lain (anti LIKE wildcard)', async () => {
    // DB punya foto__1_.webp milik OWNER; penyerang minta /1.webp
    const rows = [{ ref: 'ktp-images/1700000000000-ab12cd-foto__1_.webp', user_id: OWNER }];
    const owner = await findObjectOwner('ktp-images/1.webp', fakeQuery(rows));
    expect(owner).toBeNull(); // includes() case/value-exact, bukan wildcard
  });

  it('PDB query memakai pola TETAP server-side, key user TIDAK masuk pola LIKE', async () => {
    const q = fakeQuery([]);
    await findObjectOwner('ktp-images/1700000000000-ab12cd-foto.webp', q);
    expect(q.calls.length).toBe(1);
    const { text, params } = q.calls[0];
    // Pola adalah '%/ktp-images/%' — bukan key attacker.
    expect(params[0]).toBe('%/ktp-images/%');
    expect(params[0]).not.toContain('1700000000000');
    // Key dikirim HANYA sebagai nilai pencocokan di JS (bukan SQL).
    expect(text).not.toContain('1700000000000');
  });

  it('nama tabel tidak diinterpolasi dari input user (allow-list mapping)', async () => {
    const q = fakeQuery([]);
    await findObjectOwner('ktp-images/x.webp', q);
    expect(q.calls[0].text).toContain('FROM transactions');
  });

  it('namespace di luar allow-list -> null tanpa query', async () => {
    const q = fakeQuery([]);
    expect(await findObjectOwner('uploads/x.png', q)).toBeNull();
    expect(await findObjectOwner('unknown/x.png', q)).toBeNull();
    expect(q.calls.length).toBe(0);
  });

  it('key malformed (tanpa folder, kosong, non-string) -> null', async () => {
    const q = fakeQuery([]);
    expect(await findObjectOwner('/x.webp', q)).toBeNull();
    expect(await findObjectOwner('', q)).toBeNull();
    expect(await findObjectOwner(null, q)).toBeNull();
    expect(await findObjectOwner(undefined, q)).toBeNull();
  });

  it('tabel/kolom belum ada di DB target -> null (tidak melempar)', async () => {
    const failing = vi.fn(async () => {
      throw new Error('relation "users" does not exist');
    });
    expect(await findObjectOwner('avatars/x.png', failing)).toBeNull();
  });

  it('paginasi: menemukan match di batch kedua', async () => {
    const BATCH = 500;
    let call = 0;
    const fn = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return { rows: Array.from({ length: BATCH }, (_, i) => ({ ref: `ktp-images/other-${i}.webp`, user_id: OTHER })) };
      }
      return { rows: [{ ref: 'ktp-images/target.webp', user_id: OWNER }] };
    });
    const owner = await findObjectOwner('ktp-images/target.webp', fn);
    expect(owner.ownerUserId).toBe(OWNER);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('N-1 — authorizeObjectRead', () => {
  it('pemilik objek -> allow', () => {
    expect(authorizeObjectRead({ ownerUserId: OWNER, requesterUserId: OWNER, requesterRole: 'karyawan' })).toBe('allow');
  });

  it('bukan pemilik + role karyawan -> deny', () => {
    expect(authorizeObjectRead({ ownerUserId: OWNER, requesterUserId: OTHER, requesterRole: 'karyawan' })).toBe('deny');
  });

  it('admin/super_admin -> allow lintas pemilik', () => {
    expect(authorizeObjectRead({ ownerUserId: OWNER, requesterUserId: OTHER, requesterRole: 'admin' })).toBe('allow');
    expect(authorizeObjectRead({ ownerUserId: OWNER, requesterUserId: OTHER, requesterRole: 'super_admin' })).toBe('allow');
  });

  it('tanpa identitas requester -> deny', () => {
    expect(authorizeObjectRead({ ownerUserId: OWNER, requesterUserId: null, requesterRole: 'admin' })).toBe('deny');
  });

  it('objek tanpa owner + role karyawan -> deny', () => {
    expect(authorizeObjectRead({ ownerUserId: null, requesterUserId: OTHER, requesterRole: 'karyawan' })).toBe('deny');
  });

  it('role tidak dikenal -> deny', () => {
    expect(authorizeObjectRead({ ownerUserId: OWNER, requesterUserId: OTHER, requesterRole: 'guest' })).toBe('deny');
  });
});