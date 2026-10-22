import { config } from '../config.js';
import { findSession } from '../services/sessionService.js';
import { HttpError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';

export function clearSessionCookie(res) {
  res.clearCookie(config.session.cookieName, sessionCookieOptions());
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: config.session.secureCookie,
    sameSite: 'strict',
    path: '/',
  };
}

// The only API routes reachable without a session. Everything else under /api,
// including routes added later, requires one unless it is listed here.
const PUBLIC_ROUTES = new Set([
  'GET /api/health',
  'POST /api/auth/register',
  'POST /api/auth/login',
]);

// Mounted once on /api by the Application Controller, so a new endpoint is
// protected even if its author forgets to add requireAuth (SR08).
export function requireAuthByDefault(req, res, next) {
  if (PUBLIC_ROUTES.has(`${req.method} ${req.baseUrl}${req.path}`)) return next();
  return requireAuth(req, res, next);
}

// Every protected route goes through this check before any service runs
// (SR01, SR08). Rejected attempts are logged without the token itself.
export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[config.session.cookieName];
    const user = token ? await findSession(token) : null;

    if (!user) {
      if (token) clearSessionCookie(res);
      logger.warn('Unauthorized request', {
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
        reason: token ? 'invalid_or_expired_session' : 'no_session',
      });
      return next(new HttpError(401, 'Please log in to continue', { code: 'UNAUTHENTICATED' }));
    }

    req.user = user;
    req.sessionToken = token;
    next();
  } catch (err) {
    next(err);
  }
}
