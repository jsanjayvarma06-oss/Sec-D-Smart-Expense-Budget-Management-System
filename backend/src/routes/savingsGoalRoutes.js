import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import {
  createSavingsGoalSchema,
  updateSavingsGoalSchema,
} from '../services/savingsGoalSchemas.js';
import {
  listSavingsGoals,
  createSavingsGoal,
  updateSavingsGoal,
  deleteSavingsGoal,
} from '../services/savingsGoalService.js';
import { HttpError } from '../utils/httpError.js';

const goalIdSchema = z.string().uuid();

function validateGoalId(id) {
  const result = goalIdSchema.safeParse(id);

  if (!result.success) {
    throw new HttpError(400, 'Invalid savings goal ID', {
      code: 'VALIDATION',
    });
  }

  return result.data;
}

export function savingsGoalRoutes() {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const savingsGoals = await listSavingsGoals(req.user.id);
      res.json({ savingsGoals });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', validate(createSavingsGoalSchema), async (req, res, next) => {
    try {
      const savingsGoal = await createSavingsGoal(req.user.id, req.body);
      res.status(201).json({ savingsGoal });
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', validate(updateSavingsGoalSchema), async (req, res, next) => {
    try {
      const goalId = validateGoalId(req.params.id);
      const savingsGoal = await updateSavingsGoal(
        req.user.id,
        goalId,
        req.body,
      );

      if (!savingsGoal) {
        throw new HttpError(404, 'Savings goal not found');
      }

      res.json({ savingsGoal });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const goalId = validateGoalId(req.params.id);
      const deleted = await deleteSavingsGoal(req.user.id, goalId);

      if (!deleted) {
        throw new HttpError(404, 'Savings goal not found');
      }

      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}