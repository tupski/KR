/**
 * @file settings.controller.js
 * @description HTTP request handlers for system settings and announcements.
 * Validates input with Zod, delegates business logic to settings.service.
 */

import { z } from 'zod';
import * as settingsService from './settings.service.js';
import { ValidationError } from '../../middleware/errorHandler.js';

// ── Input schemas ─────────────────────────────────────────────────────────────

const upsertSettingSchema = z.object({
  value:       z.string().min(1, 'value is required'),
  description: z.string().optional().nullable(),
});

const createAnnouncementSchema = z.object({
  title:   z.string().min(1, 'title is required').max(255),
  content: z.string().min(1, 'content is required'),
});

const updateAnnouncementSchema = z.object({
  title:     z.string().min(1).max(255).optional(),
  content:   z.string().min(1).optional(),
  is_active: z.boolean().optional(),
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

// ── Settings controllers ──────────────────────────────────────────────────────

/**
 * GET /api/settings
 * Return all system settings (requireAuth).
 *
 * @type {import('express').RequestHandler}
 */
export async function getAllSettings(req, res, next) {
  try {
    const settings = await settingsService.getAllSettings();
    res.status(200).json({ settings });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/settings/:key
 * Return a single system setting by key.
 *
 * @type {import('express').RequestHandler}
 */
export async function getSetting(req, res, next) {
  try {
    const value = await settingsService.getSetting(req.params.key);
    res.status(200).json({ key: req.params.key, value });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/settings/:key
 * Update or insert a system setting (admin/super_admin only).
 *
 * @type {import('express').RequestHandler}
 */
export async function upsertSetting(req, res, next) {
  try {
    const { value, description } = validate(upsertSettingSchema, req.body);
    const setting = await settingsService.upsertSetting(req.params.key, value, description);
    res.status(200).json({ setting });
  } catch (err) {
    next(err);
  }
}

// ── Announcements controllers ─────────────────────────────────────────────────

/**
 * GET /api/settings/announcements
 * List announcements. Authenticated users see active ones; admins see all.
 *
 * @type {import('express').RequestHandler}
 */
export async function listAnnouncements(req, res, next) {
  try {
    const isAdmin    = ['admin', 'super_admin'].includes(req.user?.role);
    const activeOnly = !isAdmin;
    const announcements = await settingsService.listAnnouncements({ active_only: activeOnly });
    res.status(200).json({ announcements });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/settings/announcements
 * Create a new announcement (admin/super_admin only).
 *
 * @type {import('express').RequestHandler}
 */
export async function createAnnouncement(req, res, next) {
  try {
    const { title, content } = validate(createAnnouncementSchema, req.body);
    const announcement = await settingsService.createAnnouncement({
      title,
      content,
      createdBy: req.user.id,
    });
    res.status(201).json({ announcement });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/settings/announcements/:id
 * Update an existing announcement (admin/super_admin only).
 *
 * @type {import('express').RequestHandler}
 */
export async function updateAnnouncement(req, res, next) {
  try {
    const data         = validate(updateAnnouncementSchema, req.body);
    const announcement = await settingsService.updateAnnouncement(req.params.id, data);
    res.status(200).json({ announcement });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/settings/announcements/:id
 * Delete an announcement (admin/super_admin only).
 *
 * @type {import('express').RequestHandler}
 */
export async function deleteAnnouncement(req, res, next) {
  try {
    await settingsService.deleteAnnouncement(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
