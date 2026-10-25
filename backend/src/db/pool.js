
import pg from 'pg';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// Keep PostgreSQL DATE values as YYYY-MM-DD strings.
// This avoids timezone shifts when dates are returned through the API.
pg.types.setTypeParser(1082, (value) => value);

// NUMERIC remains a string to avoid floating-point rounding of money.
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
});

pool.on('error', (err) => {
  logger.error('Unexpected database error', { error: err.message });
});

export function query(text, params) {
  return pool.query(text, params);
}
