
import { Router } from 'express';
import { forecastMonthlySpending } from '../services/forecastService.js';

export function forecastRoutes() {
  const router = Router();

  router.get('/monthly', async (req, res, next) => {
    try {
      const forecast = await forecastMonthlySpending(req.user.id);
      res.json({ forecast });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
