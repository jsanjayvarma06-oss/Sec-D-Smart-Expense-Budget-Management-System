
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { query } from './db/pool.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { requireAuthByDefault } from './middleware/requireAuth.js';
import {
  createRateLimiter,
  requireHttps,
} from './middleware/security.js';

import { authRoutes } from './routes/authRoutes.js';
import { incomeRoutes } from './routes/incomeRoutes.js';
import { expenseRoutes } from './routes/expenseRoutes.js';
import { categoryRoutes } from './routes/categoryRoutes.js';
import { budgetRoutes } from './routes/budgetRoutes.js';

export function createApp({
  loginRateLimit = 20,
  apiRateLimit = 300,
} = {}) {
  const app = express();

  // Security middleware
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(requireHttps);
  app.use(cors({
    origin: config.corsOrigins,
    credentials: true,
  }));
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  // Rate-limit API requests
  app.use(
    '/api',
    createRateLimiter({
      name: 'api',
      windowMinutes: 15,
      limit: apiRateLimit,
    }),
  );

  // Protect API routes by default
  app.use('/api', requireAuthByDefault);

  // Health check
  app.get('/api/health', async (_req, res, next) => {
    try {
      await query('SELECT 1');
      res.json({ status: 'ok' });
    } catch (err) {
      next(err);
    }
  });

  // Rate-limit login requests
  app.use(
    '/api/auth/login',
    createRateLimiter({
      name: 'login',
      windowMinutes: 15,
      limit: loginRateLimit,
    }),
  );

  // API routes
  app.use('/api/auth', authRoutes());
  app.use('/api/income', incomeRoutes());
  app.use('/api/expenses', expenseRoutes());
  app.use('/api/categories', categoryRoutes());
  app.use('/api/budgets', budgetRoutes());

  // Error handling
  app.use('/api', notFound);
  app.use(errorHandler);

  return app;
}
