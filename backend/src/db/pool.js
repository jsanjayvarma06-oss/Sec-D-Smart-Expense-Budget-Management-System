import pg from 'pg';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// NUMERIC comes back from pg as a string. Keep it that way in the data layer so
// money is never rounded through floating point; services convert explicitly.

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
