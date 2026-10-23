
import { Router } from 'express';
import { z } from 'zod';
import { generateDueRecurringExpenses } from '../services/recurringExpenseService.js';
import { HttpError } from '../utils/httpError.js';

const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime())
      && date.toISOString().slice(0, 10) === value;
  }, 'Enter a valid date');

export function recurringExpenseRoutes() {
  const router = Router();

  router.post('/generate-due', async (req, res, next) => {
    try {
      const parsed = dateSchema.safeParse(req.body?.today);

      if (!parsed.success) {
        throw new HttpError(
          400,
          'A valid today date is required (YYYY-MM-DD)',
          { code: 'VALIDATION' },
        );
      }

      const expenses = await generateDueRecurringExpenses(
        req.user.id,
        parsed.data,
      );

      res.json({
        generated_count: expenses.length,
        expenses,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
