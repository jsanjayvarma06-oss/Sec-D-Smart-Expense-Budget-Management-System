// Per-user data isolation (SR04) and the ID-tampering test (ST_02).
//
// The database tests run queries through withUser exactly as services will, and
// some deliberately leave out "WHERE user_id = ..." to prove the row-level
// security policies still keep other users' rows out of reach.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { pool, query } from '../src/db/pool.js';
import { withUser } from '../src/db/userScope.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { requireAuthByDefault } from '../src/middleware/requireAuth.js';
import { validateIdParam } from '../src/middleware/validateIdParam.js';
import { HttpError } from '../src/utils/httpError.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();

async function userWithSession(email, name) {
  const user = await createUser(email, name);
  return { user, cookie: await loginAs(user) };
}

let user1;
let user2;
let foodCategoryId;

// Inserts as the connecting (owner) role, which row-level security does not
// restrict, to set up each user's records the way a seed script would.
async function insertExpense(userId, amount) {
  const { rows } = await query(
    `INSERT INTO expenses (user_id, category_id, amount, spent_on, note)
     VALUES ($1, $2, $3, CURRENT_DATE, 'test') RETURNING id`,
    [userId, foodCategoryId, amount],
  );
  return rows[0].id;
}

beforeEach(async () => {
  user1 = await userWithSession('user1@test.com', 'User One');
  user2 = await userWithSession('user2@test.com', 'User Two');
  // A built-in category (user_id NULL). Default categories are seeded by the
  // category management item, so the test creates the one it needs.
  await query(`INSERT INTO categories (name) VALUES ('Food') ON CONFLICT DO NOTHING`);
  const { rows } = await query(`SELECT id FROM categories WHERE name = 'Food' AND user_id IS NULL`);
  foodCategoryId = rows[0].id;
});

