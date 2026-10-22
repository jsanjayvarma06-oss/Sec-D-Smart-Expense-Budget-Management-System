
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();

const app = createApp();

async function createCategory(userId, name = 'Test Category') {
  const { rows } = await query(
    `INSERT INTO categories (user_id, name)
     VALUES ($1, $2)
     RETURNING id, name`,
    [userId, name],
  );

  return rows[0];
}

function createValidExpense(cookie, categoryId, overrides = {}) {
  return request(app)
    .post('/api/expenses')
    .set('Cookie', cookie)
    .send({
      amount: 250,
      category_id: categoryId,
      spent_on: '2026-10-01',
      note: 'Lunch',
      ...overrides,
    });
}

function dateOnly(value) {
  return String(value).slice(0, 10);
}

describe('Expense CRUD API', () => {
  test('creates an expense with amount, date and note', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const category = await createCategory(user.id);

    const response = await createValidExpense(cookie, category.id)
      .expect(201);

    assert.equal(Number(response.body.expense.amount), 250);
    assert.equal(response.body.expense.category_id, category.id);
    assert.equal(dateOnly(response.body.expense.spent_on), '2026-10-01');
    assert.equal(response.body.expense.note, 'Lunch');
  });

  test('lists only the logged-in user expenses', async () => {
    const user1 = await createUser('user1@test.com');
    const user2 = await createUser('user2@test.com');
    const cookie1 = await loginAs(user1);
    const cookie2 = await loginAs(user2);
    const category1 = await createCategory(user1.id, 'Food');
    const category2 = await createCategory(user2.id, 'Travel');

    await createValidExpense(cookie1, category1.id);
    await createValidExpense(cookie2, category2.id, {
      amount: 500,
      note: 'Bus ticket',
    });

    const response = await request(app)
      .get('/api/expenses')
      .set('Cookie', cookie1)
      .expect(200);

    assert.equal(response.body.expenses.length, 1);
    assert.equal(Number(response.body.expenses[0].amount), 250);
  });

  test('updates an expense record', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const category = await createCategory(user.id);
    const created = await createValidExpense(cookie, category.id)
      .expect(201);

    const response = await request(app)
      .put(`/api/expenses/${created.body.expense.id}`)
      .set('Cookie', cookie)
      .send({
        amount: 400,
        category_id: category.id,
        spent_on: '2026-10-02',
        note: 'Updated note',
      })
      .expect(200);

    assert.equal(Number(response.body.expense.amount), 400);
    assert.equal(dateOnly(response.body.expense.spent_on), '2026-10-02');
    assert.equal(response.body.expense.note, 'Updated note');
  });

  test('deletes an expense record', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const category = await createCategory(user.id);
    const created = await createValidExpense(cookie, category.id)
      .expect(201);

    await request(app)
      .delete(`/api/expenses/${created.body.expense.id}`)
      .set('Cookie', cookie)
      .expect(204);

    const { rows } = await query(
      'SELECT id FROM expenses WHERE id = $1 AND user_id = $2',
      [created.body.expense.id, user.id],
    );

    assert.equal(rows.length, 0);
  });

  test('rejects zero and negative expense amounts', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const category = await createCategory(user.id);

    await createValidExpense(cookie, category.id, { amount: 0 })
      .expect(400);

    await createValidExpense(cookie, category.id, { amount: -10 })
      .expect(400);
  });

  test('rejects a category belonging to another user', async () => {
    const user1 = await createUser('user1@test.com');
    const user2 = await createUser('user2@test.com');
    const cookie1 = await loginAs(user1);
    const category2 = await createCategory(user2.id, 'Private category');

    await createValidExpense(cookie1, category2.id).expect(400);
  });

  test('returns 404 for a missing expense', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const category = await createCategory(user.id);
    const missingId = '00000000-0000-4000-8000-000000000000';

    await request(app)
      .put(`/api/expenses/${missingId}`)
      .set('Cookie', cookie)
      .send({
        amount: 100,
        category_id: category.id,
        spent_on: '2026-10-01',
        note: null,
      })
      .expect(404);

    await request(app)
      .delete(`/api/expenses/${missingId}`)
      .set('Cookie', cookie)
      .expect(404);
  });

  test('rejects malformed expense IDs', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const category = await createCategory(user.id);

    await request(app)
      .put('/api/expenses/not-a-uuid')
      .set('Cookie', cookie)
      .send({
        amount: 100,
        category_id: category.id,
        spent_on: '2026-10-01',
        note: null,
      })
      .expect(400);

    await request(app)
      .delete('/api/expenses/not-a-uuid')
      .set('Cookie', cookie)
      .expect(400);
  });

  test('requires authentication', async () => {
    await request(app).get('/api/expenses').expect(401);
  });
});
