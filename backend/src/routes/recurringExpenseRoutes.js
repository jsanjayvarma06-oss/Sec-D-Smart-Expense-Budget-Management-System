
import { Router } from 'express';
import { z } from 'zod';
import {
  generateDueRecurringExpenses,
  listRecurringExpenses,
  createRecurringExpense,
  markRecurringExpensePaid,
} from '../services/recurringExpenseService.js';
import { isWithinDaysOfToday, parseClientToday } from '../utils/clientDate.js';
import { HttpError } from '../utils/httpError.js';

const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime())
      && date.toISOString().slice(0, 10) === value;
  }, 'Enter a valid date');

const createRecurringExpenseSchema = z.object({
  category_id: z.string().uuid(),
  amount: z.coerce.number().finite().positive().max(9999999999.99),
  cycle: z.enum(['weekly', 'monthly']),
  // A start date decades away would generate thousands of entries at once.
  start_date: dateSchema.refine(
    (value) => isWithinDaysOfToday(value, 366),
    'First due date must be within a year of today',
  ),
  note: z.string().trim().max(255).nullable().optional()
    .transform((value) => value || null),
});

export function recurringExpenseRoutes() {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const recurringExpenses = await listRecurringExpenses(req.user.id);
      res.json({ recurringExpenses });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const parsed = createRecurringExpenseSchema.safeParse(req.body);

      if (!parsed.success) {
        throw new HttpError(400, 'Invalid recurring expense details', {
          code: 'VALIDATION',
          details: parsed.error.flatten(),
        });
      }

      const recurringExpense = await createRecurringExpense(
        req.user.id,
        parsed.data,
      );

      if (!recurringExpense) {
        throw new HttpError(400, 'Invalid or inaccessible category', {
          code: 'INVALID_CATEGORY',
        });
      }

      res.status(201).json({ recurringExpense });
    } catch (err) {
      next(err);
    }
  });

  router.post('/generate-due', async (req, res, next) => {
    try {
      const today = parseClientToday(req.body?.today);
      const expenses = await generateDueRecurringExpenses(req.user.id, today);

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
