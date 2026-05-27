/**
 * Constants and type definitions for the Tagihan (Bills) module.
 *
 * @module tagihanTypes
 */

/** Tab definitions for the TagihanPage orchestrator. */
export const TAGIHAN_TABS = [
  { id: 'bulanan', label: 'Bulanan' },
  { id: 'fee', label: 'Fee Marketing' },
  { id: 'pengeluaran', label: 'Pengeluaran' },
  { id: 'pengeluaranUnit', label: 'Pengeluaran Unit' },
];

/** Date filter presets for fee items. */
export const FEE_DATE_PRESETS = [
  { id: 'today', label: 'Hari Ini' },
  { id: 'yesterday', label: 'Kemarin' },
  { id: '7days', label: '7 Hari' },
  { id: 'month', label: 'Bulan Ini' },
];

/** Status labels for tagihan_bulanan bills. */
export const TAGIHAN_STATUS = {
  UNPAID: 'unpaid',
  PAID: 'paid',
  OVERDUE: 'overdue',
};

/** Default page sizes for paginated queries in this module. */
export const PAGE_SIZES = {
  TAGIHAN: 10,
  FEE_UNPAID: 50,
  PENGELUARAN: 10,
};
