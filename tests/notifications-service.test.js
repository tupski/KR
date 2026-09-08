/* eslint-env node */
import { describe, it, expect } from 'vitest';
import {
  parsePositiveInt,
  formatWibDateTime,
  calcEndAt,
  detectLongHoliday,
} from '../server/services/notifications.js';

describe('parsePositiveInt', () => {
  it('returns parsed positive int', () => {
    expect(parsePositiveInt('10', 5)).toBe(10);
    expect(parsePositiveInt(42, 5)).toBe(42);
  });
  it('falls back for zero/negative/invalid', () => {
    expect(parsePositiveInt('0', 5)).toBe(5);
    expect(parsePositiveInt('-3', 5)).toBe(5);
    expect(parsePositiveInt('abc', 5)).toBe(5);
    expect(parsePositiveInt(undefined, 5)).toBe(5);
    expect(parsePositiveInt(null, 5)).toBe(5);
  });
});

describe('formatWibDateTime', () => {
  it('formats ISO timestamp in Asia/Jakarta (WIB) with id-ID locale', () => {
    // 2026-09-08T07:30:00Z == 14:30 WIB (UTC+7, no DST).
    const out = formatWibDateTime('2026-09-08T07:30:00.000Z');
    expect(out).toContain('2026');
    expect(out).toContain('14');
    expect(out).toContain('30');
    expect(out.endsWith(' WIB')).toBe(true);
  });
  it('returns "-" for invalid input', () => {
    expect(formatWibDateTime('not-a-date')).toBe('-');
    expect(formatWibDateTime(undefined)).toBe('-');
  });
});

describe('calcEndAt', () => {
  it('short rental (<24h): start + hours', () => {
    const created = '2026-09-08T10:00:00.000Z';
    const end = calcEndAt({ created_at: created, rental_duration: 3 });
    expect(end.getTime()).toBe(new Date(created).getTime() + 3 * 60 * 60 * 1000);
  });
  it('defaults rental_duration to 1 hour', () => {
    const created = '2026-09-08T10:00:00.000Z';
    const end = calcEndAt({ created_at: created });
    expect(end.getTime()).toBe(new Date(created).getTime() + 60 * 60 * 1000);
  });
  it('long rental (>=24h): next day at 12:00 local', () => {
    const end = calcEndAt({ created_at: '2026-09-08T10:00:00.000Z', rental_duration: 48 });
    expect(end).not.toBeNull();
    // setDate(+1) lalu setHours(12,0,0,0) — jam lokal server.
    expect(end.getHours()).toBe(12);
    expect(end.getMinutes()).toBe(0);
    expect(end.getDate()).toBe(new Date('2026-09-08T10:00:00.000Z').getDate() + 1);
  });
  it('returns null for invalid created_at', () => {
    expect(calcEndAt({ created_at: 'garbage', rental_duration: 3 })).toBeNull();
    expect(calcEndAt({ created_at: undefined, rental_duration: 3 })).toBeNull();
  });
});

describe('detectLongHoliday', () => {
  // Helper: tanggal lokal tengah hari untuk hindari geser hari.
  const d = (y, m, day) => new Date(y, m - 1, day, 12, 0, 0, 0);

  it('detects pure weekend long holiday (Sat+Sun+Mon holiday = 3 days)', () => {
    // Sabtu 2026-09-12, Minggu 2026-09-13, Senin 2026-09-14 libur nasional.
    const map = { '2026-09-14': 'Hari Raya X' };
    const res = detectLongHoliday(map, d(2026, 9, 10)); // Kamis
    expect(res).not.toBeNull();
    expect(res.isLongHoliday).toBe(true);
    expect(res.startOffset).toBe(2); // Sabtu
    expect(res.totalDays).toBe(3);
    expect(res.description).toContain('Hari Raya X');
    expect(res.hasHarpitnas).toBe(false);
  });

  it('detects harpitnas: Friday between Thursday holiday and weekend', () => {
    // Kamis 2026-09-10 libur, Jumat 2026-09-11 harpitnas, Sab-Min weekend.
    const map = { '2026-09-10': 'Kenaikan Y' };
    const res = detectLongHoliday(map, d(2026, 9, 10));
    expect(res).not.toBeNull();
    expect(res.startOffset).toBe(0); // mulai Kamis (hari ini libur)
    expect(res.totalDays).toBe(4); // Kam, Jum(harpitnas), Sab, Min
    expect(res.hasHarpitnas).toBe(true);
    expect(res.harpitnasDays).toEqual([11]);
    expect(res.description).toBe('Kenaikan Y (harpitnas tgl 11)');
  });

  it('returns null when no streak >= 3 within 14 days', () => {
    // Weekend biasa (2 hari) saja, tanpa libur tambahan: streak = 2 < 3.
    const res = detectLongHoliday({}, d(2026, 9, 9)); // Rabu, weekend berikutnya Sab-Min saja
    expect(res).toBeNull();
  });

  it('uses "Weekend panjang" when streak has no named holiday', () => {
    // Sab-Min weekend + Senin "off" karena diapit Minggu & Selasa libur → streak 3 tanpa nama di Sab? Senin punya nama? tidak.
    // Setup: Selasa 2026-09-15 libur; dari Jumat 2026-09-11 → Sab,Min,Sen(harpitnas),Sel = 4 hari.
    // Sab/Min/Sel punya nama hanya jika di map; Senin harpitnas. Beri nama hanya Selasa:
    const map = { '2026-09-15': 'Libur Z' };
    const res = detectLongHoliday(map, d(2026, 9, 12)); // Sabtu
    expect(res).not.toBeNull();
    expect(res.description).toContain('Libur Z');
    expect(res.hasHarpitnas).toBe(true);
    expect(res.harpitnasDays).toEqual([14]); // Senin 14 Sep diapit Minggu & Selasa-libur
  });

  it('joins two unique holiday names with " & " and slices to 2', () => {
    // Kamis 17 Des 2026 libur A, Jumat 18 harpitnas, Sab-Min, Senin 21 libur B, Selasa 22 libur C
    const map = {
      '2026-12-17': 'Libur A',
      '2026-12-21': 'Libur B',
      '2026-12-22': 'Libur C',
    };
    const res = detectLongHoliday(map, d(2026, 12, 17));
    expect(res).not.toBeNull();
    expect(res.startOffset).toBe(0);
    expect(res.description.startsWith('Libur A & Libur B')).toBe(true);
  });
});
