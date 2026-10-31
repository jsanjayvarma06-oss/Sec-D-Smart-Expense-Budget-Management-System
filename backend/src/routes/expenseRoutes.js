
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import {
  createExpenseSchema,
  updateExpenseSchema,
} from '../services/expenseSchemas.js';
import {
  createExpense,
  listExpenses,
  updateExpense,
  deleteExpense,
  dismissExpenseFlag,
} from '../services/expenseService.js';
import { HttpError } from '../utils/httpError.js';

const expenseIdSchema = z.string().uuid();

const expenseListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  category_id: z.string().uuid().optional(),
  start_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  end_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict().refine(
  (value) => !value.start_date
    || !value.end_date
    || value.start_date <= value.end_date,
  {
    message: 'Start date must be before or equal to end date',
  },
);

function validateExpenseId(id) {
  const result = expenseIdSchema.safeParse(id);

  if (!result.success) {
    throw new HttpError(400, 'Invalid expense record ID', {
      code: 'VALIDATION',
    });
  }

  return result.data;
}

export function expenseRoutes() {
  const router = Router();

  // List expenses belonging to the logged-in user.
  router.get('/', async (req, res, next) => {
    try {
      const parsed = expenseListQuerySchema.safeParse(req.query);

      if (!parsed.success) {
        throw new HttpError(400, 'Invalid expense search or filter parameters', {
          code: 'VALIDATION',
        });
      }

      const hasListOptions = Object.keys(req.query).length > 0;

      const result = await listExpenses(req.user.id, {
        ...parsed.data,
        paginate: hasListOptions,
      });

      res.json({
        expenses: result.expenses,
        pagination: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  });

  // Create an expense.
  router.post('/', validate(createExpenseSchema), async (req, res, next) => {
    try {
      const expense = await createExpense(req.user.id, req.body);

      if (!expense) {
        throw new HttpError(400, 'Invalid or inaccessible category', {
          code: 'INVALID_CATEGORY',
        });
      }

      res.status(201).json({ expense });
    } catch (err) {
      next(err);
    }
  });

  // Update an expense.
  router.put('/:id', validate(updateExpenseSchema), async (req, res, next) => {
    try {
      const expenseId = validateExpenseId(req.params.id);
      const expense = await updateExpense(req.user.id, expenseId, req.body);

      if (!expense) {
        throw new HttpError(404, 'Expense record not found or category is inaccessible');
      }

      res.json({ expense });
    } catch (err) {
      next(err);
    }
  });

  // Delete an expense.
  router.delete('/:id', async (req, res, next) => {
    try {
      const expenseId = validateExpenseId(req.params.id);
      const deleted = await deleteExpense(req.user.id, expenseId);

      if (!deleted) {
        throw new HttpError(404, 'Expense record not found');
      }

      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // Dismiss an unusual-spending flag without deleting the expense.
  router.patch('/:id/review', async (req, res, next) => {
    try {
      const expenseId = validateExpenseId(req.params.id);
      const expense = await dismissExpenseFlag(req.user.id, expenseId);

      if (!expense) {
        throw new HttpError(404, 'Flagged expense not found');
      }

      res.json({ expense });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
