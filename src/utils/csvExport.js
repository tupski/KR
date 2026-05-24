/**
 * CSV Export Helpers
 *
 * Sederhana, tanpa dependency. Kompatibel dengan Excel (UTF-8 BOM + CRLF).
 */

/**
 * Escape sebuah cell agar aman menjadi field CSV.
 * @param {*} value
 * @returns {string}
 */
function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Quote bila mengandung koma, kutip ganda, newline, atau diawali sama-dengan
  // (Excel formula injection guard).
  const needsQuoting = /[",\r\n]|^=/.test(str);
  if (!needsQuoting) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Konversi array of objects menjadi string CSV.
 *
 * @param {Array<object>} rows - Data rows
 * @param {Array<{key: string, label: string, format?: (v:any, row:object) => any}>} columns
 *   Definisi kolom: key untuk akses property, label untuk header, format opsional.
 * @returns {string} CSV content (tanpa BOM)
 */
export function toCSV(rows, columns) {
  if (!Array.isArray(rows) || !Array.isArray(columns) || columns.length === 0) {
    return '';
  }

  const header = columns.map((c) => escapeCell(c.label)).join(',');
  const body = rows
    .map((row) =>
      columns
        .map((c) => {
          const raw = row?.[c.key];
          const value = typeof c.format === 'function' ? c.format(raw, row) : raw;
          return escapeCell(value);
        })
        .join(',')
    )
    .join('\r\n');

  return `${header}\r\n${body}`;
}

/**
 * Trigger download CSV dari sisi browser.
 *
 * @param {string} filename - Nama file (akan ditambahkan .csv jika belum)
 * @param {string} csvContent - Isi CSV (tanpa BOM)
 */
export function downloadCSV(filename, csvContent) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const safeName = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  // BOM agar Excel kenali UTF-8
  const blob = new Blob(['\uFEFF', csvContent], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', safeName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Beri jeda kecil agar browser sempat mulai download sebelum URL dilepas.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Helper terpadu: konversi rows + columns lalu trigger download.
 *
 * @param {string} filename
 * @param {Array<object>} rows
 * @param {Array<{key: string, label: string, format?: (v:any, row:object) => any}>} columns
 */
export function exportToCSV(filename, rows, columns) {
  downloadCSV(filename, toCSV(rows, columns));
}

export default exportToCSV;
