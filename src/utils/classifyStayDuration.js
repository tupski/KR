/**
 * classifyStayDuration
 *
 * JavaScript helper yang mencerminkan logika SQL `CASE WHEN` di RPC
 * `get_stay_duration_summary` (lihat
 * `supabase/migrations/20260606000000_analytics_dashboard_v2.sql`).
 *
 * Mengklasifikasikan nilai `rental_duration` (dalam jam) ke salah satu
 * kategori durasi menginap berikut:
 *
 *   - rental_duration ∈ [1..11]   → 'Transit - {n} Jam' (per-jam, contoh 'Transit - 3 Jam')
 *   - rental_duration ∈ [12..23]  → 'Fullday'
 *   - rental_duration ∈ [24..47]  → 'Per Malam - 1 Malam'
 *   - rental_duration >= 48       → 'Per Malam - 2+ Malam'
 *   - else (NULL, 0, negatif, NaN, undefined, dll.) → 'Lainnya'
 *
 * @param {number|null|undefined} rental_duration - Durasi sewa dalam jam
 * @returns {string} Kategori durasi
 */
export function classifyStayDuration(rental_duration) {
  if (rental_duration === null || rental_duration === undefined) {
    return 'Lainnya';
  }
  if (typeof rental_duration !== 'number' || Number.isNaN(rental_duration)) {
    return 'Lainnya';
  }

  // Setiap jam transit 1..11 menjadi kategori sendiri
  if (rental_duration >= 1 && rental_duration <= 11 && Number.isInteger(rental_duration)) {
    return `Transit - ${rental_duration} Jam`;
  }

  if (rental_duration >= 12 && rental_duration <= 23) {
    return 'Fullday';
  }
  if (rental_duration >= 24 && rental_duration <= 47) {
    return 'Per Malam - 1 Malam';
  }
  if (rental_duration >= 48) {
    return 'Per Malam - 2+ Malam';
  }

  return 'Lainnya';
}

/**
 * Daftar lengkap kategori valid yang dapat dihasilkan oleh classifyStayDuration.
 * Berurutan natural: 1 Jam .. 11 Jam, Fullday, Per Malam, Lainnya.
 */
export const STAY_DURATION_CATEGORIES = Object.freeze([
  'Transit - 1 Jam',
  'Transit - 2 Jam',
  'Transit - 3 Jam',
  'Transit - 4 Jam',
  'Transit - 5 Jam',
  'Transit - 6 Jam',
  'Transit - 7 Jam',
  'Transit - 8 Jam',
  'Transit - 9 Jam',
  'Transit - 10 Jam',
  'Transit - 11 Jam',
  'Fullday',
  'Per Malam - 1 Malam',
  'Per Malam - 2+ Malam',
  'Lainnya',
]);
