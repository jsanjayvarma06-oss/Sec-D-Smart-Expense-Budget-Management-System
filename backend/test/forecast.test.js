
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

async function createExpense(userId, categoryId, amount, date) {
  await query(
    `INSERT INTO expenses (user_id, category_id, amount, spent_on)
     VALUES ($1, $2, $3, $4::date)`,
    [userId, categoryId, amount, date],
  );
}


async function createCategory(userId) {
  const { rows } = await query(
    `INSERT INTO categories (user_id, name)
     VALUES ($1, $2)
     RETURNING id`,
    [userId, 'Forecast Test Category'],
  );

  return rows[0].id;
}

describe('Monthly spending forecast API', () => {
  test('requires authentication', async () => {
    await request(app)
      .get('/api/forecast/monthly')
      .expect(401);
  });

  test('reports unavailable when fewer than three months have spending', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const categoryId = await createCategory(user.id);

    await createExpense(user.id, categoryId, 100, '2026-08-10');

    const response = await request(app)
      .get('/api/forecast/monthly')
      .set('Cookie', cookie)
      .expect(200);

    assert.equal(response.body.forecast.available, false);
    assert.equal(response.body.forecast.forecast, null);
  });

  test('calculates the average of three months of spending', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const categoryId = await createCategory(user.id);

    // These dates represent the three complete months before October 2026.
    await createExpense(user.id, categoryId, 100, '2026-07-10');
    await createExpense(user.id, categoryId, 200, '2026-08-10');
    await createExpense(user.id, categoryId, 300, '2026-09-10');

    const response = await request(app)
      .get('/api/forecast/monthly')
      .set('Cookie', cookie)
      .expect(200);

    assert.equal(response.body.forecast.available, true);
    assert.equal(response.body.forecast.monthsOfHistory, 3);
    assert.equal(response.body.forecast.forecast, 200);
    assert.equal(response.body.forecast.monthlyTotals.length, 3);
  });
});
