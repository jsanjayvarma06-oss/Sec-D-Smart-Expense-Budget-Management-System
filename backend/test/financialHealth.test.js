
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import {
  createUser,
  loginAs,
  useTestDatabase,
} from './helpers.js';

useTestDatabase();
const app = createApp();

describe('Financial health API', () => {
  test('requires authentication', async () => {
    await request(app)
      .get('/api/financial-health?month=2026-10')
      .expect(401);
  });

  test('rejects an invalid month', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    await request(app)
      .get('/api/financial-health?month=2026-13')
      .set('Cookie', cookie)
      .expect(400);
  });

  test('returns a score and explanation for a valid month', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const response = await request(app)
      .get('/api/financial-health?month=2026-10')
      .set('Cookie', cookie)
      .expect(200);

    assert.ok(response.body.health);
    assert.equal(response.body.health.month, '2026-10');
    assert.equal(typeof response.body.health.score, 'number');
    assert.ok(response.body.health.score >= 0);
    assert.ok(response.body.health.score <= 100);
    assert.equal(typeof response.body.health.rating, 'string');
    assert.ok(Array.isArray(response.body.health.explanation));
  });
});

describe('Financial health score (FR18)', () => {
  const MONTH = '2026-10';

  // Sets up one month for a new user and returns the health result.
  async function scoreFor({ income, spent, budget }, email) {
    const user = await createUser(email);
    const cookie = await loginAs(user);

    if (income) {
      await query(
        `INSERT INTO income (user_id, amount, source, received_on)
         VALUES ($1, $2, 'Salary', '2026-10-01')`,
        [user.id, income],
      );
    }

    if (spent) {
      const { rows } = await query(
        'SELECT id FROM categories WHERE user_id IS NULL LIMIT 1',
      );
      await query(
        `INSERT INTO expenses (user_id, category_id, amount, spent_on)
         VALUES ($1, $2, $3, '2026-10-05')`,
        [user.id, rows[0].id, spent],
      );
    }

    if (budget) {
      await query(
        `INSERT INTO budgets (user_id, month, amount)
         VALUES ($1, '2026-10-01', $2)`,
        [user.id, budget],
      );
    }

    const response = await request(app)
      .get(`/api/financial-health?month=${MONTH}`)
      .set('Cookie', cookie)
      .expect(200);

    return response.body.health;
  }

  test('exactly 20% saved earns the top savings points', async () => {
    // 5.05 - 4.04 = 1.01, which is exactly 20%; as a JavaScript division it
    // is 0.19999999999999996.
    const health = await scoreFor({ income: 5.05, spent: 4.04 });

    assert.equal(health.score, 80);
    assert.equal(health.rating, 'Excellent');
    assert.equal(health.savings, 1.01);
    assert.equal(health.savings_rate, 20);
    assert.ok(health.explanation.includes('You saved at least 20% of your income.'));
  });

  test('exactly 10% saved earns the middle savings points', async () => {
    const health = await scoreFor({ income: 5.1, spent: 4.59 });

    assert.equal(health.score, 70);
    assert.equal(health.rating, 'Good');
    assert.ok(health.explanation.includes('You saved 10–19.99% of your income.'));
  });

  test('one paisa under 20% saved falls into the next band', async () => {
    // Income 100.00, spent 80.01: saved 19.99%.
    const health = await scoreFor({ income: 100, spent: 80.01 });

    assert.equal(health.score, 70);
    assert.ok(health.explanation.includes('You saved 10–19.99% of your income.'));
  });

  test('spending exactly 80% of the budget counts as within 80%', async () => {
    // 4.48 / 5.60 is 0.8000000000000002 as a JavaScript division.
    const health = await scoreFor({ income: 100, spent: 4.48, budget: 5.6 });

    assert.equal(health.budget_usage_rate, 80);
    assert.ok(
      health.explanation.includes('Spending stayed within 80% of your overall budget.'),
    );
    assert.equal(health.score, 100);
  });

  test('spending exactly the whole budget is within budget, one paisa more is not', async () => {
    const onBudget = await scoreFor({ income: 100, spent: 10, budget: 10 }, 'a@test.com');
    assert.ok(
      onBudget.explanation.includes('Spending stayed within your overall budget.'),
    );
    assert.equal(onBudget.score, 90);

    const over = await scoreFor({ income: 100, spent: 10.01, budget: 10 }, 'b@test.com');
    assert.ok(over.explanation.includes('Spending exceeded your overall budget.'));
    assert.equal(over.score, 65);
  });

  test('a month with no income is explained and scored lower', async () => {
    const health = await scoreFor({ spent: 20 });

    assert.equal(health.score, 40);
    assert.equal(health.rating, 'Needs improvement');
    assert.equal(health.savings_rate, null);
    assert.ok(health.explanation.includes('No income was recorded for this month.'));
    assert.ok(
      health.explanation.includes(
        'No overall budget was set, so budget performance was not scored.',
      ),
    );
  });

  test('spending more than the income lowers the score and says why', async () => {
    const health = await scoreFor({ income: 100, spent: 150 });

    assert.equal(health.score, 25);
    assert.equal(health.savings, -50);
    assert.ok(
      health.explanation.includes('Your expenses equalled or exceeded your income.'),
    );
  });

  test('counts only the logged-in user\'s own money', async () => {
    await scoreFor({ income: 5000, spent: 10 }, 'other@test.com');
    const mine = await scoreFor({ spent: 20 }, 'me@test.com');

    assert.equal(mine.total_income, 0);
    assert.equal(mine.total_expenses, 20);
  });
});
