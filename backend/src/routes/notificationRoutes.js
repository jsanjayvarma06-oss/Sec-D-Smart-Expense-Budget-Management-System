
import { Router } from 'express';
import { z } from 'zod';
import {
  listNotifications,
  markNotificationRead,
} from '../services/notificationService.js';
import { HttpError } from '../utils/httpError.js';

const notificationIdSchema = z.string().uuid();

export function notificationRoutes() {
  const router = Router();

  // List notifications. Add ?unreadOnly=true to show unread ones only.
  router.get('/', async (req, res, next) => {
    try {
      const parsed = z.enum(['true', 'false']).safeParse(
        req.query.unreadOnly ?? 'false',
      );

      if (!parsed.success) {
        throw new HttpError(400, 'unreadOnly must be true or false', {
          code: 'VALIDATION',
        });
      }

      const notifications = await listNotifications(
        req.user.id,
        parsed.data === 'true',
      );

      res.json({ notifications });
    } catch (err) {
      next(err);
    }
  });

  // Mark one of the logged-in user's notifications as read.
  router.patch('/:id/read', async (req, res, next) => {
    try {
      const parsedId = notificationIdSchema.safeParse(req.params.id);

      if (!parsedId.success) {
        throw new HttpError(400, 'Invalid notification ID', {
          code: 'VALIDATION',
        });
      }

      const notification = await markNotificationRead(
        req.user.id,
        parsedId.data,
      );

      if (!notification) {
        throw new HttpError(404, 'Notification not found');
      }

      res.json({ notification });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
