
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  forecastMonthlySpending,
} from '../src/services/forecastService.js';
import { createUser, useTestDatabase } from './helpers.js';
import { withUser } from '../src/db/userScope.js';

useTestDatabase();

describe('Monthly spending forecast', () => {
  test('returns unavailable when fewer than 3 months have spending', async () => {
    const user = await createUser();

    const result = await forecastMonthlySpending(user.id);

    assert.equal(result.available, false);
    assert.equal(result.forecast, null);
    assert.equal(result.monthsOfHistory, 0);
    assert.match(result.reason, /3 months/);
  });

  test('returns a forecast when at least 3 months of history exist', async () => {
    const user = await createUser();

    await withUser(user.id, async (db) => {
      const { rows: categories } = await db.query(
        `SELECT id FROM categories WHERE user_id IS NULL LIMIT 1`,
      );

      assert.ok(categories.length > 0, 'A default category must exist');

      const categoryId = categories[0].id;

      await db.query(
        `INSERT INTO expenses
          (user_id, category_id, amount, spent_on, note)
         VALUES
          ($1, $2, 100, date_trunc('month', CURRENT_DATE) - INTERVAL '1 month', 'Forecast test 1'),
          ($1, $2, 200, date_trunc('month', CURRENT_DATE) - INTERVAL '2 months', 'Forecast test 2'),
          ($1, $2, 300, date_trunc('month', CURRENT_DATE) - INTERVAL '3 months', 'Forecast test 3')`,
        [user.id, categoryId],
      );
    });

    const result = await forecastMonthlySpending(user.id);

    assert.equal(result.available, true);
    assert.equal(result.monthsOfHistory, 3);
    assert.equal(result.forecast, 200);
    assert.equal(result.monthlyTotals.length, 3);
  });
});
