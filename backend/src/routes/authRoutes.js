import { Router } from 'express';
import { clearSessionCookie } from '../middleware/requireAuth.js';
import { destroySession } from '../services/sessionService.js';

// Session endpoints. POST /register and POST /login are added here by the
// registration and login items; both are already listed in PUBLIC_ROUTES, and
// /login already sits behind the login rate limiter in app.js.
export function authRoutes() {
  const router = Router();

  // /logout and /me are not in PUBLIC_ROUTES, so requireAuthByDefault has already
  // checked the session and set req.user.
  router.post('/logout', async (req, res, next) => {
    try {
      await destroySession(req.sessionToken);
      clearSessionCookie(res);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
