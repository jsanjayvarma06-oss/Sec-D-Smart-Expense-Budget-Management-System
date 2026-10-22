// Recoverability (NFR10, test plan ST_06): committed records survive the API
// being killed, and work that was never committed leaves nothing behind.
// backend/scripts/forcedShutdownDrill.js covers PostgreSQL itself crashing.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { pool, query } from '../src/db/pool.js';
import { withUser } from '../src/db/userScope.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();

const serverPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/server.js');
const running = new Set();

after(() => {
  for (const child of running) child.kill('SIGKILL');
});

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function startServer(port) {
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  running.add(child);
  child.on('exit', () => running.delete(child));

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/api/health`);
      if (res.ok) return child;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill('SIGKILL');
  throw new Error('API did not start within 10 seconds');
}

function killHard(child) {
  return new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill('SIGKILL');
  });
}

async function addExpenses(userId, amounts) {
  const { rows } = await query(
    `INSERT INTO categories (user_id, name) VALUES ($1, 'Food') RETURNING id`,
    [userId],
  );
  await withUser(userId, async (db) => {
    for (const amount of amounts) {
      await db.query(
        `INSERT INTO expenses (user_id, category_id, amount, spent_on)
         VALUES ($1, $2, $3, CURRENT_DATE)`,
        [userId, rows[0].id, amount],
      );
    }
  });
  return rows[0].id;
}

async function expenseTotals(userId) {
  const { rows } = await query(
    `SELECT count(*)::int AS count, coalesce(sum(amount), 0)::text AS total
     FROM expenses WHERE user_id = $1`,
    [userId],
  );
  return rows[0];
}

describe('recoverability (NFR10)', () => {
  test('PostgreSQL is configured to make every commit durable', async () => {
    for (const setting of ['fsync', 'synchronous_commit', 'full_page_writes']) {
      const { rows } = await query(`SHOW ${setting}`);
      assert.equal(rows[0][setting], 'on', `${setting} must be on`);
    }
  });

  test('ST_06 records and sessions survive the API being killed and restarted', async () => {
    const user = await createUser();
    await addExpenses(user.id, [500, 1200, 800, 350, 2150]);
    const before = await expenseTotals(user.id);
    const cookie = await loginAs(user);
    const port = await freePort();

    let server = await startServer(port);
    const me = await fetch(`http://localhost:${port}/api/auth/me`, { headers: { Cookie: cookie } });
    assert.equal(me.status, 200);
    // That request made the API write last_seen_at; it must outlive the crash.
    const { rows: seen } = await query('SELECT last_seen_at FROM sessions');

    await killHard(server);
    server = await startServer(port);

    const { rows: seenAfter } = await query('SELECT last_seen_at FROM sessions');
    assert.deepEqual(seenAfter, seen, 'the session update written before the crash is kept');
    assert.deepEqual(await expenseTotals(user.id), before);
    assert.deepEqual(before, { count: 5, total: '5000.00' });

    const again = await fetch(`http://localhost:${port}/api/auth/me`, {
      headers: { Cookie: cookie },
    });
    assert.equal(again.status, 200, 'the user is still logged in after the restart');
    await killHard(server);
  });

  test('a failure part-way through a change saves none of it', async () => {
    const user = await createUser();
    const categoryId = await addExpenses(user.id, [100]);

    await assert.rejects(
      withUser(user.id, async (db) => {
        await db.query(
          `INSERT INTO expenses (user_id, category_id, amount, spent_on)
           VALUES ($1, $2, 999, CURRENT_DATE)`,
          [user.id, categoryId],
        );
        throw new Error('simulated failure after the first write');
      }),
      /simulated failure/,
    );

    assert.deepEqual(await expenseTotals(user.id), { count: 1, total: '100.00' });
  });

  test('a connection killed mid-transaction leaves no partial records', async () => {
    const user = await createUser();
    const categoryId = await addExpenses(user.id, [100, 200]);

    const victim = await pool.connect();
    victim.on('error', () => {});
    const { rows } = await victim.query('SELECT pg_backend_pid() AS pid');
    await victim.query('BEGIN');
    for (let i = 0; i < 3; i += 1) {
      await victim.query(
        `INSERT INTO expenses (user_id, category_id, amount, spent_on)
         VALUES ($1, $2, 50, CURRENT_DATE)`,
        [user.id, categoryId],
      );
    }

    // The server process holding the open transaction dies, as in a crash.
    await query('SELECT pg_terminate_backend($1)', [rows[0].pid]);
    victim.release(true);

    assert.deepEqual(await expenseTotals(user.id), { count: 2, total: '300.00' });
  });
});
