/**
 * Analytics Dashboard — Period Label Helper
 *
 * Menghasilkan label periode yang ringkas untuk ditampilkan di setiap section
 * laporan analytics, contoh: "30 hari terakhir", "1 – 31 Mei 2026", dst.
 */

import { format, isSameDay, isSameMonth, isSameYear, parseISO, startOfToday, differenceInCalendarDays } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

/**
 * Format tanggal ke "1 Mei 2026" (locale id-ID).
 * @param {Date} d
 * @returns {string}
 */
function fmtFull(d) {
  return format(d, 'd MMMM yyyy', { locale: idLocale });
}

/**
 * Format tanggal ke "1" (hanya hari).
 * @param {Date} d
 * @returns {string}
 */
function fmtDayOnly(d) {
  return format(d, 'd', { locale: idLocale });
}

/**
 * Format tanggal ke "1 Mei" (hari + bulan).
 * @param {Date} d
 * @returns {string}
 */
function fmtDayMonth(d) {
  return format(d, 'd MMMM', { locale: idLocale });
}

/**
 * Hasilkan label periode ringkas untuk header section.
 *
 * Contoh output:
 *   - Sama hari       : "1 Mei 2026"
 *   - Beda bulan/tahun: "1 Mei – 31 Mei 2026"  / "30 Apr – 1 Mei 2026"
 *   - Sama bulan      : "1 – 31 Mei 2026"
 *   - "30 hari terakhir" bila endDate = today() dan range tepat 30 hari
 *
 * @param {string} startDate - ISO date string "yyyy-MM-dd"
 * @param {string} endDate   - ISO date string "yyyy-MM-dd"
 * @returns {string} Label periode yang siap ditampilkan
 */
export function formatPeriodLabel(startDate, endDate) {
  if (!startDate || !endDate) return '';

  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';

  const today = startOfToday();
  const isEndToday = isSameDay(end, today);
  const inclusiveDays = differenceInCalendarDays(end, start) + 1;

  // Preset relatif (hanya jika endDate = today)
  if (isEndToday) {
    if (inclusiveDays === 1) return 'Hari ini';
    if (inclusiveDays === 7) return '7 hari terakhir';
    if (inclusiveDays === 30) return '30 hari terakhir';
    if (inclusiveDays === 90) return '90 hari terakhir';
  }

  // Periode satu hari
  if (isSameDay(start, end)) return fmtFull(start);

  // Periode dalam bulan & tahun yang sama: "1 – 31 Mei 2026"
  if (isSameMonth(start, end) && isSameYear(start, end)) {
    return `${fmtDayOnly(start)} – ${fmtFull(end)}`;
  }

  // Periode dalam tahun yang sama, beda bulan: "30 Apr – 1 Mei 2026"
  if (isSameYear(start, end)) {
    return `${fmtDayMonth(start)} – ${fmtFull(end)}`;
  }

  // Periode lintas tahun: "31 Des 2025 – 1 Jan 2026"
  return `${fmtFull(start)} – ${fmtFull(end)}`;
}

export default formatPeriodLabel;
