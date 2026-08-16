/**
 * @file locations.service.js
 * @description Location management service for lokasi_apartemen table.
 */

import { query } from '../../config/database.js';
import { NotFoundError } from '../../middleware/errorHandler.js';

/**
 * List all apartment locations ordered by name.
 *
 * @returns {Promise<{ name: string }[]>}
 */
export async function listLocations() {
  const result = await query(
    'SELECT name FROM lokasi_apartemen ORDER BY name',
    [],
  );
  return result.rows;
}

/**
 * Create a new apartment location.
 *
 * @param {string} name
 * @returns {Promise<{ name: string }>}
 */
export async function createLocation(name) {
  const result = await query(
    'INSERT INTO lokasi_apartemen (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING name',
    [name],
  );
  // If a conflict occurred (already exists), return the name anyway
  return result.rows[0] ?? { name };
}

/**
 * Delete an apartment location by name.
 *
 * @param {string} name
 * @returns {Promise<void>}
 * @throws {NotFoundError} if the location does not exist
 */
export async function deleteLocation(name) {
  const result = await query(
    'DELETE FROM lokasi_apartemen WHERE name = $1 RETURNING name',
    [name],
  );
  if (result.rowCount === 0) {
    throw new NotFoundError(`Location '${name}' not found`);
  }
}
