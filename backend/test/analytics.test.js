
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

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
});
