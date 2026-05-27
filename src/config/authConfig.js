/**
 * Centralized authentication configuration.
 *
 * FINANCE_PIN is read from environment variable VITE_FINANCE_PIN.
 * Falls back to DEFAULT_PIN only for development.
 *
 * @module authConfig
 */

/**
 * Finance PIN for protected operations (e.g., viewing income dashboard).
 * Set via VITE_FINANCE_PIN environment variable.
 * @type {string}
 */
export const FINANCE_PIN = import.meta.env.VITE_FINANCE_PIN;

/**
 * Fallback PIN for development environments only.
 * @type {string}
 */
export const DEFAULT_PIN = '212198';

/**
 * Validate a user-entered PIN against the configured finance PIN.
 *
 * @param {string} input - PIN input from user
 * @returns {boolean} Whether the PIN is valid
 */
export const isValidFinancePin = (input) => input === (FINANCE_PIN || DEFAULT_PIN);

/**
 * Role hierarchy levels.
 * Higher number = more privileges.
 * @type {Object<string, number>}
 */
export const ROLE_LEVELS = { karyawan: 1, admin: 2, super_admin: 3 };

/**
 * Check if a user role meets the minimum required role level.
 *
 * @param {string} userRole - The user's current role
 * @param {string} minimumRole - The minimum role required
 * @returns {boolean} Whether the user has sufficient role level
 */
export function hasMinimumRole(userRole, minimumRole) {
  return (ROLE_LEVELS[userRole] || 0) >= (ROLE_LEVELS[minimumRole] || 99);
}

/**
 * List of tab names that require PIN verification to access.
 * @type {string[]}
 */
export const PIN_PROTECTED_TABS = ['pemasukan', 'finance'];
