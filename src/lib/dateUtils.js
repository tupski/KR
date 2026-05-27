import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

/**
 * Returns the default date range for the current month (or a given date's month).
 * Produces ISO date strings (YYYY-MM-DD) for Supabase compatibility.
 *
 * @param {Date} [date=new Date()] - Reference date to derive the month range from
 * @returns {{ startDate: string, endDate: string }} First and last day of the month as ISO date strings
 */
export function getDefaultDateRange(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed

  // First day of the month
  const firstDay = new Date(year, month, 1);

  // Last day of the month (day 0 of next month = last day of current month)
  const lastDay = new Date(year, month + 1, 0);

  const startDate = formatDateISO(firstDay);
  const endDate = formatDateISO(lastDay);

  return { startDate, endDate };
}

/**
 * Formats a Date object as an ISO date string (YYYY-MM-DD).
 *
 * @param {Date} date
 * @returns {string}
 */
function formatDateISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date range as ISO datetime strings (00:00:00 - 23:59:59).
 *
 * @returns {{ start: string, end: string }} ISO datetime bounds for today
 */
export function getDateRangeToday() {
  const now = new Date();
  return {
    start: format(now, 'yyyy-MM-dd') + ' 00:00:00',
    end: format(now, 'yyyy-MM-dd') + ' 23:59:59',
  };
}

/**
 * Get yesterday's date range as ISO datetime strings.
 *
 * @returns {{ start: string, end: string }} ISO datetime bounds for yesterday
 */
export function getDateRangeYesterday() {
  const yesterday = subDays(new Date(), 1);
  return {
    start: format(yesterday, 'yyyy-MM-dd') + ' 00:00:00',
    end: format(yesterday, 'yyyy-MM-dd') + ' 23:59:59',
  };
}

/**
 * Get the date range for the last 7 days (including today).
 *
 * @returns {{ start: string, end: string }} ISO datetime bounds
 */
export function getDateRangeLast7Days() {
  return {
    start: format(subDays(new Date(), 7), 'yyyy-MM-dd') + ' 00:00:00',
    end: format(new Date(), 'yyyy-MM-dd') + ' 23:59:59',
  };
}

/**
 * Get the date range for the current month.
 *
 * @returns {{ start: string, end: string }} ISO datetime bounds
 */
export function getDateRangeThisMonth() {
  return {
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd') + ' 00:00:00',
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd') + ' 23:59:59',
  };
}

/**
 * Format a Date to "yyyy-MM-ddTHH:mm" value for use with `<input type="datetime-local">`.
 *
 * @param {Date} date - Date to format
 * @returns {string} Formatted datetime-local value or empty string
 */
export function toDateTimeLocalValue(date) {
  if (!date) return '';
  try {
    return format(date, "yyyy-MM-dd'T'HH:mm");
  } catch {
    return '';
  }
}

/**
 * Parse a datetime-local input value safely, falling back to current date.
 *
 * @param {string} value - Datetime-local string value
 * @returns {Date} Parsed Date or new Date() on failure
 */
export function parseCheckInDate(value) {
  if (!value) return new Date();
  try {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return new Date();
    return parsed;
  } catch {
    return new Date();
  }
}

/**
 * Get today's date as "yyyy-MM-dd" string.
 *
 * @returns {string} Today's date in ISO format
 */
export function getLocalDate() {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * Format a date string for display in Indonesian locale.
 * "2026-05-27" → "27 Mei 2026"
 *
 * @param {string} dateStr - Date string to format
 * @returns {string} Formatted date or "-" on error
 */
export function formatDateDisplay(dateStr) {
  if (!dateStr) return '-';
  try {
    return format(new Date(dateStr), 'dd MMM yyyy', { locale: idLocale });
  } catch {
    return dateStr;
  }
}
