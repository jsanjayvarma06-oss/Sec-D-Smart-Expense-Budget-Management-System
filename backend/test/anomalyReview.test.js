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

// A user with five earlier 100.00 expenses in one category, so an amount over
// 300.00 counts as unusual (FR11).
async function setup(email = 'user1@test.com') {
  const user = await createUser(email);
  const cookie = await loginAs(user);
  const { rows } = await query(
    'SELECT id FROM categories WHERE user_id IS NULL LIMIT 1',
  );
  const categoryId = rows[0].id;

  for (let day = 1; day <= 5; day += 1) {
    await query(
      `INSERT INTO expenses (user_id, category_id, amount, spent_on)
       VALUES ($1, $2, 100, $3::date)`,
      [user.id, categoryId, `2026-09-${String(day).padStart(2, '0')}`],
    );
  }

  function add(amount, extra = {}) {
    return request(app)
      .post('/api/expenses')
      .set('Cookie', cookie)
      .send({
        amount, spent_on: '2026-10-05', category_id: categoryId, ...extra,
      })
      .expect(201);
  }

  function edit(id, amount, extra = {}) {
    return request(app)
      .put(`/api/expenses/${id}`)
      .set('Cookie', cookie)
      .send({
        amount, spent_on: '2026-10-05', category_id: categoryId, ...extra,
      });
  }

  function review(id) {
    return request(app).patch(`/api/expenses/${id}/review`).set('Cookie', cookie);
  }

  return { user, cookie, categoryId, add, edit, review };
}

describe('Unusual spending: confirm or edit flow (FR11)', () => {
  test('a large expense is saved, flagged, and the response says why', async () => {
    const { add } = await setup();
    const { body } = await add(1000);

    assert.equal(body.expense.is_flagged, true);
    assert.equal(body.expense.anomaly.isUnusual, true);
    assert.equal(body.expense.anomaly.averageAmount, 100);
    assert.equal(body.expense.anomaly.thresholdAmount, 300);
  });

  test('exactly three times the average is not flagged, one paisa more is', async () => {
    const atLimit = await setup('a@test.com');
    assert.equal((await atLimit.add(300)).body.expense.is_flagged, false);

    const overLimit = await setup('b@test.com');
    assert.equal((await overLimit.add(300.01)).body.expense.is_flagged, true);
  });

  test('confirming a flagged expense keeps it and clears the flag', async () => {
    const { add, review, cookie } = await setup();
    const { id } = (await add(1000)).body.expense;

    const confirmed = await review(id).expect(200);
    assert.equal(confirmed.body.expense.is_flagged, false);
    assert.equal(Number(confirmed.body.expense.amount), 1000);

    const list = await request(app).get('/api/expenses').set('Cookie', cookie);
    assert.ok(list.body.expenses.some((item) => item.id === id));
  });

  test('confirming twice, or an expense that is not flagged, answers 404', async () => {
    const { add, review } = await setup();
    const flagged = (await add(1000)).body.expense.id;
    const normal = (await add(100)).body.expense.id;

    await review(flagged).expect(200);
    await review(flagged).expect(404);
    await review(normal).expect(404);
  });

  test('correcting the amount of a flagged expense clears the flag', async () => {
    const { add, edit } = await setup();
    const { id } = (await add(1000)).body.expense;

    const { body } = await edit(id, 120).expect(200);

    assert.equal(body.expense.is_flagged, false);
    assert.equal(body.expense.anomaly.isUnusual, false);
  });

  test('editing an expense to a much larger amount flags it', async () => {
    const { add, edit } = await setup();
    const { id } = (await add(100)).body.expense;

    const { body } = await edit(id, 5000).expect(200);

    assert.equal(body.expense.is_flagged, true);
    assert.equal(body.expense.anomaly.isUnusual, true);
  });

  test('an edit is not compared against the expense\'s own old amount', async () => {
    const { user, categoryId, edit } = await setup();
    // A confirmed 1000.00 expense is part of the history. Changing it to 400
    // must be judged against the other five (average 100), not against itself.
    const { rows } = await query(
      `INSERT INTO expenses (user_id, category_id, amount, spent_on, is_flagged)
       VALUES ($1, $2, 1000, '2026-10-01', false) RETURNING id`,
      [user.id, categoryId],
    );

    const { body } = await edit(rows[0].id, 400).expect(200);

    assert.equal(body.expense.is_flagged, true);
  });

  test('editing only the note keeps the flag as it was', async () => {
    const { add, edit, review } = await setup();
    const flagged = (await add(1000)).body.expense.id;

    const stillFlagged = await edit(flagged, 1000, { note: 'Laptop' }).expect(200);
    assert.equal(stillFlagged.body.expense.is_flagged, true);

    await review(flagged).expect(200);
    const confirmed = await edit(flagged, 1000, { note: 'Laptop for work' }).expect(200);
    assert.equal(confirmed.body.expense.is_flagged, false);
  });

  test('another user cannot confirm or edit a flagged expense', async () => {
    const { add } = await setup();
    const { id } = (await add(1000)).body.expense;

    const other = await createUser('other@test.com');
    const otherCookie = await loginAs(other);

    await request(app)
      .patch(`/api/expenses/${id}/review`)
      .set('Cookie', otherCookie)
      .expect(404);
    await request(app)
      .put(`/api/expenses/${id}`)
      .set('Cookie', otherCookie)
      .send({ amount: 5, spent_on: '2026-10-05', category_id: (await query('SELECT id FROM categories WHERE user_id IS NULL LIMIT 1')).rows[0].id })
      .expect(404);
  });
});
