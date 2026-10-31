
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
import {
  previewStatement,
  importExpenses,
} from '../services/statementImportService.js';
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

  // Preview statement CSV and detect duplicates & categories (#100, #101).
  router.post('/import/preview', async (req, res, next) => {
    try {
      const csv = req.body?.csv ?? req.body?.content;
      if (!csv || typeof csv !== 'string') {
        throw new HttpError(400, 'CSV content is required', { code: 'INVALID_INPUT' });
      }
      const preview = await previewStatement(req.user.id, csv);
      res.json(preview);
    } catch (err) {
      next(err);
    }
  });

  // Atomic import of selected expense rows (#102).
  router.post('/import', async (req, res, next) => {
    try {
      const items = req.body?.expenses || req.body?.items;
      const result = await importExpenses(req.user.id, items);
      res.status(201).json(result);
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
