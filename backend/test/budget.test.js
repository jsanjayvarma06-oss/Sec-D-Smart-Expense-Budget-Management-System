
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();

const app = createApp();

describe('Budget Management API', () => {
  test('requires authentication', async () => {
    await request(app)
      .get('/api/budgets?month=2026-10')
      .expect(401);

    await request(app)
      .post('/api/budgets')
      .send({ month: '2026-10', amount: 1000 })
      .expect(401);
  });

  test('creates and lists a monthly overall budget', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const created = await request(app)
      .post('/api/budgets')
      .set('Cookie', cookie)
      .send({ month: '2026-10', amount: 2000 })
      .expect(201);

    assert.equal(Number(created.body.budget.amount), 2000);
    assert.equal(created.body.budget.category_id, null);

    const listed = await request(app)
      .get('/api/budgets?month=2026-10')
      .set('Cookie', cookie)
      .expect(200);

    assert.equal(listed.body.budgets.length, 1);
    assert.equal(Number(listed.body.budgets[0].amount), 2000);
  });

  test('updates an existing budget', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const created = await request(app)
      .post('/api/budgets')
      .set('Cookie', cookie)
      .send({ month: '2026-10', amount: 2000 })
      .expect(201);

    const updated = await request(app)
      .put(`/api/budgets/${created.body.budget.id}`)
      .set('Cookie', cookie)
      .send({ amount: 3500 })
      .expect(200);

    assert.equal(Number(updated.body.budget.amount), 3500);
  });

  test('rejects zero and negative budget amounts', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    for (const amount of [0, -100]) {
      await request(app)
        .post('/api/budgets')
        .set('Cookie', cookie)
        .send({ month: '2026-10', amount })
        .expect(400);
    }
  });

  test('rejects invalid months', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    for (const month of ['2026-13', '2026-00', 'October 2026']) {
      await request(app)
        .post('/api/budgets')
        .set('Cookie', cookie)
        .send({ month, amount: 1000 })
        .expect(400);
    }

    await request(app)
      .get('/api/budgets?month=2026-13')
      .set('Cookie', cookie)
      .expect(400);
  });

  test('rejects malformed budget IDs', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    await request(app)
      .put('/api/budgets/not-a-uuid')
      .set('Cookie', cookie)
      .send({ amount: 1500 })
      .expect(400);

    await request(app)
      .delete('/api/budgets/not-a-uuid')
      .set('Cookie', cookie)
      .expect(400);
  });

  test('returns 404 when updating or deleting a missing budget', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const missingId = '00000000-0000-4000-8000-000000000001';

    await request(app)
      .put(`/api/budgets/${missingId}`)
      .set('Cookie', cookie)
      .send({ amount: 1500 })
      .expect(404);

    await request(app)
      .delete(`/api/budgets/${missingId}`)
      .set('Cookie', cookie)
      .expect(404);
  });

  test('does not expose another user budgets', async () => {
    const user1 = await createUser('budget1@test.com');
    const user2 = await createUser('budget2@test.com');
    const cookie1 = await loginAs(user1);
    const cookie2 = await loginAs(user2);

    await request(app)
      .post('/api/budgets')
      .set('Cookie', cookie1)
      .send({ month: '2026-10', amount: 4000 })
      .expect(201);

    const response = await request(app)
      .get('/api/budgets?month=2026-10')
      .set('Cookie', cookie2)
      .expect(200);

    assert.equal(response.body.budgets.length, 0);
  });

  test('deletes an existing budget', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const created = await request(app)
      .post('/api/budgets')
      .set('Cookie', cookie)
      .send({ month: '2026-10', amount: 2000 })
      .expect(201);

    await request(app)
      .delete(`/api/budgets/${created.body.budget.id}`)
      .set('Cookie', cookie)
      .expect(204);

    const listed = await request(app)
      .get('/api/budgets?month=2026-10')
      .set('Cookie', cookie)
      .expect(200);

    assert.equal(listed.body.budgets.length, 0);
  });

  test('allows category budgets within the overall monthly budget', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const categories = await request(app)
      .get('/api/categories')
      .set('Cookie', cookie)
      .expect(200);

    const food = categories.body.categories.find(
      (category) => category.name === 'Food',
    );
    const transport = categories.body.categories.find(
      (category) => category.name === 'Transport',
    );

    assert.ok(food, 'Food category must exist');
    assert.ok(transport, 'Transport category must exist');

    await request(app)
      .post('/api/budgets')
      .set('Cookie', cookie)
      .send({ month: '2026-10', amount: 2000 })
      .expect(201);

    await request(app)
      .post('/api/budgets')
      .set('Cookie', cookie)
      .send({
        month: '2026-10',
        amount: 800,
        category_id: food.id,
      })
      .expect(201);

    await request(app)
      .post('/api/budgets')
      .set('Cookie', cookie)
      .send({
        month: '2026-10',
        amount: 700,
        category_id: transport.id,
      })
      .expect(201);
  });

  test('rejects category budgets exceeding the overall monthly budget', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const categories = await request(app)
      .get('/api/categories')
      .set('Cookie', cookie)
      .expect(200);

    const food = categories.body.categories.find(
      (category) => category.name === 'Food',
    );

    assert.ok(food, 'Food category must exist');

    await request(app)
      .post('/api/budgets')
      .set('Cookie', cookie)
      .send({ month: '2026-10', amount: 1000 })
      .expect(201);

    const response = await request(app)
      .post('/api/budgets')
      .set('Cookie', cookie)
      .send({
        month: '2026-10',
        amount: 1200,
        category_id: food.id,
      })
      .expect(400);

    assert.equal(
      response.body.code,
      'CATEGORY_BUDGETS_EXCEED_OVERALL',
    );
  });

  test('rejects category budget updates that exceed the overall budget', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const categories = await request(app)
      .get('/api/categories')
      .set('Cookie', cookie)
      .expect(200);

    const food = categories.body.categories.find(
      (category) => category.name === 'Food',
    );
    const transport = categories.body.categories.find(
      (category) => category.name === 'Transport',
    );

    assert.ok(food, 'Food category must exist');
    assert.ok(transport, 'Transport category must exist');

    await request(app)
      .post('/api/budgets')
      .set('Cookie', cookie)
      .send({ month: '2026-10', amount: 1000 })
      .expect(201);

    const foodBudget = await request(app)
      .post('/api/budgets')
      .set('Cookie', cookie)
      .send({
        month: '2026-10',
        amount: 400,
        category_id: food.id,
      })
      .expect(201);

    await request(app)
      .post('/api/budgets')
      .set('Cookie', cookie)
      .send({
        month: '2026-10',
        amount: 300,
        category_id: transport.id,
      })
      .expect(201);

    const response = await request(app)
      .put(`/api/budgets/${foodBudget.body.budget.id}`)
      .set('Cookie', cookie)
      .send({ amount: 800 })
      .expect(400);

    assert.equal(
      response.body.code,
      'CATEGORY_BUDGETS_EXCEED_OVERALL',
    );
  });

  test('rejects reducing the overall budget below the category budget total', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const categories = await request(app)
      .get('/api/categories')
      .set('Cookie', cookie)
      .expect(200);

    const food = categories.body.categories.find(
      (category) => category.name === 'Food',
    );

    assert.ok(food, 'Food category must exist');

    const overall = await request(app)
      .post('/api/budgets')
      .set('Cookie', cookie)
      .send({ month: '2026-10', amount: 2000 })
      .expect(201);

    await request(app)
      .post('/api/budgets')
      .set('Cookie', cookie)
      .send({
        month: '2026-10',
        amount: 1200,
        category_id: food.id,
      })
      .expect(201);

    const response = await request(app)
      .put(`/api/budgets/${overall.body.budget.id}`)
      .set('Cookie', cookie)
      .send({ amount: 1000 })
      .expect(400);

    assert.equal(
      response.body.code,
      'CATEGORY_BUDGETS_EXCEED_OVERALL',
    );
  });

  // Backlog 12: Remaining budget calculation.

  test('requires authentication for remaining budget', async () => {
    await request(app)
      .get('/api/budgets/remaining?month=2026-10')
      .expect(401);
  });

  test('rejects invalid month for remaining budget', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    await request(app)
      .get('/api/budgets/remaining?month=2026-13')
      .set('Cookie', cookie)
      .expect(400);
  });

  test('calculates overall and category remaining budgets', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const categoriesResponse = await request(app)
      .get('/api/categories')
      .set('Cookie', cookie)
      .expect(200);

    const food = categoriesResponse.body.categories.find(
      (category) => category.name === 'Food',
    );
    const transport = categoriesResponse.body.categories.find(
      (category) => category.name === 'Transport',
    );

    assert.ok(food, 'Food category must exist');
    assert.ok(transport, 'Transport category must exist');

    await request(app)
      .post('/api/budgets')
      .set('Cookie', cookie)
      .send({ month: '2026-10', amount: 2000 })
      .expect(201);

    await request(app)
      .post('/api/budgets')
      .set('Cookie', cookie)
      .send({
        month: '2026-10',
        amount: 800,
        category_id: food.id,
      })
      .expect(201);

    await request(app)
      .post('/api/expenses')
      .set('Cookie', cookie)
      .send({
        amount: 250,
        spent_on: '2026-10-01',
        category_id: food.id,
        note: 'Food expense for budget test',
      })
      .expect(201);

    await request(app)
      .post('/api/expenses')
      .set('Cookie', cookie)
      .send({
        amount: 100,
        spent_on: '2026-10-02',
        category_id: transport.id,
        note: 'Transport expense for budget test',
      })
      .expect(201);

    const response = await request(app)
      .get('/api/budgets/remaining?month=2026-10')
      .set('Cookie', cookie)
      .expect(200);

    const remainingBudgets = response.body.remainingBudgets;

    assert.equal(remainingBudgets.length, 2);

    const overall = remainingBudgets.find(
      (budget) => budget.category_id === null,
    );
    const foodBudget = remainingBudgets.find(
      (budget) => budget.category_id === food.id,
    );

    assert.ok(overall, 'Overall budget should be returned');
    assert.ok(foodBudget, 'Food budget should be returned');

    assert.equal(overall.budget_amount, 2000);
    assert.equal(overall.spent_amount, 350);
    assert.equal(overall.remaining_amount, 1650);
    assert.equal(overall.exceeded, false);

    assert.equal(foodBudget.budget_amount, 800);
    assert.equal(foodBudget.spent_amount, 250);
    assert.equal(foodBudget.remaining_amount, 550);
    assert.equal(foodBudget.exceeded, false);
  });

  test('returns zero spending when no expenses exist', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    await request(app)
      .post('/api/budgets')
      .set('Cookie', cookie)
      .send({ month: '2026-10', amount: 1000 })
      .expect(201);

    const response = await request(app)
      .get('/api/budgets/remaining?month=2026-10')
      .set('Cookie', cookie)
      .expect(200);

    assert.equal(response.body.remainingBudgets.length, 1);
    assert.equal(
      response.body.remainingBudgets[0].spent_amount,
      0,
    );
    assert.equal(
      response.body.remainingBudgets[0].remaining_amount,
      1000,
    );
    assert.equal(
      response.body.remainingBudgets[0].exceeded,
      false,
    );
  });

  test('allows category budgets that add up to exactly the overall budget, and explains a refusal', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const { body } = await request(app).get('/api/categories').set('Cookie', cookie).expect(200);
    const food = body.categories.find((c) => c.name === 'Food');
    const transport = body.categories.find((c) => c.name === 'Transport');

    const set = (amount, category) => request(app)
      .post('/api/budgets')
      .set('Cookie', cookie)
      .send({ month: '2026-10', amount, category_id: category?.id ?? null });

    await set(1000.30).expect(201);
    await set(600.10, food).expect(201);
    // 600.10 + 400.20 is exactly 1000.30: allowed, no floating-point surprise.
    await set(400.20, transport).expect(201);

    // One paisa more is refused, with the message the SRS update promises (FR07).
    const refused = await set(400.21, transport).expect(400);
    assert.equal(refused.body.code, 'CATEGORY_BUDGETS_EXCEED_OVERALL');
    assert.equal(
      refused.body.error,
      'The combined category budgets cannot exceed the overall monthly budget',
    );

    // The refused change left the saved budget alone.
    const listed = await request(app).get('/api/budgets?month=2026-10').set('Cookie', cookie).expect(200);
    const saved = listed.body.budgets.find((b) => b.category_id === transport.id);
    assert.equal(Number(saved.amount), 400.2);
  });
});
