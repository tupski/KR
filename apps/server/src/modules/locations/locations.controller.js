/**
 * @file locations.controller.js
 * @description HTTP handlers for apartment location endpoints.
 */

import * as locationsService from './locations.service.js';
import { ValidationError } from '../../middleware/errorHandler.js';

/** GET /api/locations */
export async function listLocations(_req, res, next) {
  try {
    const data = await locationsService.listLocations();
    res.json({ data });
  } catch (err) { next(err); }
}

/** GET /api/locations/stats */
export async function getLocationStats(_req, res, next) {
  try {
    const data = await locationsService.getLocationStats();
    res.json({ data });
  } catch (err) { next(err); }
}

/** POST /api/locations */
export async function createLocation(req, res, next) {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new ValidationError('name is required');
    }
    const data = await locationsService.createLocation(name.trim());
    res.status(201).json({ data });
  } catch (err) { next(err); }
}

/** DELETE /api/locations/:name */
export async function deleteLocation(req, res, next) {
  try {
    await locationsService.deleteLocation(req.params.name);
    res.status(204).end();
  } catch (err) { next(err); }
}

/** POST /api/locations/rooms */
export async function createRoom(req, res, next) {
  try {
    const { name, lokasi } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new ValidationError('name is required');
    }
    if (!lokasi || typeof lokasi !== 'string' || !lokasi.trim()) {
      throw new ValidationError('lokasi is required');
    }
    const data = await locationsService.createRoom(name.trim(), lokasi.trim());
    res.status(201).json({ data });
  } catch (err) { next(err); }
}

/** DELETE /api/locations/rooms/:id */
export async function deleteRoom(req, res, next) {
  try {
    await locationsService.deleteRoom(req.params.id);
    res.status(204).end();
  } catch (err) { next(err); }
}

/** GET /api/locations/rooms - List rooms with occupancy status */
export async function listRoomsWithOccupancy(req, res, next) {
  try {
    const { location } = req.query;
    const { id: userId, role: userRole } = req.user;
    const data = await locationsService.listRoomsWithOccupancy({
      location,
      userId,
      userRole,
    });
    res.json({ data });
  } catch (err) { next(err); }
}

/** GET /api/locations/rooms/report - List rooms for reports */
export async function listRoomsForReport(req, res, next) {
  try {
    const { startDate, endDate, location } = req.query;
    const { id: userId, role: userRole } = req.user;
    const data = await locationsService.listRoomsForReport({
      startDate,
      endDate,
      location,
      userId,
      userRole,
    });
    res.json({ data });
  } catch (err) { next(err); }
}
