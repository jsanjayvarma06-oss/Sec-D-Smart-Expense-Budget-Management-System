
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import {
  createUser,
  loginAs,
  monthsAgo,
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

    await createExpense(user.id, categoryId, 100, monthsAgo(2));

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

    // The three complete months before the current one.
    await createExpense(user.id, categoryId, 100, monthsAgo(3));
    await createExpense(user.id, categoryId, 200, monthsAgo(2));
    await createExpense(user.id, categoryId, 300, monthsAgo(1));

    const response = await request(app)
      .get('/api/forecast/monthly')
      .set('Cookie', cookie)
      .expect(200);

    assert.equal(response.body.forecast.available, true);
    assert.equal(response.body.forecast.monthsOfHistory, 3);
    assert.equal(response.body.forecast.forecast, 200);
    assert.equal(response.body.forecast.monthlyTotals.length, 3);
  });

  test('does not count the current month, which is not complete', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const categoryId = await createCategory(user.id);

    await createExpense(user.id, categoryId, 100, monthsAgo(3));
    await createExpense(user.id, categoryId, 100, monthsAgo(2));
    await createExpense(user.id, categoryId, 100, monthsAgo(1));
    await createExpense(user.id, categoryId, 9000, monthsAgo(0, 1));

    const response = await request(app)
      .get('/api/forecast/monthly')
      .set('Cookie', cookie)
      .expect(200);

    assert.equal(response.body.forecast.forecast, 100);
    assert.equal(response.body.forecast.monthsOfHistory, 3);
  });

  test('ignores spending older than three months', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const categoryId = await createCategory(user.id);

    await createExpense(user.id, categoryId, 5000, monthsAgo(4));
    await createExpense(user.id, categoryId, 100, monthsAgo(3));
    await createExpense(user.id, categoryId, 100, monthsAgo(2));
    await createExpense(user.id, categoryId, 100, monthsAgo(1));

    const response = await request(app)
      .get('/api/forecast/monthly')
      .set('Cookie', cookie)
      .expect(200);

    assert.equal(response.body.forecast.forecast, 100);
    assert.equal(response.body.forecast.monthlyTotals.length, 3);
  });

  test('a month with no spending leaves too little history', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const categoryId = await createCategory(user.id);

    await createExpense(user.id, categoryId, 100, monthsAgo(3));
    await createExpense(user.id, categoryId, 300, monthsAgo(1));

    const response = await request(app)
      .get('/api/forecast/monthly')
      .set('Cookie', cookie)
      .expect(200);

    assert.equal(response.body.forecast.available, false);
    assert.equal(response.body.forecast.monthsOfHistory, 2);
    assert.equal(
      response.body.forecast.reason,
      'At least 3 months of spending history are required',
    );
  });

  test('adds up several expenses within a month and rounds to the paisa', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const categoryId = await createCategory(user.id);

    await createExpense(user.id, categoryId, 10.01, monthsAgo(3, 2));
    await createExpense(user.id, categoryId, 20.02, monthsAgo(3, 20));
    await createExpense(user.id, categoryId, 40, monthsAgo(2));
    await createExpense(user.id, categoryId, 50, monthsAgo(1));

    const response = await request(app)
      .get('/api/forecast/monthly')
      .set('Cookie', cookie)
      .expect(200);

    // (30.03 + 40 + 50) / 3 = 40.01
    assert.equal(response.body.forecast.forecast, 40.01);
  });

  test('uses only the logged-in user\'s spending', async () => {
    const other = await createUser('other@test.com');
    const otherCategory = await createCategory(other.id);
    await createExpense(other.id, otherCategory, 900, monthsAgo(3));
    await createExpense(other.id, otherCategory, 900, monthsAgo(2));
    await createExpense(other.id, otherCategory, 900, monthsAgo(1));

    const user = await createUser('me@test.com');
    const cookie = await loginAs(user);

    const response = await request(app)
      .get('/api/forecast/monthly')
      .set('Cookie', cookie)
      .expect(200);

    assert.equal(response.body.forecast.available, false);
    assert.equal(response.body.forecast.monthsOfHistory, 0);
  });
});
