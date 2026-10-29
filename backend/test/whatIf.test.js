
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import {
  createUser,
  loginAs,
  monthsAgo,
  useTestDatabase,
} from './helpers.js';

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

  test('returns a simulation with forecast information for valid input', async () => {
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

    // Existing simulator results
    assert.equal(simulation.month, '2026-10');
    assert.equal(simulation.proposed_budget, 20000);
    assert.equal(simulation.proposed_income, 30000);
    assert.equal(simulation.current_spending, 0);
    assert.equal(simulation.transaction_count, 0);
    assert.equal(simulation.remaining_budget, 20000);
    assert.equal(simulation.budget_exceeded, false);
    assert.equal(simulation.projected_savings, 30000);
    assert.equal(simulation.savings_rate, 100);

    // Forecast results when the user has insufficient history
    assert.equal(simulation.spending_forecast, null);
    assert.equal(simulation.forecast_available, false);
    assert.equal(
      simulation.forecast_reason,
      'At least 3 months of spending history are required',
    );
  });

  describe('uses the spending forecast (FR19 with FR12)', () => {
    // Three complete months of 100 + 200 + 300, so the forecast is 200.
    async function userWithHistory() {
      const user = await createUser();
      const cookie = await loginAs(user);
      const { rows } = await query(
        'SELECT id FROM categories WHERE user_id IS NULL LIMIT 1',
      );

      for (const [months, amount] of [[3, 100], [2, 200], [1, 300]]) {
        await query(
          `INSERT INTO expenses (user_id, category_id, amount, spent_on)
           VALUES ($1, $2, $3, $4::date)`,
          [user.id, rows[0].id, amount, monthsAgo(months)],
        );
      }

      return cookie;
    }

    function simulate(cookie, proposedBudget) {
      return request(app)
        .post('/api/what-if/simulate')
        .set('Cookie', cookie)
        .send({ month: '2026-10', proposedBudget, proposedIncome: 1000 })
        .expect(200);
    }

    test('reports the same forecast as the forecast endpoint', async () => {
      const cookie = await userWithHistory();

      const forecast = await request(app)
        .get('/api/forecast/monthly')
        .set('Cookie', cookie)
        .expect(200);
      const { simulation } = (await simulate(cookie, 500)).body;

      assert.equal(simulation.forecast_available, true);
      assert.equal(simulation.spending_forecast, forecast.body.forecast.forecast);
      assert.equal(simulation.spending_forecast, 200);
      assert.equal(simulation.forecast_reason, null);
    });

    test('says a budget below the forecast would be exceeded', async () => {
      const cookie = await userWithHistory();
      const { simulation } = (await simulate(cookie, 150)).body;

      assert.equal(simulation.forecast_exceeds_budget, true);
      assert.equal(simulation.forecast_remaining_budget, -50);
    });

    test('a budget equal to the forecast is not exceeded', async () => {
      const cookie = await userWithHistory();
      const { simulation } = (await simulate(cookie, 200)).body;

      assert.equal(simulation.forecast_exceeds_budget, false);
      assert.equal(simulation.forecast_remaining_budget, 0);
    });

    test('says nothing about the forecast while there is too little history', async () => {
      const user = await createUser();
      const cookie = await loginAs(user);
      const { simulation } = (await simulate(cookie, 150)).body;

      assert.equal(simulation.forecast_available, false);
      assert.equal(simulation.forecast_remaining_budget, null);
      assert.equal(simulation.forecast_exceeds_budget, null);
    });

    test('never saves anything', async () => {
      const cookie = await userWithHistory();
      const before = await query('SELECT count(*)::int AS n FROM expenses');
      await simulate(cookie, 150);
      const after = await query('SELECT count(*)::int AS n FROM expenses');

      assert.equal(after.rows[0].n, before.rows[0].n);
    });
  });
});
