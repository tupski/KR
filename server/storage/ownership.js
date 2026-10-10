/* eslint-env node */
/**
 * server/storage/ownership.js — otorisasi per-objek untuk /api/blob (N-1).
 *
 * Model (mirror Sprint 1 api/blob.js di jalur Vercel):
 *   canonicalKey  ->  baris DB pemilik  ->  owner user_id  ->  role
 *   pemilik ATAU admin/super_admin boleh membaca; selain itu 404
 *   (existence tidak dikonfirmasi).
 *
 * Namespace -> sumber kebenaran kepemilikan. Kolom menyimpan referensi
 * bebas (canonical key baru ATAU legacy proxy URL / blob URL lama), jadi
 * pencocokan memakai substring PERSIS di JS — TIDAK pernah menyisipkan
 * key user ke pola LIKE (karakter '_' adalah wildcard Postgres).
 */

export const OWNERSHIP_RULES = {
  'ktp-images': { table: 'transactions', column: 'ktp_image_url' },
  'transfer-proofs': { table: 'transactions', column: 'transfer_proof_url' },
  'refund_proofs': { table: 'transactions', column: 'deposit_refund_proof_url' },
  'tagihan-proofs': { table: 'tagihan_bulanan', column: 'proof_url' },
  'fee-proofs': { table: 'tagihan_fee_lunas', column: 'proof_url' },
  'avatars': { table: 'users', column: 'avatar_url' },
};

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

/**
 * Cari user_id pemilik objek untuk sebuah canonicalKey.
 * @param {string} canonicalKey  key yang sudah dinormalisasi (tanpa traversal)
 * @param {(text: string, params: unknown[]) => Promise<{rows: Array<Record<string, unknown>>}>} queryFn
 * @returns {Promise<{ownerUserId: string|null, table: string}|null>} null = tidak ada record yang merujuk key ini
 */
export async function findObjectOwner(canonicalKey, queryFn) {
  if (typeof canonicalKey !== 'string' || !canonicalKey) return null;
  const slash = canonicalKey.indexOf('/');
  if (slash <= 0) return null;
  const folder = canonicalKey.slice(0, slash);
  const rule = OWNERSHIP_RULES[folder];
  if (!rule) return null;

  // Filter DB sengaja coarse (prefix folder, pola TETAP server-side) lalu
  // kecocokan persis di JS. Hindari range() tanpa batas: ambil batch dan
  // berhenti saat match ditemukan.
  let offset = 0;
  const BATCH = 500;
  for (;;) {
    let rows;
    try {
      const res = await queryFn(
        `SELECT ${rule.column} AS ref, user_id FROM ${rule.table} WHERE ${rule.column} LIKE $1 ORDER BY id LIMIT $2 OFFSET $3`,
        [`%/${folder}/%`, BATCH, offset]
      );
      rows = res?.rows || [];
    } catch (_e) {
      // Tabel/kolom belum ada di DB target (mis. instalasi lama) ->
      // perlakukan sebagai "tidak ada pemilik yang cocok".
      return null;
    }
    for (const r of rows) {
      if (typeof r.ref === 'string' && r.ref.includes(canonicalKey)) {
        return { ownerUserId: r.user_id || null, table: rule.table };
      }
    }
    if (rows.length < BATCH) return null;
    offset += BATCH;
    if (offset > 100000) return null; // guard rail
  }
}

/**
 * Keputusan otorisasi baca objek.
 * @returns {'allow'|'deny'} deny -> caller harus merespons 404 (bukan 403).
 */
export function authorizeObjectRead({ ownerUserId, requesterUserId, requesterRole }) {
  if (!requesterUserId) return 'deny';
  if (ownerUserId && ownerUserId === requesterUserId) return 'allow';
  if (ADMIN_ROLES.has(requesterRole)) return 'allow';
  return 'deny';
}
