
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();

const app = createApp();

async function createCategory(userId, name = 'Review Test Category') {
  const { rows } = await query(
    `INSERT INTO categories (user_id, name)
     VALUES ($1, $2)
     RETURNING id`,
    [userId, name],
  );

  return rows[0];
}

async function createFlaggedExpense(userId, categoryId) {
  const { rows } = await query(
    `INSERT INTO expenses
       (user_id, category_id, amount, spent_on, note, is_flagged)
     VALUES ($1, $2, 1000, '2026-10-01', 'Unusual expense', true)
     RETURNING id, is_flagged`,
    [userId, categoryId],
  );

  return rows[0];
}

describe('Expense review API', () => {
  test('requires authentication to review an expense', async () => {
    const response = await request(app)
      .patch(
        '/api/expenses/00000000-0000-4000-8000-000000000001/review',
      );

    assert.equal(response.status, 401);
  });

  test('dismisses a flagged expense without deleting it', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const category = await createCategory(user.id);
    const expense = await createFlaggedExpense(user.id, category.id);

    const response = await request(app)
      .patch(`/api/expenses/${expense.id}/review`)
      .set('Cookie', cookie)
      .expect(200);

    assert.equal(response.body.expense.id, expense.id);
    assert.equal(response.body.expense.is_flagged, false);

    const { rows } = await query(
      'SELECT id, is_flagged FROM expenses WHERE id = $1',
      [expense.id],
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].is_flagged, false);
  });

  test('does not allow one user to dismiss another user expense flag', async () => {
    const owner = await createUser('review-owner@test.com');
    const otherUser = await createUser('review-other@test.com');
    const ownerCookie = await loginAs(owner);
    const otherCookie = await loginAs(otherUser);
    const category = await createCategory(owner.id);
    const expense = await createFlaggedExpense(owner.id, category.id);

    await request(app)
      .patch(`/api/expenses/${expense.id}/review`)
      .set('Cookie', otherCookie)
      .expect(404);

    const { rows } = await query(
      'SELECT is_flagged FROM expenses WHERE id = $1',
      [expense.id],
    );

    assert.equal(rows[0].is_flagged, true);

    await request(app)
      .patch(`/api/expenses/${expense.id}/review`)
      .set('Cookie', ownerCookie)
      .expect(200);
  });

  test('returns 404 when the expense is already reviewed', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const category = await createCategory(user.id);
    const expense = await createFlaggedExpense(user.id, category.id);

    await request(app)
      .patch(`/api/expenses/${expense.id}/review`)
      .set('Cookie', cookie)
      .expect(200);

    await request(app)
      .patch(`/api/expenses/${expense.id}/review`)
      .set('Cookie', cookie)
      .expect(404);
  });
});
