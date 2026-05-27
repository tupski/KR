/**
 * Format a non-negative number as Indonesian Rupiah.
 * Uses dot (.) as thousand separator, no decimal places.
 *
 * Examples:
 *   formatRupiah(0)          → "Rp 0"
 *   formatRupiah(1000)       → "Rp 1.000"
 *   formatRupiah(1500000)    → "Rp 1.500.000"
 *   formatRupiah(10000000000) → "Rp 10.000.000.000"
 *
 * @param {number} value - Non-negative number to format
 * @returns {string} Formatted Rupiah string
 */
export function formatRupiah(value) {
  const num = Math.floor(Number(value) || 0);
  return `Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(num)}`;
}

/**
 * Convert a formatted Rupiah string back to a number.
 * "Rp 1.500" → 1500
 *
 * @param {string|number} value - Rupiah string or number to deformat
 * @returns {number} Numeric value
 */
export function deformatRupiah(value) {
  return Number(String(value).replace(/[^0-9]/g, '')) || 0;
}

/**
 * Format a number for input display using Indonesian locale.
 * 1500 → "1.500"
 *
 * @param {number|string} value - Numeric value to format
 * @returns {string} Formatted number without "Rp" prefix
 */
export function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID').format(Number(value) || 0);
}

/**
 * Parse an Indonesian-formatted number string back to a number.
 * "1.500" → 1500
 *
 * @param {string|number} value - Indonesian formatted number string
 * @returns {number} Parsed numeric value
 */
export function parseCurrency(value) {
  return Number(String(value).replace(/\./g, '')) || 0;
}
