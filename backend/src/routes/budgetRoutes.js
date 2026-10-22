
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import {
  createBudgetSchema,
  updateBudgetSchema,
} from '../services/budgetSchemas.js';
import {
  listBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
} from '../services/budgetService.js';
import { HttpError } from '../utils/httpError.js';

const budgetIdSchema = z.string().uuid();

function validateBudgetId(id) {
  const result = budgetIdSchema.safeParse(id);

  if (!result.success) {
    throw new HttpError(400, 'Invalid budget ID', {
      code: 'VALIDATION',
    });
  }

  return result.data;
}

const monthQuerySchema = z.string()
  .regex(/^\d{4}-\d{2}$/, 'Month must use YYYY-MM format')
  .refine((value) => {
    const [year, month] = value.split('-').map(Number);
    return year >= 1900 && month >= 1 && month <= 12;
  }, 'Enter a valid month');

export function budgetRoutes() {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const result = monthQuerySchema.safeParse(req.query.month);

      if (!result.success) {
        throw new HttpError(400, 'A valid month query is required (YYYY-MM)', {
          code: 'VALIDATION',
        });
      }

      const budgets = await listBudgets(req.user.id, result.data);
      res.json({ budgets });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', validate(createBudgetSchema), async (req, res, next) => {
    try {
      const result = await createBudget(req.user.id, req.body);

      if (result.error === 'INVALID_CATEGORY') {
        throw new HttpError(400, 'Invalid or inaccessible category', {
          code: 'INVALID_CATEGORY',
        });
      }

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', validate(updateBudgetSchema), async (req, res, next) => {
    try {
      const budgetId = validateBudgetId(req.params.id);
      const budget = await updateBudget(
        req.user.id,
        budgetId,
        req.body.amount,
      );

      if (!budget) {
        throw new HttpError(404, 'Budget not found');
      }

      res.json({ budget });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const budgetId = validateBudgetId(req.params.id);
      const deleted = await deleteBudget(req.user.id, budgetId);

      if (!deleted) {
        throw new HttpError(404, 'Budget not found');
      }

      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
