
import { Router } from 'express';
import { config } from '../config.js';
import { validate } from '../middleware/validate.js';
import {
  clearSessionCookie,
  sessionCookieOptions,
} from '../middleware/requireAuth.js';
import { destroySession, createSession } from '../services/sessionService.js';
import { hashPassword, verifyAgainstDummyHash, verifyPassword } from '../services/passwordService.js';
import { isLocked, recordFailedLogin, resetFailedLogins } from '../services/loginProtection.js';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../services/authSchemas.js';
import { requestPasswordReset, resetPassword } from '../services/passwordResetService.js';
import { query } from '../db/pool.js';
import { HttpError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';

export function authRoutes() {
  const router = Router();

  // Register a new account.
  router.post('/register', validate(registerSchema), async (req, res, next) => {
    try {
      const { name, email, password } = req.body;
      const passwordHash = await hashPassword(password);

      const { rows } = await query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, name, email`,
        [name, email, passwordHash],
      );

      res.status(201).json({ user: rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        return next(new HttpError(409, 'An account with this email already exists', {
          code: 'EMAIL_EXISTS',
        }));
      }
      next(err);
    }
  });

  // Log in using an email and password.
  router.post('/login', validate(loginSchema), async (req, res, next) => {
    try {
      const { email, password } = req.body;

      const { rows } = await query(
        `SELECT id, name, email, password_hash, locked_until
         FROM users
         WHERE lower(email) = $1`,
        [email],
      );

      const user = rows[0];

      // Use a generic error and the same bcrypt work, so neither the message nor
      // the response time reveals whether an email exists.
      if (!user) {
        await verifyAgainstDummyHash(password);
        throw new HttpError(401, 'Invalid email or password', {
          code: 'INVALID_CREDENTIALS',
        });
      }

      if (isLocked(user)) {
        throw new HttpError(429, 'Too many failed attempts. Please try again later.', {
          code: 'ACCOUNT_LOCKED',
        });
      }

      const passwordMatches = await verifyPassword(password, user.password_hash);

      if (!passwordMatches) {
        await recordFailedLogin(user.id);
        throw new HttpError(401, 'Invalid email or password', {
          code: 'INVALID_CREDENTIALS',
        });
      }

      await resetFailedLogins(user.id);

      const token = await createSession(user.id);

      res.cookie(config.session.cookieName, token, {
        ...sessionCookieOptions(),
        maxAge: config.session.maxHours * 60 * 60 * 1000,
      });

      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // Logout requires a valid session.
  router.post('/logout', async (req, res, next) => {
    try {
      await destroySession(req.sessionToken);
      clearSessionCookie(res);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // Password recovery, step 1. The reply is sent before any lookup happens, so
  // neither its wording nor its timing reveals whether the email has an account.
  router.post('/forgot-password', validate(forgotPasswordSchema), (req, res) => {
    res.status(202).json({
      message: 'If an account exists for that email, we have sent a link to reset the password.',
    });
    requestPasswordReset(req.body.email).catch((err) => {
      logger.error('Password reset request failed', { error: err.message });
    });
  });

  // Password recovery, step 2: the link from the email plus a new password.
  router.post('/reset-password', validate(resetPasswordSchema), async (req, res, next) => {
    try {
      const done = await resetPassword(req.body.token, req.body.password);
      if (!done) {
        throw new HttpError(400, 'This reset link is invalid or has expired. Please request a new one.', {
          code: 'INVALID_RESET_TOKEN',
        });
      }
      res.json({ message: 'Your password has been changed. Please log in with your new password.' });
    } catch (err) {
      next(err);
    }
  });

  // Return the current authenticated user.
  router.get('/me', (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
