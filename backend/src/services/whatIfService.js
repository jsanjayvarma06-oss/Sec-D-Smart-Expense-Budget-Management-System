import { withUser } from '../db/userScope.js';
import { forecastMonthlySpending } from './forecastService.js';

function validateMonth(month) {
  if (typeof month !== 'string' || !/^\\d{4}-\\d{2}$/.test(month)) {
    throw new TypeError('Month must use YYYY-MM format');
  }
  const [year, monthNumber] = month.split('-').map(Number);
  if (year < 1900 || monthNumber < 1 || monthNumber > 12) {
    throw new TypeError('Enter a valid month');
  }
  return `${month}-01`;
}

function validateAmount(amount, fieldName, { allowZero = true } = {}) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) {
    throw new TypeError(`${fieldName} must be a ${allowZero ? 'non-negative' : 'positive'} number`);
  }
  return Math.round(value * 100) / 100;
}

export async function simulateBudget(userId, { month, proposedBudget, proposedIncome }) {
  const monthStart = validateMonth(month);
  const budget = validateAmount(proposedBudget, 'Proposed budget');
  const income = validateAmount(proposedIncome, 'Proposed income');

  const [spendingResult, forecast] = await Promise.all([
    withUser(userId, async (db) => {
      const { rows } = await db.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS total_spent,
                COUNT(*)::integer AS transaction_count
         FROM expenses
         WHERE user_id = $1
           AND spent_on >= $2::date
           AND spent_on < ($2::date + INTERVAL '1 month')`,
        [userId, monthStart],
      );
      return { totalSpent: Number(rows[0].total_spent), transactionCount: rows[0].transaction_count };
    }),
    forecastMonthlySpending(userId),
  ]);

  const totalSpent = spendingResult.totalSpent;
  const remainingBudget = Math.round((budget - totalSpent) * 100) / 100;
  const savings = Math.round((income - totalSpent) * 100) / 100;
  const forecastRemaining = forecast.available
    ? Math.round((budget - forecast.forecast) * 100) / 100
    : null;

  return {
    month, current_spending: totalSpent, transaction_count: spendingResult.transactionCount,
    proposed_budget: budget, proposed_income: income, remaining_budget: remainingBudget,
    budget_exceeded: remainingBudget < 0, projected_savings: savings,
    savings_rate: income > 0 ? Math.round((savings / income) * 10000) / 100 : null,
    spending_forecast: forecast.forecast, forecast_available: forecast.available,
    forecast_reason: forecast.reason, forecast_remaining_budget: forecastRemaining,
    forecast_exceeds_budget: forecastRemaining === null ? null : forecastRemaining < 0,
  };
}

// A planned purchase is evaluated against the user's saved overall monthly
// budget and spending. It is deliberately read-only: no expense is inserted.
export async function simulatePurchase(userId, { month, purchaseAmount, category_id: categoryId }) {
  const monthStart = validateMonth(month);
  const amount = validateAmount(purchaseAmount, 'Purchase amount', { allowZero: false });

  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `SELECT
         COALESCE(MAX(b.amount) FILTER (WHERE b.category_id IS NULL), 0)::numeric(12,2) AS budget_amount,
         COALESCE(SUM(e.amount), 0)::numeric(12,2) AS total_spent,
         COUNT(e.id)::integer AS transaction_count
       FROM budgets b
       FULL OUTER JOIN expenses e
         ON e.user_id = b.user_id
        AND e.spent_on >= $2::date
        AND e.spent_on < ($2::date + INTERVAL '1 month')
       WHERE COALESCE(b.user_id, e.user_id) = $1
         AND (b.month = $3::date OR b.month IS NULL)
         AND (b.category_id IS NULL OR b.id IS NULL)`,
      [userId, monthStart, monthStart],
    );

    // Query separately to avoid a budget/expense join multiplying sums.
    const budgetResult = await db.query(
      `SELECT amount::numeric(12,2) AS amount FROM budgets
       WHERE user_id = $1 AND month = $2::date AND category_id IS NULL
       LIMIT 1`,
      [userId, monthStart],
    );
    const spendingResult = await db.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS amount,
              COUNT(*)::integer AS transaction_count
       FROM expenses
       WHERE user_id = $1
         AND spent_on >= $2::date
         AND spent_on < ($2::date + INTERVAL '1 month')`,
      [userId, monthStart],
    );

    if (categoryId) {
      const category = await db.query(
        'SELECT id FROM categories WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)',
        [categoryId, userId],
      );
      if (category.rows.length === 0) {
        const error = new TypeError('Choose a valid category');
        error.status = 400;
        throw error;
      }
    }

    const budget = Number(budgetResult.rows[0]?.amount ?? 0);
    const spent = Number(spendingResult.rows[0].amount);
    const remainingBeforePurchase = Math.round((budget - spent) * 100) / 100;
    const remainingBudget = Math.round((remainingBeforePurchase - amount) * 100) / 100;
    const shortfall = Math.max(0, Math.round((amount - remainingBeforePurchase) * 100) / 100);

    return {
      month,
      purchase_amount: amount,
      budget_amount: budget,
      current_spending: spent,
      transaction_count: spendingResult.rows[0].transaction_count,
      remaining_before_purchase: remainingBeforePurchase,
      remaining_budget: remainingBudget,
      affordable: shortfall === 0,
      shortfall,
    };
  });
}
