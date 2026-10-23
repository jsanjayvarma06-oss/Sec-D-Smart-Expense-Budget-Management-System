
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

async function createCategory(userId) {
  const { rows } = await query(
    `INSERT INTO categories (user_id, name)
     VALUES ($1, $2)
     RETURNING id`,
    [userId, 'Recurring Route Test Category'],
  );

  return rows[0].id;
}

async function createRecurringExpense(userId, categoryId) {
  const { rows } = await query(
    `INSERT INTO recurring_expenses
       (user_id, category_id, amount, cycle, start_date, next_due_date, note)
     VALUES ($1, $2, 250, 'weekly', '2026-10-01', '2026-10-01', 'Test recurring expense')
     RETURNING id`,
    [userId, categoryId],
  );

  return rows[0].id;
}

describe('Recurring expense API', () => {
  test('requires authentication', async () => {
    await request(app)
      .post('/api/recurring-expenses/generate-due')
      .send({ today: '2026-10-23' })
      .expect(401);
  });

  test('rejects an invalid date', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    await request(app)
      .post('/api/recurring-expenses/generate-due')
      .set('Cookie', cookie)
      .send({ today: 'not-a-date' })
      .expect(400);
  });

  test('generates due recurring expenses', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const categoryId = await createCategory(user.id);

    await createRecurringExpense(user.id, categoryId);

    const response = await request(app)
      .post('/api/recurring-expenses/generate-due')
      .set('Cookie', cookie)
      .send({ today: '2026-10-15' })
      .expect(200);

    assert.equal(response.body.generated_count, 3);
    assert.equal(response.body.expenses.length, 3);
  });

  test('does not generate duplicate expenses on repeated requests', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const categoryId = await createCategory(user.id);

    await createRecurringExpense(user.id, categoryId);

    const firstResponse = await request(app)
      .post('/api/recurring-expenses/generate-due')
      .set('Cookie', cookie)
      .send({ today: '2026-10-15' })
      .expect(200);

    const secondResponse = await request(app)
      .post('/api/recurring-expenses/generate-due')
      .set('Cookie', cookie)
      .send({ today: '2026-10-15' })
      .expect(200);

    assert.equal(firstResponse.body.generated_count, 3);
    assert.equal(secondResponse.body.generated_count, 0);

    const { rows } = await query(
      `SELECT COUNT(*)::int AS count
       FROM expenses
       WHERE user_id = $1
         AND recurring_expense_id IS NOT NULL`,
      [user.id],
    );

    assert.equal(rows[0].count, 3);
  });
});
