/**
 * @file requests.controller.js
 * @description HTTP handlers for employee request endpoints.
 */

import * as requestsService from './requests.service.js';
import { ValidationError } from '../../middleware/errorHandler.js';

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

/** GET /api/requests */
export async function listRequests(req, res, next) {
  try {
    const { page, limit, status, userId, location } = req.query;
    const isAdmin = ADMIN_ROLES.has(req.user.role);

    const result = await requestsService.listRequests({
      page:               page     || undefined,
      limit:              limit    || undefined,
      status:             status   || undefined,
      userId:             userId   || undefined,
      location:           location || undefined,
      isAdmin,
      requestingUserId:   req.user.id,
    });
    res.json(result);
  } catch (err) { next(err); }
}

/** POST /api/requests */
export async function createRequest(req, res, next) {
  try {
    const { request_type, apartment_location, desired_date, notes, employee_name } = req.body;
    if (!request_type) {
      throw new ValidationError('request_type is required');
    }
    const data = await requestsService.createRequest(
      { request_type, apartment_location, desired_date, notes, employee_name },
      req.user.id,
    );
    res.status(201).json({ data });
  } catch (err) { next(err); }
}

/** GET /api/requests/:id */
export async function getRequestById(req, res, next) {
  try {
    const data = await requestsService.getRequestById(req.params.id);
    res.json({ data });
  } catch (err) { next(err); }
}

/** PUT /api/requests/:id/status */
export async function updateRequestStatus(req, res, next) {
  try {
    const { status, response_notes } = req.body;
    if (!status) {
      throw new ValidationError('status is required');
    }
    const data = await requestsService.updateRequestStatus(
      req.params.id,
      { status, response_notes },
      req.user.id,
    );
    res.json({ data });
  } catch (err) { next(err); }
}

/** DELETE /api/requests/:id */
export async function deleteRequest(req, res, next) {
  try {
    await requestsService.deleteRequest(req.params.id);
    res.status(204).end();
  } catch (err) { next(err); }
}
