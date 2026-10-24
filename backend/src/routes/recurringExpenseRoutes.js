
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

  // Mark a recurring expense cycle as paid.
  router.patch('/:id/pay', async (req, res, next) => {
    try {
      const idSchema = z.string().uuid();
      const parsedId = idSchema.safeParse(req.params.id);
      const parsedDate = dateSchema.safeParse(req.body?.due_date);

      if (!parsedId.success || !parsedDate.success) {
        throw new HttpError(
          400,
          'A valid recurring expense ID and due_date are required',
          { code: 'VALIDATION' },
        );
      }

      const { markRecurringExpensePaid } =
        await import('../services/recurringExpenseService.js');

      const result = await markRecurringExpensePaid(
        req.user.id,
        parsedId.data,
        parsedDate.data,
      );

      if (!result) {
        throw new HttpError(404, 'Recurring expense cycle not found');
      }

      res.json({ recurringExpense: result });
    } catch (err) {
      next(err);
    }
  });
  return router;
}
