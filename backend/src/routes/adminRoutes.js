import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { validateIdParam } from '../middleware/validateIdParam.js';
import {
  createDefaultCategory,
  deleteDefaultCategory,
  listDefaultCategories,
  renameDefaultCategory,
  retireDefaultCategory,
  restoreDefaultCategory,
} from '../services/adminCategoryService.js';
import { getAdminOverview } from '../services/adminService.js';
import { listAdminActions, recordAdminAction } from '../services/auditLogService.js';
import { createCategorySchema, updateCategorySchema } from '../services/categorySchemas.js';
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

  // Built-in categories (#129): list, add, rename and remove. Only the names
  // are shown; nothing here touches anyone's expenses, budgets or notes.
  router.get('/categories', async (req, res, next) => {
    try {
      res.json(await listDefaultCategories(req.user.id));
    } catch (err) {
      next(err);
    }
  });

  router.post('/categories', validate(createCategorySchema), async (req, res, next) => {
    try {
      const category = await createDefaultCategory(req.user.id, req.body.name);
      res.status(201).json({ category });
    } catch (err) {
      next(categoryError(err));
    }
  });

  router.put('/categories/:id', validateIdParam(), validate(updateCategorySchema), async (req, res, next) => {
    try {
      const category = await renameDefaultCategory(req.user.id, req.params.id, req.body.name);
      if (!category) throw new HttpError(404, 'Built-in category not found');
      res.json({ category });
    } catch (err) {
      next(categoryError(err));
    }
  });


  // Retire a built-in category while preserving every historical reference.
  router.post('/categories/:id/retire', validateIdParam(), async (req, res, next) => {
    try {
      const category = await retireDefaultCategory(req.user.id, req.params.id);
      if (!category) throw new HttpError(404, 'Built-in category not found');
      res.json({ category });
    } catch (err) {
      next(categoryError(err));
    }
  });

  // Restore a retired built-in category to new-entry selection.
  router.post('/categories/:id/restore', validateIdParam(), async (req, res, next) => {
    try {
      const category = await restoreDefaultCategory(req.user.id, req.params.id);
      if (!category) throw new HttpError(404, 'Built-in category not found');
      res.json({ category });
    } catch (err) {
      next(categoryError(err));
    }
  });

  router.delete('/categories/:id', validateIdParam(), async (req, res, next) => {
    try {
      const deleted = await deleteDefaultCategory(req.user.id, req.params.id);
      if (!deleted) throw new HttpError(404, 'Built-in category not found');
      res.status(204).end();
    } catch (err) {
      next(categoryError(err));
    }
  });

  return router;
}

// Turns the database's refusals into answers the screen can show.
function categoryError(err) {
  // 23505: another built-in category already has this name (ignoring case).
  if (err.code === '23505') {
    return new HttpError(409, 'A built-in category with this name already exists', {
      code: 'CATEGORY_EXISTS',
    });
  }
  // 23503: expenses, budgets or recurring payments still use it.
  if (err.code === '23503') {
    return new HttpError(
      409,
      'People are still using this category, so it cannot be removed. Rename it instead.',
      { code: 'CATEGORY_IN_USE' },
    );
  }
  return err;
}
