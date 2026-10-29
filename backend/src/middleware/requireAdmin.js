import { HttpError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';

// Mounted in front of every /api/admin route, after requireAuthByDefault, so a
// logged-out request is already a 401 here. A logged-in user who isn't an admin
// gets a 403 and the attempt is logged with the account ID only, no personal
// data (SR10).
export function requireAdmin(req, res, next) {
  if (req.user?.role === 'admin') return next();

  logger.warn('Admin access refused', {
    method: req.method,
    path: req.originalUrl,
    user_id: req.user?.id,
    reason: 'not_admin',
  });
  return next(new HttpError(403, 'Only administrators can open this page', { code: 'FORBIDDEN' }));
}