describe('row-level security in the database', () => {
  test('a query with no user filter only returns the logged-in user’s rows', async () => {
    await insertExpense(user1.user.id, 450);
    await insertExpense(user2.user.id, 9000);

    const rows = await withUser(user1.user.id, async (db) => {
      const result = await db.query('SELECT user_id, amount FROM expenses');
      return result.rows;
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, user1.user.id);
    assert.equal(rows[0].amount, '450.00');
  });

  test('reading another user’s record by ID returns nothing', async () => {
    const otherId = await insertExpense(user2.user.id, 9000);
    const rows = await withUser(user1.user.id, async (db) => {
      const result = await db.query('SELECT * FROM expenses WHERE id = $1', [otherId]);
      return result.rows;
    });
    assert.equal(rows.length, 0);
  });

  test('updating or deleting another user’s record changes nothing', async () => {
    const otherId = await insertExpense(user2.user.id, 9000);

    const { updated, deleted } = await withUser(user1.user.id, async (db) => {
      const update = await db.query('UPDATE expenses SET amount = 1 WHERE id = $1', [otherId]);
      const remove = await db.query('DELETE FROM expenses WHERE id = $1', [otherId]);
      return { updated: update.rowCount, deleted: remove.rowCount };
    });

    assert.equal(updated, 0);
    assert.equal(deleted, 0);
    const { rows } = await query('SELECT amount FROM expenses WHERE id = $1', [otherId]);
    assert.equal(rows[0].amount, '9000.00');
  });

  test('creating a record for another user is refused', async () => {
    await assert.rejects(
      withUser(user1.user.id, (db) =>
        db.query(
          `INSERT INTO expenses (user_id, category_id, amount, spent_on)
           VALUES ($1, $2, 100, CURRENT_DATE)`,
          [user2.user.id, foodCategoryId],
        ),
      ),
      /row-level security/,
    );
  });

  test('handing your own record over to another user is refused', async () => {
    const ownId = await insertExpense(user1.user.id, 450);
    await assert.rejects(
      withUser(user1.user.id, (db) =>
        db.query('UPDATE expenses SET user_id = $1 WHERE id = $2', [user2.user.id, ownId]),
      ),
      /row-level security/,
    );
  });

  test('with no user set, nothing is visible (fails closed)', async () => {
    await insertExpense(user1.user.id, 450);
    await assert.rejects(withUser(undefined, async () => {}), /logged-in user ID/);

    // Simulate a service that switches role but forgets to set app.user_id.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE app_user');
      const result = await client.query('SELECT count(*)::int AS n FROM expenses');
      assert.equal(result.rows[0].n, 0);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  test('users see default categories and their own, but cannot edit defaults', async () => {
    await query(`INSERT INTO categories (user_id, name) VALUES ($1, 'Gym')`, [user1.user.id]);
    await query(`INSERT INTO categories (user_id, name) VALUES ($1, 'Pets')`, [user2.user.id]);

    const { names, defaultUpdates } = await withUser(user1.user.id, async (db) => {
      const visible = await db.query('SELECT name FROM categories ORDER BY name');
      const update = await db.query(`UPDATE categories SET name = 'Hacked' WHERE user_id IS NULL`);
      return { names: visible.rows.map((row) => row.name), defaultUpdates: update.rowCount };
    });

    assert.ok(names.includes('Food'), 'default categories are visible');
    assert.ok(names.includes('Gym'), 'own category is visible');
    assert.ok(!names.includes('Pets'), 'another user’s category is hidden');
    assert.equal(defaultUpdates, 0);
  });

  test('every table with a user_id column has row-level security forced on', async () => {
    // Guards future migrations: a new per-user table without RLS fails this test.
    const { rows } = await query(`
      SELECT c.relname AS table_name, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN information_schema.columns col
        ON col.table_schema = n.nspname AND col.table_name = c.relname
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND col.column_name = 'user_id'
        AND c.relname NOT IN ('sessions', 'password_reset_tokens', 'two_factor_backup_codes')  -- auth-only, used before login
    `);
    assert.ok(rows.length >= 7);
    for (const row of rows) {
      assert.ok(row.enabled && row.forced, `${row.table_name} must have RLS enabled and forced`);
    }
  });
});

describe('ID tampering through the API (ST_02)', () => {
  // A route written the way teammates will write theirs: the real auth
  // middleware, validateIdParam and withUser. The query deliberately has no
  // user_id filter, so only the isolation layer stands between user1 and user2.
  const router = express.Router();
  router.get('/expenses/:id', validateIdParam(), async (req, res, next) => {
    try {
      const expense = await withUser(req.user.id, async (db) => {
        const { rows } = await db.query('SELECT id, amount FROM expenses WHERE id = $1', [
          req.params.id,
        ]);
        return rows[0];
      });
      if (!expense) throw new HttpError(404, 'Not found');
      res.json({ expense });
    } catch (err) {
      next(err);
    }
  });

  const probe = express();
  probe.use(express.json());
  probe.use(cookieParser());
  probe.use('/api', requireAuthByDefault);
  probe.use('/api', router);
  probe.use(errorHandler);

  test('a user can open their own record', async () => {
    const ownId = await insertExpense(user1.user.id, 450);
    const res = await request(probe).get(`/api/expenses/${ownId}`).set('Cookie', user1.cookie);
    assert.equal(res.status, 200);
    assert.equal(res.body.expense.id, ownId);
  });

  test('changing the ID in the URL to another user’s record is refused', async () => {
    const otherId = await insertExpense(user2.user.id, 9000);
    const res = await request(probe).get(`/api/expenses/${otherId}`).set('Cookie', user1.cookie);
    assert.equal(res.status, 404);
    assert.equal(res.body.expense, undefined);
    assert.doesNotMatch(JSON.stringify(res.body), /9000/);
  });

  test('a malformed ID gets the same 404, so existence is never revealed', async () => {
    await request(probe).get('/api/expenses/1').set('Cookie', user1.cookie).expect(404);
    await request(probe)
      .get(`/api/expenses/1' OR '1'='1`)
      .set('Cookie', user1.cookie)
      .expect(404);
  });

  test('the same request with no session is refused before any query runs', async () => {
    const ownId = await insertExpense(user1.user.id, 450);
    await request(probe).get(`/api/expenses/${ownId}`).expect(401);
  });
});
