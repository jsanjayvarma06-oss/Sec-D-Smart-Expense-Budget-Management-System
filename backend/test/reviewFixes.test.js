// Fixes for the issues found when reviewing #3: #70 to #74.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { createBudget, getRemainingBudget } from '../src/services/budgetService.js';
import { createExpense } from '../src/services/expenseService.js';
import {
  MAX_CYCLES_PER_RUN,
  generateDueRecurringExpenses,
} from '../src/services/recurringExpenseService.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();

const app = createApp({ loginRateLimit: 1000 });
const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const thisMonth = day(0).slice(0, 7);

async function ownCategory(userId, name = 'Fix test category') {
  const { rows } = await query(
    `INSERT INTO categories (user_id, name) VALUES ($1, $2) RETURNING id`,
    [userId, name],
  );
  return rows[0].id;
}

function withinSeconds(promise, seconds) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`did not finish within ${seconds}s`)), seconds * 1000);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

describe('#70 concurrent expense creation', () => {
  test('15 expenses created at once all succeed and the API still answers', async () => {
    const user = await createUser();
    const categoryId = await ownCategory(user.id);
    // Five earlier expenses so every create runs the full unusual-spending check.
    for (let i = 0; i < 5; i += 1) {
      await createExpense(user.id, { amount: 200, category_id: categoryId, spent_on: day(-1) });
    }

    const creates = Array.from({ length: 15 }, () =>
      createExpense(user.id, { amount: 250, category_id: categoryId, spent_on: day(0) }));
    const results = await withinSeconds(Promise.allSettled(creates), 15);

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 15);
    await request(app).get('/api/health').expect(200);
  });

  test('a busy pool gets a 503 instead of waiting forever', () => {
    let status;
    let body;
    const res = { status(code) { status = code; return this; }, json(data) { body = data; } };
    errorHandler(new Error('timeout exceeded when trying to connect'), { method: 'GET', originalUrl: '/api/x' }, res);
    assert.equal(status, 503);
    assert.match(body.error, /busy/);
  });
});

describe('#71 recurring generation uses a real date and is capped', () => {
  test('a "today" far from the real date is refused', async () => {
    const cookie = await loginAs(await createUser());
    for (const today of [day(400), day(-30)]) {
      const res = await request(app).post('/api/recurring-expenses/generate-due')
        .set('Cookie', cookie).send({ today }).expect(400);
      assert.equal(res.body.code, 'INVALID_TODAY');
    }
    await request(app).post('/api/notifications/payment-reminders')
      .set('Cookie', cookie).send({ today: day(400) }).expect(400);
    await request(app).post('/api/recurring-expenses/generate-due')
      .set('Cookie', cookie).send({ today: day(0) }).expect(200);
  });

  test('a first due date years away is refused', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const categoryId = await ownCategory(user.id);
    for (const start of [day(-800), day(800)]) {
      await request(app).post('/api/recurring-expenses').set('Cookie', cookie)
        .send({ category_id: categoryId, amount: 100, cycle: 'weekly', start_date: start })
        .expect(400);
    }
  });

  test('one run creates at most the cap, never in the future, and the next run continues', async () => {
    const user = await createUser();
    const categoryId = await ownCategory(user.id);
    await query(
      `INSERT INTO recurring_expenses (user_id, category_id, amount, cycle, start_date, next_due_date)
       VALUES ($1, $2, 99, 'weekly', $3::date, $3::date)`,
      [user.id, categoryId, day(-7 * 100)],
    );

    const first = await generateDueRecurringExpenses(user.id, day(0));
    assert.equal(first.length, MAX_CYCLES_PER_RUN);
    assert.ok(first.every((e) => e.spent_on <= day(0)));

    const second = await generateDueRecurringExpenses(user.id, day(0));
    assert.equal(first.length + second.length, 101);
    const { rows } = await query(
      `SELECT count(*)::int AS n, max(spent_on)::text AS latest FROM expenses WHERE user_id = $1`,
      [user.id],
    );
    assert.equal(rows[0].n, 101);
    assert.ok(rows[0].latest <= day(0));
  });
});

describe('#72 login timing', () => {
  test('an unknown email takes as long to reject as a wrong password', async () => {
    await request(app).post('/api/auth/register')
      .send({ name: 'Timing User', email: 'timing@test.com', password: 'Test@1234' })
      .expect(201);

    const timeLogin = async (email) => {
      const started = process.hrtime.bigint();
      await request(app).post('/api/auth/login').send({ email, password: 'Wrong@999' }).expect(401);
      return Number(process.hrtime.bigint() - started) / 1e6;
    };

    const known = [];
    const unknown = [];
    for (let i = 0; i < 3; i += 1) {
      known.push(await timeLogin('timing@test.com'));
      unknown.push(await timeLogin(`nobody${i}@test.com`));
    }
    // Before the fix an unknown email returned in a few ms against ~200 ms for
    // a bcrypt check; now both run bcrypt.
    assert.ok(
      Math.min(...unknown) > Math.min(...known) * 0.5,
      `unknown ${unknown.map(Math.round)} ms vs known ${known.map(Math.round)} ms`,
    );
  });
});

describe('#73 deleting a category that is in use', () => {
  test('returns 409 and keeps the category; an unused one deletes', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const used = await ownCategory(user.id, 'Used category');
    const unused = await ownCategory(user.id, 'Unused category');
    await createExpense(user.id, { amount: 50, category_id: used, spent_on: day(0) });

    const res = await request(app).delete(`/api/categories/${used}`).set('Cookie', cookie).expect(409);
    assert.equal(res.body.code, 'CATEGORY_IN_USE');
    const { rows } = await query('SELECT count(*)::int AS n FROM categories WHERE id = $1', [used]);
    assert.equal(rows[0].n, 1);

    await request(app).delete(`/api/categories/${unused}`).set('Cookie', cookie).expect(204);
  });
});

describe('#74 exact budget arithmetic', () => {
  test('category budgets adding up to exactly the monthly budget are accepted', async () => {
    const user = await createUser();
    const food = await ownCategory(user.id, 'Food budget');
    const travel = await ownCategory(user.id, 'Travel budget');

    assert.ok((await createBudget(user.id, { month: thisMonth, amount: 1000.3 })).budget);
    assert.ok((await createBudget(user.id, { month: thisMonth, category_id: food, amount: 1000.1 })).budget);
    // In floating point 1000.1 + 0.2 = 1000.3000000000001, which used to be rejected.
    const second = await createBudget(user.id, { month: thisMonth, category_id: travel, amount: 0.2 });
    assert.ok(second.budget, `expected to fit, got ${JSON.stringify(second)}`);

    const over = await createBudget(user.id, { month: thisMonth, category_id: travel, amount: 0.21 });
    assert.equal(over.error, 'CATEGORY_BUDGETS_EXCEED_OVERALL');
  });

  test('the remaining budget comes back exact', async () => {
    const user = await createUser();
    const categoryId = await ownCategory(user.id);
    await createBudget(user.id, { month: thisMonth, amount: 1000 });
    await createExpense(user.id, { amount: 599.8, category_id: categoryId, spent_on: day(0) });

    const [overall] = await getRemainingBudget(user.id, thisMonth);
    // 1000 - 599.8 in floating point is 400.20000000000005.
    assert.equal(overall.remaining_amount, 400.2);
    assert.equal(overall.spent_amount, 599.8);
    assert.equal(overall.exceeded, false);
  });
});
