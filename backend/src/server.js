import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { logger } from './utils/logger.js';

const app = createApp({
  apiRateLimit: config.rateLimit.api,
  loginRateLimit: config.rateLimit.login,
});

const server = app.listen(config.port, () => {
  logger.info('API listening', { port: config.port, env: config.env });
});

function shutdown() {
  server.close(() => pool.end().finally(() => process.exit(0)));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
