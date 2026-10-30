import { Router } from 'express';
import { z } from 'zod';
import { getAdminOverview } from '../services/adminService.js';
import { listAdminActions, recordAdminAction } from '../services/auditLogService.js';
import { getSystemHealth } from '../services/systemHealthService.js';
import { HttpError } from '../utils/httpError.js';

// Filters for the audit log screen. Every one is optional.
const auditLogQuerySchema = z.object({
  admin_id: z.uuid().optional(),
  action: z.string().max(50).regex(/^[a-z][a-z_]*$/).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
}).refine(
  ({ from, to }) => !from || !to || new Date(from) < new Date(to),
  { message: 'The start date must be before the end date', path: ['from'] },
);

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

  // Audit log, newest first, filtered by admin, action and date (#124).
  // GET /api/admin/audit-log?admin_id=&action=&from=&to=
  router.get('/audit-log', async (req, res, next) => {
    try {
      // Empty filters from the screen mean "any".
      const filters = Object.fromEntries(
        Object.entries(req.query).filter(([, value]) => value !== ''),
      );
      const parsed = auditLogQuerySchema.safeParse(filters);
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.issues[0].message, { code: 'VALIDATION' });
      }

      const { admin_id: adminId, action, from, to } = parsed.data;
      const log = await listAdminActions({ adminId, action, from, to });
      await recordAdminAction({ adminId: req.user.id, action: 'view_audit_log', details: parsed.data });
      res.json(log);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
