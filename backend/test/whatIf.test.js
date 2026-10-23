
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();
const app = createApp();

describe('What-if budget simulator API', () => {
  test('requires authentication', async () => {
    await request(app)
      .post('/api/what-if/simulate')
      .send({
        month: '2026-10',
        proposedBudget: 20000,
        proposedIncome: 30000,
      })
      .expect(401);
  });

  test('rejects invalid simulation input', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    await request(app)
      .post('/api/what-if/simulate')
      .set('Cookie', cookie)
      .send({
        month: '2026-13',
        proposedBudget: -100,
        proposedIncome: 30000,
      })
      .expect(400);
  });

  test('returns a simulation for valid input', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const response = await request(app)
      .post('/api/what-if/simulate')
      .set('Cookie', cookie)
      .send({
        month: '2026-10',
        proposedBudget: 20000,
        proposedIncome: 30000,
      })
      .expect(200);

    const simulation = response.body.simulation;

    assert.equal(simulation.month, '2026-10');
    assert.equal(simulation.proposed_budget, 20000);
    assert.equal(simulation.proposed_income, 30000);
    assert.equal(simulation.current_spending, 0);
    assert.equal(simulation.remaining_budget, 20000);
    assert.equal(simulation.budget_exceeded, false);
    assert.equal(simulation.projected_savings, 30000);
    assert.equal(simulation.savings_rate, 100);
  });
});
