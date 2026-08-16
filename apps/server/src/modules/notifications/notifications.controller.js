/**
 * @file notifications.controller.js
 * @description HTTP request handlers for notification endpoints.
 * Validates input with Zod, delegates business logic to notifications.service and push.service.
 */

import { z } from 'zod';
import * as notifService from './notifications.service.js';
import * as pushService  from './push.service.js';
import { ValidationError } from '../../middleware/errorHandler.js';

// ── Input schemas ─────────────────────────────────────────────────────────────

const preferencesSchema = z.object({
  push_enabled:  z.boolean().optional(),
  types_enabled: z.record(z.boolean()).optional(),
});

const subscribeSchema = z.object({
  endpoint: z.string().url('endpoint must be a valid URL'),
  p256dh:   z.string().min(1, 'p256dh is required'),
  auth:     z.string().min(1, 'auth is required'),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url('endpoint must be a valid URL'),
});

const sendPushSchema = z.object({
  title:            z.string().min(1, 'title is required').max(200),
  body:             z.string().optional().nullable(),
  url:              z.string().optional().default('/'),
  icon:             z.string().optional().nullable(),
  audience_role:    z.string().optional().nullable(),
  audience_user_id: z.string().uuid().optional().nullable(),
});

const notificationIdsSchema = z.object({
  notification_ids: z.array(z.string().uuid()).min(1, 'notification_ids is required'),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Validate data against a Zod schema. Throws ValidationError on failure.
 *
 * @template T
 * @param {z.ZodSchema<T>} schema
 * @param {unknown} data
 * @returns {T}
 */
function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError('Validation failed', result.error.flatten().fieldErrors);
  }
  return result.data;
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/notifications
 * List notifications for the authenticated user.
 *
 * @type {import('express').RequestHandler}
 */
export async function listNotifications(req, res, next) {
  try {
    const page  = Number(req.query.page)  || 1;
    const limit = Number(req.query.limit) || 20;

    const result = await notifService.listNotifications({
      userId: req.user.id,
      role:   req.user.role,
      page,
      limit,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/notifications/unread-count
 * Get unread notification count for the authenticated user.
 *
 * @type {import('express').RequestHandler}
 */
export async function getUnreadCount(req, res, next) {
  try {
    const count = await notifService.getUnreadCount({
      userId: req.user.id,
      role:   req.user.role,
    });
    res.status(200).json({ count });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/notifications/:id/hide
 * Hide a notification for the authenticated user.
 *
 * @type {import('express').RequestHandler}
 */
export async function hideNotification(req, res, next) {
  try {
    await notifService.hideNotification(req.params.id, req.user.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/notifications/preferences
 * Get push notification preferences for the authenticated user.
 *
 * @type {import('express').RequestHandler}
 */
export async function getPreferences(req, res, next) {
  try {
    const preferences = await notifService.getPreferences(req.user.id);
    res.status(200).json({ preferences });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/notifications/preferences
 * Update push notification preferences for the authenticated user.
 *
 * @type {import('express').RequestHandler}
 */
export async function updatePreferences(req, res, next) {
  try {
    const data        = validate(preferencesSchema, req.body);
    const preferences = await notifService.upsertPreferences(req.user.id, data);
    res.status(200).json({ preferences });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/notifications/subscribe
 * Register a push subscription for the authenticated user.
 *
 * @type {import('express').RequestHandler}
 */
export async function subscribePush(req, res, next) {
  try {
    const { endpoint, p256dh, auth } = validate(subscribeSchema, req.body);
    const subscription = await notifService.subscribe(req.user.id, { endpoint, p256dh, auth });
    res.status(201).json({ subscription });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/notifications/subscribe
 * Remove a push subscription for the authenticated user.
 *
 * @type {import('express').RequestHandler}
 */
export async function unsubscribePush(req, res, next) {
  try {
    const { endpoint } = validate(unsubscribeSchema, req.body);
    await notifService.unsubscribe(req.user.id, endpoint);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/notifications/send
 * Send a push notification manually (admin/super_admin only).
 *
 * @type {import('express').RequestHandler}
 */
export async function sendPush(req, res, next) {
  try {
    const data    = validate(sendPushSchema, req.body);
    const results = await pushService.sendPushToAudience(data);
    res.status(200).json({ ok: true, ...results });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/notifications/mark-read
 * Mark multiple notifications as read for the authenticated user.
 *
 * @type {import('express').RequestHandler}
 */
export async function markNotificationsRead(req, res, next) {
  try {
    const { notification_ids } = validate(notificationIdsSchema, req.body);
    await notifService.markNotificationsRead(notification_ids, req.user.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/notifications/hide
 * Hide multiple notifications for the authenticated user.
 *
 * @type {import('express').RequestHandler}
 */
export async function hideNotifications(req, res, next) {
  try {
    const { notification_ids } = validate(notificationIdsSchema, req.body);
    await notifService.hideNotifications(notification_ids, req.user.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/notifications/read-status
 * Get read status for multiple notifications.
 *
 * @type {import('express').RequestHandler}
 */
export async function getReadStatus(req, res, next) {
  try {
    const { notification_ids } = validate(notificationIdsSchema, req.body);
    const readSet = await notifService.getReadStatus(notification_ids, req.user.id);
    res.status(200).json({ read_ids: Array.from(readSet) });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/notifications/hidden-status
 * Get hidden status for multiple notifications.
 *
 * @type {import('express').RequestHandler}
 */
export async function getHiddenStatus(req, res, next) {
  try {
    const { notification_ids } = validate(notificationIdsSchema, req.body);
    const hiddenSet = await notifService.getHiddenStatus(notification_ids, req.user.id);
    res.status(200).json({ hidden_ids: Array.from(hiddenSet) });
  } catch (err) {
    next(err);
  }
}
