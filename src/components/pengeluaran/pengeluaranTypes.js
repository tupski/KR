/**
 * Constants and type definitions for the Pengeluaran (Expenses) module.
 *
 * @module pengeluaranTypes
 */

/** Default filter state for expense queries. */
export const DEFAULT_EXPENSE_FILTERS = {
  lokasi: null,
  kamar: null,
  startDate: null,
  endDate: null,
  search: '',
};

/** Default filter state for per-unit expense queries. */
export const DEFAULT_UNIT_FILTERS = {
  lokasi: null,
  kamar: null,
  startDate: null,
  endDate: null,
};
