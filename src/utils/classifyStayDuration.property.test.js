/**
 * Property-Based Tests for classifyStayDuration
 *
 * Feature: analytics-dashboard
 * Property 11: Klasifikasi kategori durasi menginap (revisi v2)
 *
 * Helper `classifyStayDuration` mencerminkan logika SQL `CASE WHEN` di RPC
 * `get_stay_duration_summary`. Setelah revisi v2, setiap jam transit (1..11)
 * dipaparkan sebagai kategori sendiri (`Transit - {n} Jam`).
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  classifyStayDuration,
  STAY_DURATION_CATEGORIES,
} from './classifyStayDuration';

describe('classifyStayDuration — Property 11: Klasifikasi kategori durasi menginap', () => {
  it(
    'Property 11: untuk sembarang rental_duration, output WAJIB termasuk dalam STAY_DURATION_CATEGORIES dan sesuai spesifikasi',
    () => {
      fc.assert(
        fc.property(
          fc.option(fc.integer({ min: 0, max: 200 }), { nil: null }),
          (rentalDuration) => {
            const category = classifyStayDuration(rentalDuration);

            // (1) Output WAJIB salah satu kategori valid
            expect(STAY_DURATION_CATEGORIES).toContain(category);

            // (2) Verifikasi klasifikasi sesuai spesifikasi
            if (rentalDuration === null) {
              expect(category).toBe('Lainnya');
            } else if (rentalDuration === 0) {
              expect(category).toBe('Lainnya');
            } else if (rentalDuration >= 1 && rentalDuration <= 11) {
              expect(category).toBe(`Transit - ${rentalDuration} Jam`);
            } else if (rentalDuration >= 12 && rentalDuration <= 23) {
              expect(category).toBe('Fullday');
            } else if (rentalDuration >= 24 && rentalDuration <= 47) {
              expect(category).toBe('Per Malam - 1 Malam');
            } else if (rentalDuration >= 48) {
              expect(category).toBe('Per Malam - 2+ Malam');
            } else {
              expect(category).toBe('Lainnya');
            }
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it('Property 11 (boundary): nilai batas masuk ke kategori yang benar', () => {
    const expectedByValue = {
      0: 'Lainnya',
      1: 'Transit - 1 Jam',
      2: 'Transit - 2 Jam',
      3: 'Transit - 3 Jam',
      4: 'Transit - 4 Jam',
      11: 'Transit - 11 Jam',
      12: 'Fullday',
      23: 'Fullday',
      24: 'Per Malam - 1 Malam',
      47: 'Per Malam - 1 Malam',
      48: 'Per Malam - 2+ Malam',
      72: 'Per Malam - 2+ Malam',
      200: 'Per Malam - 2+ Malam',
    };

    for (const [valueStr, expected] of Object.entries(expectedByValue)) {
      const value = Number(valueStr);
      expect(classifyStayDuration(value)).toBe(expected);
    }

    expect(classifyStayDuration(null)).toBe('Lainnya');
    expect(classifyStayDuration(undefined)).toBe('Lainnya');
  });
});
