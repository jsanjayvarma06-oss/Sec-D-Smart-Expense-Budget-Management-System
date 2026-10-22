import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// Refuses plain HTTP in production (SR06). Locally the Vite proxy uses HTTP.
export function requireHttps(req, res, next) {
  if (!config.isProduction || req.secure) return next();
  res.status(403).json({ error: 'HTTPS is required' });
}

// Per-source limit on requests (SR09). Account lockout in the auth service is the
// second layer, so one IP cannot try many accounts and one account cannot be
// tried from many IPs.
export function createRateLimiter({ windowMinutes, limit, name }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', { limiter: name, ip: req.ip, path: req.originalUrl });
      res.status(429).json({
        error: 'Too many attempts. Please wait a few minutes and try again.',
        code: 'RATE_LIMITED',
      });
    },
  });
}
