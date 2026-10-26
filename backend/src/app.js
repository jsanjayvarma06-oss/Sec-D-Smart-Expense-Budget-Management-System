
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { query } from './db/pool.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { financialHealthRoutes } from './routes/financialHealthRoutes.js';
import { whatIfRoutes } from './routes/whatIfRoutes.js';
import { recurringExpenseRoutes } from './routes/recurringExpenseRoutes.js';
import { requireAuthByDefault } from './middleware/requireAuth.js';
import {
  createRateLimiter,
  requireHttps,
} from './middleware/security.js';

import { authRoutes } from './routes/authRoutes.js';
import { forecastRoutes } from './routes/forecastRoutes.js';
import { incomeRoutes } from './routes/incomeRoutes.js';
import { expenseRoutes } from './routes/expenseRoutes.js';
import { categoryRoutes } from './routes/categoryRoutes.js';
import { notificationRoutes } from './routes/notificationRoutes.js';
import { budgetRoutes } from './routes/budgetRoutes.js';
import { analyticsRoutes } from './routes/analyticsRoutes.js';
export function createApp({
  loginRateLimit = 20,
  apiRateLimit = 300,
  passwordResetRateLimit = 5,
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
app.use('/api/recurring-expenses', recurringExpenseRoutes());
app.use('/api/forecast', forecastRoutes());

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

  // Reset emails are limited per source so the form can't be used to flood
  // someone's inbox or guess reset links (SR09).
  app.use(
    ['/api/auth/forgot-password', '/api/auth/reset-password'],
    createRateLimiter({
      name: 'password-reset',
      windowMinutes: 15,
      limit: passwordResetRateLimit,
    }),
  );

 // API routes
app.use('/api/financial-health', financialHealthRoutes());
app.use('/api/auth', authRoutes());
app.use('/api/income', incomeRoutes());
  app.use('/api/expenses', expenseRoutes());
  app.use('/api/categories', categoryRoutes());
  app.use('/api/budgets', budgetRoutes());
app.use('/api/what-if', whatIfRoutes());
  app.use('/api/analytics', analyticsRoutes());
  app.use('/api/notifications', notificationRoutes());


  // Error handling
  app.use('/api', notFound);
  app.use(errorHandler);

  return app;
}
