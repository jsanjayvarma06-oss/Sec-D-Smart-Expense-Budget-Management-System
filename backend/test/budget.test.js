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
});