import { Router } from 'express';
import { z } from 'zod';
import { simulateBudget, simulatePurchase } from '../services/whatIfService.js';
import { HttpError } from '../utils/httpError.js';

const monthSchema = z.string()
  .regex(/^\d{4}-\d{2}$/)
  .refine((value) => {
    const [year, month] = value.split('-').map(Number);
    return year >= 1900 && month >= 1 && month <= 12;
  });

const budgetSimulationSchema = z.object({
  month: monthSchema,
  proposedBudget: z.coerce.number().finite().nonnegative(),
  proposedIncome: z.coerce.number().finite().nonnegative(),
});

const purchaseSimulationSchema = z.object({
  month: monthSchema,
  purchaseAmount: z.coerce.number().finite().positive(),
  category_id: z.string().uuid().optional(),
});

export function whatIfRoutes() {
  const router = Router();

  router.post('/simulate', async (req, res, next) => {
    try {
      const purchase = purchaseSimulationSchema.safeParse(req.body);
      if (purchase.success) {
        const simulation = await simulatePurchase(req.user.id, purchase.data);
        return res.json({ simulation });
      }

      const budget = budgetSimulationSchema.safeParse(req.body);
      if (!budget.success) {
        throw new HttpError(
          400,
          'Provide a valid month and either a purchase amount or proposed budget and income',
          { code: 'VALIDATION' },
        );
      }

      const simulation = await simulateBudget(req.user.id, budget.data);
      return res.json({ simulation });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
