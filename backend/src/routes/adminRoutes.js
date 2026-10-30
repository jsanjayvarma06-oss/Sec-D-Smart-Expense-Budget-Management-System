import { Router } from 'express';
import { getAdminOverview } from '../services/adminService.js';
import { recordAdminAction } from '../services/auditLogService.js';
import { getSystemHealth } from '../services/systemHealthService.js';

// Every route here sits behind requireAdmin (see app.js), and every route
// records what the admin did in the audit log before it answers (#123), views
// included, so the log shows who looked at what.
export function adminRoutes() {
  const router = Router();

  // Account counts for the admin home screen.
  router.get('/overview', async (req, res, next) => {
    try {
      const overview = await getAdminOverview();
      await recordAdminAction({ adminId: req.user.id, action: 'view_overview' });
      res.json({ overview });
    } catch (err) {
      next(err);
    }
  });

  // API, database, migrations, database size, last backup and recent errors,
  // each green, amber or red (#121).
  router.get('/health', async (req, res, next) => {
    try {
      const health = await getSystemHealth();
      await recordAdminAction({ adminId: req.user.id, action: 'view_system_health' });
      res.json({ health });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
