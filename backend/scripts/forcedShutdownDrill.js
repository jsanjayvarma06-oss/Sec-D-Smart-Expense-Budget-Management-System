// Forced-shutdown drill for NFR10: "after a forced shutdown, all committed
// records are still present on restart."
//
// It commits 100 expenses, leaves 10 more in an open transaction, then stops
// PostgreSQL the way a power cut would (no clean shutdown, no checkpoint),
// starts it again and checks that exactly the committed records came back.
//
//   PG_CRASH_CMD='pg_ctl -D /path/to/data stop -m immediate' \
//   PG_START_CMD='pg_ctl -D /path/to/data -l /tmp/pg.log start' \
//   npm run db:crash-drill -w backend -- --yes
//
// With Docker: PG_CRASH_CMD='docker kill <container>' and
// PG_START_CMD='docker start <container>'.
//
// This really stops the database server, so every app using it is cut off for
// a few seconds. Run it on a local or staging server, never production. The
// drill's own user and records are deleted at the end.

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';

const sh = promisify(exec);
const databaseUrl = process.env.DATABASE_URL;
const crashCommand = process.env.PG_CRASH_CMD;
const startCommand = process.env.PG_START_CMD;

const COMMITTED = 100;
const UNCOMMITTED = 10;
const EXPECTED_TOTAL = ((COMMITTED * (COMMITTED + 1)) / 2).toFixed(2); // 1 + 2 + ... + 100

async function connect() {
  const client = new pg.Client({ connectionString: databaseUrl });
  client.on('error', () => {});
  await client.connect();
  return client;
}

async function waitForDatabase(timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const client = await connect();
      await client.query('SELECT 1');
      await client.end();
      return Date.now() - started;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error('Database did not come back within 60 seconds');
}

async function main() {
  if (!databaseUrl || !crashCommand || !startCommand) {
    throw new Error('Set DATABASE_URL, PG_CRASH_CMD and PG_START_CMD (see the top of this file)');
  }
  if (!process.argv.includes('--yes')) {
    console.log('This stops the PostgreSQL server abruptly. Run again with --yes to continue.');
    process.exitCode = 1;
    return;
  }

  const email = `crash-drill-${Date.now()}@example.test`;
  const setup = await connect();
  let userId;
  try {
    await setup.query('BEGIN');
    ({
      rows: [{ id: userId }],
    } = await setup.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ('Crash drill', $1, 'drill') RETURNING id`,
      [email],
    ));
    const {
      rows: [{ id: categoryId }],
    } = await setup.query(
      `INSERT INTO categories (user_id, name) VALUES ($1, 'Drill') RETURNING id`,
      [userId],
    );
    await setup.query(
      `INSERT INTO expenses (user_id, category_id, amount, spent_on, note)
       SELECT $1, $2, n, CURRENT_DATE, 'committed' FROM generate_series(1, $3) AS n`,
      [userId, categoryId, COMMITTED],
    );
    await setup.query('COMMIT');
    console.log(`Committed ${COMMITTED} expenses (total ${EXPECTED_TOTAL})`);

    await setup.query('BEGIN');
    await setup.query(
      `INSERT INTO expenses (user_id, category_id, amount, spent_on, note)
       SELECT $1, $2, 1, CURRENT_DATE, 'uncommitted' FROM generate_series(1, $3)`,
      [userId, categoryId, UNCOMMITTED],
    );
    console.log(`Left ${UNCOMMITTED} more expenses in an open transaction`);

    console.log('Forcing PostgreSQL down…');
    await sh(crashCommand);
  } finally {
    await setup.end().catch(() => {});
  }

  console.log('Starting PostgreSQL again…');
  await sh(startCommand);
  const recoveryMs = await waitForDatabase();
  console.log(`Database accepting connections after ${(recoveryMs / 1000).toFixed(1)} s`);

  const check = await connect();
  try {
    const {
      rows: [result],
    } = await check.query(
      `SELECT count(*) FILTER (WHERE note = 'committed')::int AS committed,
              coalesce(sum(amount) FILTER (WHERE note = 'committed'), 0)::numeric(12, 2)::text AS total,
              count(*) FILTER (WHERE note = 'uncommitted')::int AS uncommitted
       FROM expenses WHERE user_id = $1`,
      [userId],
    );
    console.table([result]);

    const passed =
      result.committed === COMMITTED && result.total === EXPECTED_TOTAL && result.uncommitted === 0;
    await check.query('DELETE FROM users WHERE id = $1', [userId]);

    if (passed) {
      console.log('PASS: every committed record survived; uncommitted work was discarded.');
    } else {
      console.log('FAIL: records after restart do not match what was committed.');
      process.exitCode = 1;
    }
  } finally {
    await check.end();
  }
}

main().catch((err) => {
  console.error(`Drill failed: ${err.message}`.replaceAll(databaseUrl ?? '', '<DATABASE_URL>'));
  process.exitCode = 1;
});
