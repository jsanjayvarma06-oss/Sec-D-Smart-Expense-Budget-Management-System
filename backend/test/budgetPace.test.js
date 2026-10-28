// Budget pace (#94): projected run-out date for each budget in the current month.
// Every case pins "today" so the results don't depend on when the tests run.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { createBudget, getRemainingBudget } from '../src/services/budgetService.js';
import { createExpense } from '../src/services/expenseService.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();

const MONTH = '2026-10';

async function setup({ budget, spending }) {
  const user = await createUser();
  const { rows } = await query(
    `INSERT INTO categories (user_id, name) VALUES ($1, 'Pace test') RETURNING id`, [user.id],
  );
  await createBudget(user.id, { month: MONTH, amount: budget });
  for (const [day, amount] of spending) {
    await createExpense(user.id, { amount, category_id: rows[0].id, spent_on: `${MONTH}-${day}` });
  }
  return user;
}

describe('budget pace (#94)', () => {
  test('spending faster than the budget allows gives the run-out date and days early', async () => {
    // 6,000 spent in 10 days = 600 a day; 4,000 left lasts 7 more days → 17 Oct, 14 days before 31 Oct.
    const user = await setup({ budget: 10000, spending: [['03', 2500], ['08', 3500]] });
    const [overall] = await getRemainingBudget(user.id, MONTH, '2026-10-10');
    assert.equal(overall.pace_status, 'early');
    assert.equal(overall.daily_pace, 600);
    assert.equal(overall.projected_run_out, '2026-10-17');
    assert.equal(overall.days_early, 14);
  });

  test('spending slowly enough is on track, with no run-out date', async () => {
    // 2,000 in 20 days = 100 a day; 8,000 left lasts 80 more days.
    const user = await setup({ budget: 10000, spending: [['05', 2000]] });
    const [overall] = await getRemainingBudget(user.id, MONTH, '2026-10-20');
    assert.equal(overall.pace_status, 'on_track');
    assert.equal(overall.projected_run_out, null);
    assert.equal(overall.days_early, null);
  });

  test('a pace that lasts exactly to the last day is on track', async () => {
    // 3,000 in 15 days = 200 a day; 3,200 left lasts 16 more days, to the end of 31 Oct.
    const user = await setup({ budget: 6200, spending: [['02', 3000]] });
    const [overall] = await getRemainingBudget(user.id, MONTH, '2026-10-15');
    assert.equal(overall.pace_status, 'on_track');
    assert.equal(overall.projected_run_out, null);
  });

  test('running out one day before the end is early by 1 day', async () => {
    // 3,000 in 15 days = 200 a day; 3,000 left lasts 15 more days → 30 Oct.
    const user = await setup({ budget: 6000, spending: [['02', 3000]] });
    const [overall] = await getRemainingBudget(user.id, MONTH, '2026-10-15');
    assert.equal(overall.pace_status, 'early');
    assert.equal(overall.projected_run_out, '2026-10-30');
    assert.equal(overall.days_early, 1);
  });

  test('a budget already used up is reported as exceeded', async () => {
    const user = await setup({ budget: 1000, spending: [['04', 1200]] });
    const [overall] = await getRemainingBudget(user.id, MONTH, '2026-10-12');
    assert.equal(overall.pace_status, 'exceeded');
    assert.equal(overall.projected_run_out, null);
  });

  test('the first two days of the month are too early to project', async () => {
    const user = await setup({ budget: 10000, spending: [['01', 4000]] });
    const [overall] = await getRemainingBudget(user.id, MONTH, '2026-10-02');
    assert.equal(overall.pace_status, 'not_enough_data');
    assert.equal(overall.projected_run_out, null);
  });

  test('no spending yet is on track', async () => {
    const user = await setup({ budget: 10000, spending: [] });
    const [overall] = await getRemainingBudget(user.id, MONTH, '2026-10-15');
    assert.equal(overall.pace_status, 'on_track');
    assert.equal(overall.daily_pace, null);
  });

  test('past and future months get no projection', async () => {
    const user = await setup({ budget: 10000, spending: [['05', 9000]] });
    for (const today of ['2026-11-05', '2026-09-20']) {
      const [overall] = await getRemainingBudget(user.id, MONTH, today);
      assert.equal(overall.pace_status, null);
      assert.equal(overall.projected_run_out, null);
    }
  });

  test('category budgets are projected from their own spending', async () => {
    const user = await setup({ budget: 10000, spending: [['03', 900]] });
    const { rows: [food] } = await query(`SELECT id FROM categories WHERE user_id = $1`, [user.id]);
    await createBudget(user.id, { month: MONTH, category_id: food.id, amount: 1200 });
    const rows = await getRemainingBudget(user.id, MONTH, '2026-10-09');
    const category = rows.find((r) => r.category_id === food.id);
    // 900 in 9 days = 100 a day; 300 left lasts 3 more days → 12 Oct.
    assert.equal(category.pace_status, 'early');
    assert.equal(category.projected_run_out, '2026-10-12');
    assert.equal(category.days_early, 19);
  });

  test('the API returns the pace fields with the remaining budget', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const month = new Date().toISOString().slice(0, 7);
    await createBudget(user.id, { month, amount: 5000 });
    const res = await request(createApp()).get(`/api/budgets/remaining?month=${month}`).set('Cookie', cookie).expect(200);
    const [overall] = res.body.remainingBudgets;
    for (const key of ['pace_status', 'daily_pace', 'projected_run_out', 'days_early']) {
      assert.ok(key in overall, `missing ${key}`);
    }
  });
});
