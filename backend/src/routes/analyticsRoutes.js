
import { Router } from 'express';
import { z } from 'zod';
import { AnalyticsService } from '../services/analyticsService.js';
import { HttpError } from '../utils/httpError.js';

const monthSchema = z.string()
  .regex(/^\d{4}-\d{2}$/, 'Month must use YYYY-MM format')
  .refine((value) => {
    const [year, month] = value.split('-').map(Number);
    return year >= 1900 && month >= 1 && month <= 12;
  }, 'Enter a valid month');

export function analyticsRoutes() {
  const router = Router();
  const analyticsService = new AnalyticsService();

  router.get('/monthly', async (req, res, next) => {
    try {
      const parsed = monthSchema.safeParse(req.query.month);

      if (!parsed.success) {
        throw new HttpError(
          400,
          'A valid month query is required (YYYY-MM)',
          { code: 'VALIDATION' },
        );
      }

      const analytics = await analyticsService.getMonthlyAnalytics(
        req.user.id,
        parsed.data,
      );

      res.json({ analytics });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
