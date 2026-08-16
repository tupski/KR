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
 * Get location statistics for dashboard.
 *
 * @returns {Promise<{ totalLocations: number, totalRooms: number }>}
 */
export async function getLocationStats() {
  const [locResult, roomResult] = await Promise.all([
    query('SELECT COUNT(*) as count FROM lokasi_apartemen'),
    query('SELECT COUNT(*) as count FROM nomor_kamar'),
  ]);
  
  return {
    totalLocations: parseInt(locResult.rows[0]?.count || '0', 10),
    totalRooms: parseInt(roomResult.rows[0]?.count || '0', 10),
  };
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

/**
 * Create a new room.
 *
 * @param {string} name - Room name/number
 * @param {string} lokasi - Location name
 * @returns {Promise<{ name: string, lokasi: string }>}
 */
export async function createRoom(name, lokasi) {
  const result = await query(
    `INSERT INTO nomor_kamar (name, lokasi)
     VALUES ($1, $2)
     ON CONFLICT (name, lokasi) DO NOTHING
     RETURNING name, lokasi`,
    [name, lokasi],
  );
  return result.rows[0] ?? { name, lokasi };
}

/**
 * Delete a room by ID.
 *
 * @param {string} id - Room ID
 * @returns {Promise<void>}
 * @throws {NotFoundError} if the room does not exist
 */
export async function deleteRoom(id) {
  const result = await query(
    'DELETE FROM nomor_kamar WHERE id = $1 RETURNING id',
    [id],
  );
  if (result.rowCount === 0) {
    throw new NotFoundError(`Room '${id}' not found`);
  }
}

/**
 * List all rooms with optional filters.
 *
 * @param {{ location?: string }} opts - Optional filters
 * @returns {Promise<{ lokasi: string, name: string }[]>}
 */
export async function listRooms({ location } = {}) {
  let sql = 'SELECT lokasi, name FROM nomor_kamar';
  const params = [];

  if (location) {
    sql += ' WHERE lokasi = $1';
    params.push(location);
  }

  sql += ' ORDER BY lokasi, name';

  const result = await query(sql, params);
  return result.rows;
}

/**
 * List rooms with occupancy status based on active transactions.
 *
 * @param {{ location?: string, userId?: string, userRole?: string }} opts
 * @returns {Promise<object[]>} Rooms with transaction info
 */
export async function listRoomsWithOccupancy({ location, userId, userRole } = {}) {
  // First get user location assignments if karyawan
  let assignedLocations = null;
  if (userRole === 'karyawan' && userId) {
    const assignResult = await query(
      'SELECT location_name FROM user_location_assignments WHERE user_id = $1',
      [userId]
    );
    assignedLocations = assignResult.rows.map(r => r.location_name);
  }

  // Build rooms query
  let roomsSql = 'SELECT lokasi, name FROM nomor_kamar';
  const roomsParams = [];

  if (location) {
    roomsSql += ' WHERE lokasi = $1';
    roomsParams.push(location);
  } else if (assignedLocations && assignedLocations.length > 0) {
    roomsSql += ` WHERE lokasi = ANY($1)`;
    roomsParams.push(assignedLocations);
  } else if (assignedLocations && assignedLocations.length === 0) {
    // Karyawan with no assignments - return empty
    return [];
  }

  roomsSql += ' ORDER BY lokasi, name';

  const roomsResult = await query(roomsSql, roomsParams);

  // Get active transactions (from last 3 days OR checkout_at is null)
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const txSql = `
    SELECT
      id, created_at, checkin_at, rental_duration, apartment_location, room_number,
      customer_name, checkout_at, user_id, cash_amount, transfer_amount, transfer_to,
      marketing_name, input_by, shift, deposit_cash, deposit_transfer, deposit_returned_at, marketing_fee
    FROM transactions
    WHERE (checkin_at > $1 OR checkout_at IS NULL)
    ORDER BY checkin_at DESC NULLS LAST, created_at DESC
  `;

  const txResult = await query(txSql, [threeDaysAgo.toISOString()]);

  // Get paid fees
  const feesSql = 'SELECT marketing_name, paid_at FROM tagihan_fee_lunas';
  const feesResult = await query(feesSql);

  return {
    rooms: roomsResult.rows,
    transactions: txResult.rows,
    paidFees: feesResult.rows,
    assignedLocations,
  };
}

/**
 * List rooms with transaction history for reports.
 *
 * @param {{ startDate: string, endDate: string, location?: string, userId?: string, userRole?: string }} opts
 * @returns {Promise<object>}
 */
export async function listRoomsForReport({ startDate, endDate, location, userId, userRole }) {
  // Get user location assignments if karyawan
  let assignedLocations = null;
  if (userRole === 'karyawan' && userId) {
    const assignResult = await query(
      'SELECT location_name FROM user_location_assignments WHERE user_id = $1',
      [userId]
    );
    assignedLocations = assignResult.rows.map(r => r.location_name);
  }

  // Build rooms query
  let roomsSql = 'SELECT lokasi, name FROM nomor_kamar';
  const roomsParams = [];

  if (location) {
    roomsSql += ' WHERE lokasi = $1';
    roomsParams.push(location);
  } else if (assignedLocations && assignedLocations.length > 0) {
    roomsSql += ` WHERE lokasi = ANY($1)`;
    roomsParams.push(assignedLocations);
  } else if (assignedLocations && assignedLocations.length === 0) {
    return { rooms: [], transactions: [] };
  }

  roomsSql += ' ORDER BY lokasi, name';

  const roomsResult = await query(roomsSql, roomsParams);

  // Get transactions in date range
  const txSql = `
    SELECT id, apartment_location, room_number, customer_name, checkin_at, created_at, cash_amount, transfer_amount
    FROM transactions
    WHERE (
      (checkin_at >= $1 AND checkin_at < $2)
      OR (checkin_at IS NULL AND created_at >= $1 AND created_at < $2)
    )
  `;
  const txParams = [startDate, endDate];

  if (location) {
    txSql += ` AND apartment_location = $3`;
    txParams.push(location);
  } else if (assignedLocations && assignedLocations.length > 0) {
    txSql += ` AND apartment_location = ANY($3)`;
    txParams.push(assignedLocations);
  }

  const txResult = await query(txSql, txParams);

  return {
    rooms: roomsResult.rows,
    transactions: txResult.rows,
  };
}
