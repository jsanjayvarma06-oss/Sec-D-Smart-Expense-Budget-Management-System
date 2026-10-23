
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
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
