
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();

const app = createApp();

function createValidIncome(cookie, overrides = {}) {
  return request(app)
    .post('/api/income')
    .set('Cookie', cookie)
    .send({
      amount: 25000,
      source: 'Salary',
      received_on: '2026-10-01',
      is_recurring: true,
      note: 'October salary',
      ...overrides,
    });
}

describe('Income CRUD API', () => {
  test('creates recurring income', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const response = await createValidIncome(cookie).expect(201);

    assert.equal(Number(response.body.income.amount), 25000);
    assert.equal(response.body.income.source, 'Salary');
    assert.equal(response.body.income.is_recurring, true);
    assert.equal(response.body.income.note, 'October salary');
  });

  test('creates one-time income when recurring is false', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const response = await createValidIncome(cookie, {
      amount: 1500,
      source: 'Freelance work',
      is_recurring: false,
      note: null,
    }).expect(201);

    assert.equal(response.body.income.is_recurring, false);
    assert.equal(response.body.income.source, 'Freelance work');
  });

  test('lists only the logged-in user income', async () => {
    const user1 = await createUser('user1@test.com');
    const user2 = await createUser('user2@test.com');
    const cookie1 = await loginAs(user1);
    const cookie2 = await loginAs(user2);

    await createValidIncome(cookie1);
    await createValidIncome(cookie2, { source: 'Other salary' });

    const response = await request(app)
      .get('/api/income')
      .set('Cookie', cookie1)
      .expect(200);

    assert.equal(response.body.income.length, 1);
    assert.equal(response.body.income[0].source, 'Salary');
  });

  test('updates an income record', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const created = await createValidIncome(cookie).expect(201);

    const response = await request(app)
      .put(`/api/income/${created.body.income.id}`)
      .set('Cookie', cookie)
      .send({
        amount: 30000,
        source: 'Updated salary',
        received_on: '2026-10-02',
        is_recurring: false,
        note: 'Updated note',
      })
      .expect(200);

    assert.equal(Number(response.body.income.amount), 30000);
    assert.equal(response.body.income.source, 'Updated salary');
    assert.equal(response.body.income.is_recurring, false);
    assert.equal(response.body.income.note, 'Updated note');
  });

  test('deletes an income record', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const created = await createValidIncome(cookie).expect(201);

    await request(app)
      .delete(`/api/income/${created.body.income.id}`)
      .set('Cookie', cookie)
      .expect(204);

    const { rows } = await query(
      'SELECT id FROM income WHERE id = $1 AND user_id = $2',
      [created.body.income.id, user.id],
    );

    assert.equal(rows.length, 0);
  });

  test('rejects zero or negative income amounts', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    await createValidIncome(cookie, { amount: 0 }).expect(400);
    await createValidIncome(cookie, { amount: -100 }).expect(400);
  });

  test('returns 404 when updating or deleting a missing record', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const missingId = '00000000-0000-4000-8000-000000000000';

    await request(app)
      .put(`/api/income/${missingId}`)
      .set('Cookie', cookie)
      .send({
        amount: 100,
        source: 'Salary',
        received_on: '2026-10-01',
        is_recurring: false,
        note: null,
      })
      .expect(404);

    await request(app)
      .delete(`/api/income/${missingId}`)
      .set('Cookie', cookie)
      .expect(404);
  });

  test('requires authentication', async () => {
    await request(app).get('/api/income').expect(401);
  });

  test('rejects malformed income record IDs', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    await request(app)
      .put('/api/income/not-a-uuid')
      .set('Cookie', cookie)
      .send({
        amount: 100,
        source: 'Salary',
        received_on: '2026-10-01',
        is_recurring: false,
        note: null,
      })
      .expect(400);

    await request(app)
      .delete('/api/income/not-a-uuid')
      .set('Cookie', cookie)
      .expect(400);
  });
});
