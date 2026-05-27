/**
 * Transaction form constants extracted from FormTransaksiModern.jsx.
 *
 * @module transactionConstants
 */

/**
 * Rental type options for the transaction form.
 * @type {Array<{value: string, label: string}>}
 */
export const RENTAL_TYPE_OPTIONS = [
  { value: 'TRANSIT', label: 'Transit' },
  { value: 'PER_MALAM', label: 'Per Malam' },
];

/**
 * Shift options for the transaction form.
 * @type {string[]}
 */
export const SHIFT_OPTIONS = ['Pagi', 'Malam', 'Long Shift'];

/**
 * Duration options for transit (hourly) rentals.
 * @type {string[]}
 */
export const DURATION_OPTIONS_TRANSIT = ['3 JAM', '6 JAM', '9 JAM', '12 JAM', '24 JAM', 'Custom'];

/**
 * Duration options for per-night (overnight) rentals.
 * @type {string[]}
 */
export const DURATION_OPTIONS_PER_MALAM = ['Promo Malam', 'Fullday', 'Custom'];

/**
 * Transfer target options.
 * @type {string[]}
 */
export const TRANSFER_TARGET_OPTIONS = ['Kakarama', 'Marketing'];

/**
 * React-Select custom style overrides.
 * Provides consistent rounded styling across all select inputs in the transaction form.
 *
 * @type {object}
 */
export const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 46,
    borderRadius: 16,
    borderColor: state.isFocused ? '#0f172a' : '#cbd5e1',
    boxShadow: 'none',
    ':hover': { borderColor: '#334155' },
  }),
  valueContainer: (base) => ({ ...base, paddingLeft: 12, paddingRight: 12 }),
  menu: (base) => ({ ...base, borderRadius: 12, overflow: 'hidden' }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
};
