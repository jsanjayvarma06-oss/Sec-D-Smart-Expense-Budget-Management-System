import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();

const app = createApp();

const month = '2026-10';

async function setup(budgetAmount) {
  const user = await createUser();
  const cookie = await loginAs(user);

  const { body } = await request(app)
    .get('/api/categories')
    .set('Cookie', cookie)
    .expect(200);
  const food = body.categories.find((category) => category.name === 'Food');

  await request(app)
    .post('/api/budgets')
    .set('Cookie', cookie)
    .send({ month, amount: budgetAmount })
    .expect(201);

  async function spend(amount, date = '2026-10-05') {
    await request(app)
      .post('/api/expenses')
      .set('Cookie', cookie)
      .send({ amount, spent_on: date, category_id: food.id })
      .expect(201);
  }

  async function alerts() {
    const response = await request(app)
      .get(`/api/budgets/alerts?month=${month}`)
      .set('Cookie', cookie)
      .expect(200);
    return response.body.alerts;
  }

  async function notifications() {
    const response = await request(app)
      .get('/api/notifications')
      .set('Cookie', cookie)
      .expect(200);
    return response.body.notifications;
  }

  return { cookie, spend, alerts, notifications };
}

describe('Budget alerts (FR09)', () => {
  test('no alert below 80%', async () => {
    const { spend, alerts } = await setup(1000);
    await spend(799.99);
    assert.deepEqual(await alerts(), []);
  });

  test('warns at 80% and again at 100%', async () => {
    const { spend, alerts, notifications } = await setup(1000);

    await spend(800);
    const warning = await alerts();
    assert.equal(warning.length, 1);
    assert.equal(warning[0].threshold, 80);

    await spend(200);
    const reached = await alerts();
    assert.equal(reached.length, 1);
    assert.equal(reached[0].threshold, 100);

    const types = (await notifications()).map((n) => n.type).sort();
    assert.deepEqual(types, ['budget_exceeded', 'budget_warning']);
  });

  test('treats exactly 80% as a warning even when floating point would round down', async () => {
    // 4.52 / 5.65 * 100 is 79.99999999999999 in JavaScript numbers.
    const { spend, alerts } = await setup(5.65);
    await spend(4.52);

    const [alert] = await alerts();
    assert.ok(alert, 'exactly 80% of the budget must raise the warning');
    assert.equal(alert.threshold, 80);
  });

  test('treats exactly 100% as reached, and a paisa under as still a warning', async () => {
    const { spend, alerts } = await setup(0.3);
    await spend(0.29);
    assert.equal((await alerts())[0].threshold, 80);

    await spend(0.01);
    assert.equal((await alerts())[0].threshold, 100);
  });

  test('sends each alert once per budget however often it is checked', async () => {
    const { spend, alerts, notifications } = await setup(1000);
    await spend(900);

    await alerts();
    await alerts();
    await alerts();

    assert.equal((await notifications()).length, 1);
  });
});
