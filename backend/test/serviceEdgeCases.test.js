// Edge cases of the financial health, what-if and budget recommendation services
// that the API tests do not reach (issue #162, code coverage). They call the
// services directly, the way the routes do after their own validation.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { query } from '../src/db/pool.js';
import { calculateFinancialHealth } from '../src/services/financialHealthService.js';
import { simulateBudget, simulatePurchase } from '../src/services/whatIfService.js';
import { recommendBudgets } from '../src/services/budgetRecommendationService.js';
import { createUser, monthsAgo, useTestDatabase } from './helpers.js';

useTestDatabase();

const MONTH = '2026-10';

async function firstCategoryId() {
  const { rows } = await query('SELECT id FROM categories WHERE user_id IS NULL LIMIT 1');
  return rows[0].id;
}

describe('financial health service: edge cases', () => {
  test('rejects a month that is not in YYYY-MM format', async () => {
    const user = await createUser();
    await assert.rejects(
      () => calculateFinancialHealth(user.id, 'October'),
      { name: 'TypeError', message: 'Month must use YYYY-MM format' },
    );
  });

  test('rejects a month number that does not exist', async () => {
    const user = await createUser();
    await assert.rejects(
      () => calculateFinancialHealth(user.id, '2026-13'),
      { name: 'TypeError', message: 'Enter a valid month' },
    );
  });

  test('saving under 10% of income earns the small savings points and can rate Fair', async () => {
    const user = await createUser();
    const categoryId = await firstCategoryId();
    // Income 10,000, spent 9,500 (5% saved), budget 9,000 (exceeded):
    // 50 + 10 (income above expenses) - 15 (over budget) = 45, which is Fair.
    await query(
      `INSERT INTO income (user_id, amount, source, received_on) VALUES ($1, 10000, 'Salary', '2026-10-01')`,
      [user.id],
    );
    await query(
      `INSERT INTO expenses (user_id, category_id, amount, spent_on) VALUES ($1, $2, 9500, '2026-10-05')`,
      [user.id, categoryId],
    );
    await query(
      `INSERT INTO budgets (user_id, month, amount) VALUES ($1, '2026-10-01', 9000)`,
      [user.id],
    );

    const health = await calculateFinancialHealth(user.id, MONTH);

    assert.equal(health.score, 45);
    assert.equal(health.rating, 'Fair');
    assert.equal(health.savings_rate, 5);
    assert.ok(health.explanation.includes('Your income exceeded your expenses.'));
    assert.ok(health.explanation.includes('Spending exceeded your overall budget.'));
  });
});

describe('what-if service: edge cases', () => {
  test('rejects an invalid month', async () => {
    const user = await createUser();
    await assert.rejects(
      () => simulateBudget(user.id, { month: 'soon', proposedBudget: 100, proposedIncome: 100 }),
      { name: 'TypeError', message: 'Month must use YYYY-MM format' },
    );
    await assert.rejects(
      () => simulateBudget(user.id, { month: '2026-00', proposedBudget: 100, proposedIncome: 100 }),
      { name: 'TypeError', message: 'Enter a valid month' },
    );
  });

  test('rejects a negative or non-numeric amount', async () => {
    const user = await createUser();
    await assert.rejects(
      () => simulateBudget(user.id, { month: MONTH, proposedBudget: -1, proposedIncome: 100 }),
      { name: 'TypeError', message: 'Proposed budget must be a non-negative number' },
    );
    await assert.rejects(
      () => simulateBudget(user.id, { month: MONTH, proposedBudget: 100, proposedIncome: 'lots' }),
      { name: 'TypeError', message: 'Proposed income must be a non-negative number' },
    );
  });

  test('refuses a planned purchase in a category that does not exist', async () => {
    const user = await createUser();
    await assert.rejects(
      () => simulatePurchase(user.id, {
        month: MONTH,
        purchaseAmount: 500,
        category_id: '00000000-0000-4000-8000-000000000000',
      }),
      { status: 400, message: 'Choose a valid category' },
    );
  });
});

describe('budget recommendation service: edge cases', () => {
  test('has no recommendation when there is spending history but no income', async () => {
    const user = await createUser();
    const categoryId = await firstCategoryId();
    for (const months of [3, 2, 1]) {
      await query(
        `INSERT INTO expenses (user_id, category_id, amount, spent_on) VALUES ($1, $2, 1000, $3)`,
        [user.id, categoryId, monthsAgo(months)],
      );
    }

    const result = await recommendBudgets(user.id);

    assert.equal(result.available, false);
    assert.equal(result.reason, 'Income history is required before recommending budgets');
    assert.equal(result.total_monthly_income, 0);
    assert.equal(result.total_recommended_budget, 0);
    assert.deepEqual(result.categories, []);
  });
});
