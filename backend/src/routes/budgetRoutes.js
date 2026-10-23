
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import {
  createBudgetSchema,
  updateBudgetSchema,
} from '../services/budgetSchemas.js';
import { recommendBudgets } from '../services/budgetRecommendationService.js';
import {
  listBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  getRemainingBudget,
} from '../services/budgetService.js';
import { getBudgetAlerts } from '../services/budgetAlertService.js';
import {
  createBudgetNotifications,
} from '../services/notificationService.js';
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

function rejectExceededCategoryBudget(result) {
  if (result?.error === 'CATEGORY_BUDGETS_EXCEED_OVERALL') {
    throw new HttpError(
      400,
      'The combined category budgets cannot exceed the overall monthly budget',
      {
        code: 'CATEGORY_BUDGETS_EXCEED_OVERALL',
        fields: {
          overallAmount: result.overallAmount,
          proposedTotal: result.proposedTotal,
        },
      },
    );
  }
}

export function budgetRoutes() {
  const router = Router();
  // Recommend category budgets based on spending history and income.
  router.get('/recommendations', async (req, res, next) => {
    try {
      const recommendations = await recommendBudgets(req.user.id);
      res.json({ recommendations });
    } catch (err) {
      next(err);
    }
  });

  // Return budget alerts and save each alert as a notification.
  router.get('/alerts', async (req, res, next) => {
    try {
      const result = monthQuerySchema.safeParse(req.query.month);

      if (!result.success) {
        throw new HttpError(
          400,
          'A valid month query is required (YYYY-MM)',
          { code: 'VALIDATION' },
        );
      }

      const alerts = await getBudgetAlerts(req.user.id, result.data);

      await createBudgetNotifications(req.user.id, alerts);

      res.json({ alerts });
    } catch (err) {
      next(err);
    }
  });

  // Calculate the remaining budget for each budget in a month.
  router.get('/remaining', async (req, res, next) => {
    try {
      const result = monthQuerySchema.safeParse(req.query.month);

      if (!result.success) {
        throw new HttpError(
          400,
          'A valid month query is required (YYYY-MM)',
          { code: 'VALIDATION' },
        );
      }

      const remainingBudgets = await getRemainingBudget(
        req.user.id,
        result.data,
      );

      res.json({ remainingBudgets });
    } catch (err) {
      next(err);
    }
  });

  // List budgets for a month.
  router.get('/', async (req, res, next) => {
    try {
      const result = monthQuerySchema.safeParse(req.query.month);

      if (!result.success) {
        throw new HttpError(
          400,
          'A valid month query is required (YYYY-MM)',
          { code: 'VALIDATION' },
        );
      }

      const budgets = await listBudgets(req.user.id, result.data);

      res.json({ budgets });
    } catch (err) {
      next(err);
    }
  });

  // Create or replace a monthly budget.
  router.post('/', validate(createBudgetSchema), async (req, res, next) => {
    try {
      const result = await createBudget(req.user.id, req.body);

      rejectExceededCategoryBudget(result);

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

  // Update an existing budget.
  router.put('/:id', validate(updateBudgetSchema), async (req, res, next) => {
    try {
      const budgetId = validateBudgetId(req.params.id);

      const budget = await updateBudget(
        req.user.id,
        budgetId,
        req.body.amount,
      );

      rejectExceededCategoryBudget(budget);

      if (!budget) {
        throw new HttpError(404, 'Budget not found');
      }

      res.json({ budget });
    } catch (err) {
      next(err);
    }
  });

  // Delete an existing budget.
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
