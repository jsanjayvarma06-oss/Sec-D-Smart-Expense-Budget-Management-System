
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';
import { AnalyticsService, IAnalyticsService } from '../src/services/analyticsService.js';

useTestDatabase();

const app = createApp();

describe('Monthly analytics API', () => {
  test('requires authentication', async () => {
    await request(app)
      .get('/api/analytics/monthly?month=2026-10')
      .expect(401);
  });

  test('rejects an invalid month', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    await request(app)
      .get('/api/analytics/monthly?month=2026-13')
      .set('Cookie', cookie)
      .expect(400);
  });

  test('returns monthly analytics for the authenticated user', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const response = await request(app)
      .get('/api/analytics/monthly?month=2026-10')
      .set('Cookie', cookie)
      .expect(200);

    assert.ok(response.body.analytics);
    assert.equal(response.body.analytics.month, '2026-10');
    assert.equal(typeof response.body.analytics.total_spent, 'number');
    assert.equal(typeof response.body.analytics.transaction_count, 'number');
    assert.ok(Array.isArray(response.body.analytics.category_totals));
    assert.ok(Array.isArray(response.body.analytics.daily_totals));
  });

  test('totals spending by category, by day and against the previous month', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const { body } = await request(app).get('/api/categories').set('Cookie', cookie).expect(200);
    const food = body.categories.find((c) => c.name === 'Food');
    const transport = body.categories.find((c) => c.name === 'Transport');

    const add = (amount, spent_on, category) => request(app)
      .post('/api/expenses')
      .set('Cookie', cookie)
      .send({ amount, spent_on, category_id: category.id })
      .expect(201);

    await add(100.10, '2026-10-02', food);
    await add(200.20, '2026-10-02', food);
    await add(50, '2026-10-09', transport);
    await add(200, '2026-09-15', food);

    const { body: result } = await request(app)
      .get('/api/analytics/monthly?month=2026-10')
      .set('Cookie', cookie)
      .expect(200);
    const a = result.analytics;

    // Sums are exact to the paisa: 100.10 + 200.20 + 50.
    assert.equal(a.total_spent, 350.3);
    assert.equal(a.transaction_count, 3);
    assert.deepEqual(
      a.category_totals.map((c) => [c.category_name, c.total_spent, c.transaction_count]),
      [['Food', 300.3, 2], ['Transport', 50, 1]],
    );
    assert.deepEqual(
      a.daily_totals.map((d) => [d.date, d.total_spent]),
      [['2026-10-02', 300.3], ['2026-10-09', 50]],
    );
    assert.equal(a.previous_month.month, '2026-09');
    assert.equal(a.previous_month.total_spent, 200);
    assert.equal(a.percentage_change, 75.15);
  });

  test("never includes another user's spending", async () => {
    const mine = await createUser('me@test.com');
    const theirs = await createUser('them@test.com');
    const myCookie = await loginAs(mine);
    const theirCookie = await loginAs(theirs);

    const { body } = await request(app).get('/api/categories').set('Cookie', theirCookie).expect(200);
    await request(app)
      .post('/api/expenses')
      .set('Cookie', theirCookie)
      .send({ amount: 999, spent_on: '2026-10-03', category_id: body.categories[0].id })
      .expect(201);

    const { body: result } = await request(app)
      .get('/api/analytics/monthly?month=2026-10')
      .set('Cookie', myCookie)
      .expect(200);

    assert.equal(result.analytics.total_spent, 0);
    assert.deepEqual(result.analytics.category_totals, []);
  });

  test('reports no percentage change when the previous month had no spending', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const { body } = await request(app).get('/api/categories').set('Cookie', cookie).expect(200);

    await request(app)
      .post('/api/expenses')
      .set('Cookie', cookie)
      .send({ amount: 10, spent_on: '2026-10-03', category_id: body.categories[0].id })
      .expect(201);

    const { body: result } = await request(app)
      .get('/api/analytics/monthly?month=2026-10')
      .set('Cookie', cookie)
      .expect(200);

    assert.equal(result.analytics.percentage_change, null);
  });
});

describe('IAnalyticsService interface', () => {
  test('the interface must be implemented, and AnalyticsService implements it', async () => {
    await assert.rejects(() => new IAnalyticsService().getMonthlyAnalytics('u', '2026-10'), /must be implemented/);
    assert.ok(new AnalyticsService() instanceof IAnalyticsService);
  });

  test('rejects a month that is not YYYY-MM', async () => {
    await assert.rejects(
      () => new AnalyticsService().getMonthlyAnalytics('00000000-0000-4000-8000-000000000001', '2026-13'),
      /valid month/,
    );
  });
});
