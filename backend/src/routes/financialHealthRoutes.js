
import { Router } from 'express';
import { z } from 'zod';
import { calculateFinancialHealth } from '../services/financialHealthService.js';
import { HttpError } from '../utils/httpError.js';

const monthSchema = z.string()
  .regex(/^\d{4}-\d{2}$/, 'Month must use YYYY-MM format')
  .refine((value) => {
    const [year, month] = value.split('-').map(Number);
    return year >= 1900 && month >= 1 && month <= 12;
  }, 'Enter a valid month');

export function financialHealthRoutes() {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const result = monthSchema.safeParse(req.query.month);

      if (!result.success) {
        throw new HttpError(
          400,
          'A valid month query is required (YYYY-MM)',
          { code: 'VALIDATION' },
        );
      }

      const health = await calculateFinancialHealth(
        req.user.id,
        result.data,
      );

      res.json({ health });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
