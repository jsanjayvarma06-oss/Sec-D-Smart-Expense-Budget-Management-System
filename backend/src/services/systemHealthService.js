// System health for the admin panel (story #120). Every item gets a state:
// green (fine), amber (look at it soon) or red (look at it now). Only the
// system is checked here; nothing reads anyone's expenses, income or budgets.

import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import { config } from '../config.js';
import { migrationsDir } from '../db/migrate.js';
import { query } from '../db/pool.js';
import { errorsInLastDay, logger } from '../utils/logger.js';

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

const HOUR_MS = 60 * 60 * 1000;
const GB = 1024 ** 3;
const STATE_ORDER = ['green', 'amber', 'red'];

// When an item turns amber or red.
export const HEALTH_LIMITS = {
  slowDatabaseMs: 500,
  // Backups run daily, so a day plus two hours of slack is still on time.
  backupAmberHours: 26,
  backupRedHours: 7 * 24,
  databaseSizeAmberBytes: 1 * GB,
  databaseSizeRedBytes: 5 * GB,
  errorsAmber: 1,
  errorsRed: 10,
};

// File names written by scripts/backup.js, with the time in UTC.
const BACKUP_FILE = /^smart_expense-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.dump$/;

export function rateBackup(at, now = new Date()) {
  if (!at) return 'red';
  const ageHours = (now - new Date(at)) / HOUR_MS;
  if (ageHours <= HEALTH_LIMITS.backupAmberHours) return 'green';
  return ageHours <= HEALTH_LIMITS.backupRedHours ? 'amber' : 'red';
}

export function rateDatabaseSize(bytes) {
  if (bytes >= HEALTH_LIMITS.databaseSizeRedBytes) return 'red';
  return bytes >= HEALTH_LIMITS.databaseSizeAmberBytes ? 'amber' : 'green';
}

export function rateErrors(count) {
  if (count >= HEALTH_LIMITS.errorsRed) return 'red';
  return count >= HEALTH_LIMITS.errorsAmber ? 'amber' : 'green';
}

// The newest complete backup in backupDir, or null when there is none. Files
// left by an interrupted backup end in .partial and are skipped.
export async function findLastBackup(backupDir = config.backupDir) {
  let names;
  try {
    names = await fs.readdir(backupDir);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }

  const newest = names.filter((name) => BACKUP_FILE.test(name)).sort().at(-1);
  if (!newest) return null;

  const [, year, month, day, hour, minute, second] = newest.match(BACKUP_FILE).map(Number);
  return {
    file: newest,
    at: new Date(Date.UTC(year, month - 1, day, hour, minute, second)).toISOString(),
  };
}

// A check that throws shows as red instead of failing the whole screen.
async function check(name, fn) {
  try {
    return await fn();
  } catch (err) {
    logger.error('Health check failed', { check: name, error: err.message });
    return { state: 'red', error: 'Could not be checked' };
  }
}

async function checkDatabase() {
  const started = performance.now();
  await query('SELECT 1');
  const responseMs = Math.round(performance.now() - started);
  return {
    state: responseMs > HEALTH_LIMITS.slowDatabaseMs ? 'amber' : 'green',
    response_ms: responseMs,
  };
}

async function checkMigrations() {
  const available = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
  const { rows } = await query('SELECT name FROM schema_migrations ORDER BY name');
  const applied = new Set(rows.map((row) => row.name));
  const pending = available.filter((file) => !applied.has(file));

  return {
    state: pending.length > 0 ? 'amber' : 'green',
    applied: rows.length,
    latest: rows.at(-1)?.name ?? null,
    pending,
  };
}

async function checkDatabaseSize() {
  const { rows } = await query('SELECT pg_database_size(current_database())::bigint AS bytes');
  const bytes = Number(rows[0].bytes);
  return { state: rateDatabaseSize(bytes), bytes };
}

async function checkLastBackup(backupDir, now) {
  const backup = await findLastBackup(backupDir);
  return { state: rateBackup(backup?.at, now), at: backup?.at ?? null };
}

function checkErrors(now) {
  const count = errorsInLastDay(now.getTime());
  const startedAt = now.getTime() - process.uptime() * 1000;
  return {
    state: rateErrors(count),
    count,
    // The count lives in memory, so after a restart it covers less than a day.
    since: new Date(Math.max(startedAt, now.getTime() - 24 * HOUR_MS)).toISOString(),
  };
}

export async function getSystemHealth({ now = new Date(), backupDir = config.backupDir } = {}) {
  const [database, migrations, databaseSize, lastBackup] = await Promise.all([
    check('database', checkDatabase),
    check('migrations', checkMigrations),
    check('database_size', checkDatabaseSize),
    check('last_backup', () => checkLastBackup(backupDir, now)),
  ]);

  const items = {
    // Answering this request is the proof that the API is up.
    api: { state: 'green', version, uptime_seconds: Math.floor(process.uptime()) },
    database,
    migrations,
    database_size: databaseSize,
    last_backup: lastBackup,
    errors: checkErrors(now),
  };

  const overall = Object.values(items)
    .map((item) => item.state)
    .reduce((worst, state) => (STATE_ORDER.indexOf(state) > STATE_ORDER.indexOf(worst) ? state : worst));

  return { checked_at: now.toISOString(), overall, items };
}
