
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import {
  createIncomeSchema,
  updateIncomeSchema,
} from '../services/incomeSchemas.js';
import {
  createIncome,
  listIncome,
  updateIncome,
  deleteIncome,
} from '../services/incomeService.js';
import { HttpError } from '../utils/httpError.js';

const incomeIdSchema = z.string().uuid();

function validateIncomeId(id) {
  const result = incomeIdSchema.safeParse(id);

  if (!result.success) {
    throw new HttpError(400, 'Invalid income record ID', {
      code: 'VALIDATION',
    });
  }

  return result.data;
}

export function incomeRoutes() {
  const router = Router();

  // List income records belonging to the logged-in user.
  router.get('/', async (req, res, next) => {
    try {
      const income = await listIncome(req.user.id);
      res.json({ income });
    } catch (err) {
      next(err);
    }
  });

  // Create recurring or one-time income.
  router.post('/', validate(createIncomeSchema), async (req, res, next) => {
    try {
      const income = await createIncome(req.user.id, req.body);
      res.status(201).json({ income });
    } catch (err) {
      next(err);
    }
  });

  // Update an existing income record.
  router.put('/:id', validate(updateIncomeSchema), async (req, res, next) => {
    try {
      const incomeId = validateIncomeId(req.params.id);
      const income = await updateIncome(req.user.id, incomeId, req.body);

      if (!income) {
        throw new HttpError(404, 'Income record not found');
      }

      res.json({ income });
    } catch (err) {
      next(err);
    }
  });

  // Delete an existing income record.
  router.delete('/:id', async (req, res, next) => {
    try {
      const incomeId = validateIncomeId(req.params.id);
      const deleted = await deleteIncome(req.user.id, incomeId);

      if (!deleted) {
        throw new HttpError(404, 'Income record not found');
      }

      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
