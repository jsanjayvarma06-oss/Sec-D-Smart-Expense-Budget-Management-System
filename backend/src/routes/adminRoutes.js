import { Router } from 'express';
import { getAdminOverview } from '../services/adminService.js';

// Every route here sits behind requireAdmin (see app.js).
export function adminRoutes() {
  const router = Router();

  // Account counts for the admin home screen.
  router.get('/overview', async (_req, res, next) => {
    try {
      res.json({ overview: await getAdminOverview() });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
