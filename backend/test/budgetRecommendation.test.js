
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();
const app = createApp();

describe('Budget recommendation API', () => {
  test('requires authentication', async () => {
    await request(app)
      .get('/api/budgets/recommendations')
      .expect(401);
  });

  test('returns a valid response for a logged-in user', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const response = await request(app)
      .get('/api/budgets/recommendations')
      .set('Cookie', cookie)
      .expect(200);

    assert.ok(response.body.recommendations);
    assert.equal(
      typeof response.body.recommendations.available,
      'boolean',
    );
    assert.ok(
      Array.isArray(response.body.recommendations.categories),
    );
  });
});
