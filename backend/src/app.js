// Application Controller: the single entry point for every request. It applies
// transport security, rate limits, body limits and session checks before any
// service runs, then routes to the service layer. Every /api route needs a
// session unless it is listed in PUBLIC_ROUTES in middleware/requireAuth.js.

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { query } from './db/pool.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { requireAuthByDefault } from './middleware/requireAuth.js';
import { createRateLimiter, requireHttps } from './middleware/security.js';
import { authRoutes } from './routes/authRoutes.js';

export function createApp({ loginRateLimit = 20, apiRateLimit = 300 } = {}) {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(requireHttps);
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  app.use('/api', createRateLimiter({ name: 'api', windowMinutes: 15, limit: apiRateLimit }));
  app.use('/api', requireAuthByDefault);

  app.get('/api/health', async (_req, res, next) => {
    try {
      await query('SELECT 1');
      res.json({ status: 'ok' });
    } catch (err) {
      next(err);
    }
  });

  // In front of the login route before it exists, so it is limited from day one.
  app.use(
    '/api/auth/login',
    createRateLimiter({ name: 'login', windowMinutes: 15, limit: loginRateLimit }),
  );
  app.use('/api/auth', authRoutes());

  app.use('/api', notFound);
  app.use(errorHandler);

  return app;
}
