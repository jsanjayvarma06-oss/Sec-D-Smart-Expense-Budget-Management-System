
import { Router } from 'express';
import { z } from 'zod';
import { simulateBudget } from '../services/whatIfService.js';
import { HttpError } from '../utils/httpError.js';

const simulationSchema = z.object({
  month: z.string()
    .regex(/^\d{4}-\d{2}$/)
    .refine((value) => {
      const [year, month] = value.split('-').map(Number);
      return year >= 1900 && month >= 1 && month <= 12;
    }),
  proposedBudget: z.coerce.number().finite().nonnegative(),
  proposedIncome: z.coerce.number().finite().nonnegative(),
});

export function whatIfRoutes() {
  const router = Router();

  router.post('/simulate', async (req, res, next) => {
    try {
      const parsed = simulationSchema.safeParse(req.body);

      if (!parsed.success) {
        throw new HttpError(
          400,
          'Provide a valid month, proposed budget, and proposed income',
          { code: 'VALIDATION' },
        );
      }

      const result = await simulateBudget(req.user.id, parsed.data);
      res.json({ simulation: result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
