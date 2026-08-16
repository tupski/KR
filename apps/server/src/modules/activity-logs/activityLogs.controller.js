/**
 * @file activityLogs.controller.js
 * @description HTTP handlers for activity log endpoints.
 */

import * as activityLogsService from './activityLogs.service.js';
import { ValidationError } from '../../middleware/errorHandler.js';

/** GET /api/activity-logs */
export async function listActivityLogs(req, res, next) {
  try {
    const { page, limit, userId, startDate, endDate, action } = req.query;
    const result = await activityLogsService.listActivityLogs({
      page:      page      || undefined,
      limit:     limit     || undefined,
      userId:    userId    || undefined,
      startDate: startDate || undefined,
      endDate:   endDate   || undefined,
      action:    action    || undefined,
    });
    res.json(result);
  } catch (err) { next(err); }
}

/** POST /api/activity-logs */
export async function logActivity(req, res, next) {
  try {
    const { action, details, metadata } = req.body;
    if (!action) {
      throw new ValidationError('action is required');
    }
    const data = await activityLogsService.logActivity({
      userId:   req.user.id,
      action,
      details:  details  ?? null,
      metadata: metadata ?? null,
    });
    res.status(201).json({ data });
  } catch (err) { next(err); }
}
