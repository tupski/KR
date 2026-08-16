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
