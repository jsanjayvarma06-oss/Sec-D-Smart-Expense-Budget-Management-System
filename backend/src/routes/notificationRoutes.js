
import { Router } from 'express';
import { z } from 'zod';
import {
  listNotifications,
  markNotificationRead,
  createPaymentReminders,
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
  // Generate reminders for recurring payments due soon.
  router.post('/payment-reminders', async (req, res, next) => {
    try {
      const dateSchema = z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine((value) => {
          const date = new Date(`${value}T00:00:00Z`);
          return !Number.isNaN(date.getTime())
            && date.toISOString().slice(0, 10) === value;
        });

      const parsed = dateSchema.safeParse(req.body?.today);

      if (!parsed.success) {
        throw new HttpError(400, 'A valid today date is required (YYYY-MM-DD)', {
          code: 'VALIDATION',
        });
      }

      const notifications = await createPaymentReminders(
        req.user.id,
        parsed.data,
      );

      res.json({
        created_count: notifications.length,
        notifications,
      });
    } catch (err) {
      next(err);
    }
  });
  return router;
}
