
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
} from '../services/expenseService.js';
import { HttpError } from '../utils/httpError.js';

const expenseIdSchema = z.string().uuid();

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
      const expenses = await listExpenses(req.user.id);
      res.json({ expenses });
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

  return router;
}
