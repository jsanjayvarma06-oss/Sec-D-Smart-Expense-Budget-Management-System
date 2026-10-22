// Restores a backup made by backup.js (NFR10).
//
//   npm run db:restore -w backend -- backups/smart_expense-<timestamp>.dump --yes
//
// Restores into the database in DATABASE_URL, replacing what is there. It runs
// as a single transaction, so if anything fails the database is left exactly as
// it was. --yes is required because the current data is overwritten.

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import pg from 'pg';

const run = promisify(execFile);
const databaseUrl = process.env.DATABASE_URL;

async function ensureAppRole(client) {
  // The row-level security grants refer to app_user, which lives at the server
  // level and is not part of a database backup.
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user NOLOGIN;
      END IF;
    END
    $$`);
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((arg) => !arg.startsWith('--'));
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');
  if (!file) throw new Error('Usage: npm run db:restore -w backend -- <backup file> --yes');
  await fs.access(file);

  const target = new URL(databaseUrl);
  const targetName = `${target.pathname.slice(1)} on ${target.hostname}:${target.port || 5432}`;
  if (!args.includes('--yes')) {
    console.log(`This replaces all data in ${targetName} with ${file}.`);
    console.log('Run again with --yes to continue.');
    process.exitCode = 1;
    return;
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await ensureAppRole(client);
  } finally {
    await client.end();
  }

  await run('pg_restore', [
    '--clean',
    '--if-exists',
    '--no-owner',
    '--single-transaction',
    '--exit-on-error',
    `--dbname=${databaseUrl}`,
    file,
  ]);

  const check = new pg.Client({ connectionString: databaseUrl });
  await check.connect();
  try {
    const { rows } = await check.query(`
      SELECT 'users' AS table_name, count(*)::int AS rows FROM users
      UNION ALL SELECT 'income', count(*)::int FROM income
      UNION ALL SELECT 'expenses', count(*)::int FROM expenses
      UNION ALL SELECT 'budgets', count(*)::int FROM budgets
      UNION ALL SELECT 'savings_goals', count(*)::int FROM savings_goals
      UNION ALL SELECT 'recurring_expenses', count(*)::int FROM recurring_expenses`);
    console.log(`Restored ${file} into ${targetName}`);
    console.table(rows);
  } finally {
    await check.end();
  }
}

main().catch((err) => {
  console.error(`Restore failed: ${err.stderr?.trim() || err.message}`.replaceAll(databaseUrl ?? '', '<DATABASE_URL>'));
  process.exitCode = 1;
});
