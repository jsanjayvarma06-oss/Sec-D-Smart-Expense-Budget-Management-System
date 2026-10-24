
import { withUser } from '../db/userScope.js';
import { forecastMonthlySpending } from './forecastService.js';

function validateMonth(month) {
  if (
    typeof month !== 'string'
    || !/^\d{4}-\d{2}$/.test(month)
  ) {
    throw new TypeError('Month must use YYYY-MM format');
  }

  const [year, monthNumber] = month.split('-').map(Number);

  if (year < 1900 || monthNumber < 1 || monthNumber > 12) {
    throw new TypeError('Enter a valid month');
  }

  return `${month}-01`;
}

function validateAmount(amount, fieldName) {
  const value = Number(amount);

  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${fieldName} must be a non-negative number`);
  }

  return Math.round(value * 100) / 100;
}

export async function simulateBudget(
  userId,
  { month, proposedBudget, proposedIncome },
) {
  const monthStart = validateMonth(month);
  const budget = validateAmount(proposedBudget, 'Proposed budget');
  const income = validateAmount(proposedIncome, 'Proposed income');

  const [spendingResult, forecast] = await Promise.all([
    withUser(userId, async (db) => {
      const { rows } = await db.query(
        `SELECT
           COALESCE(SUM(amount), 0)::numeric(12,2) AS total_spent,
           COUNT(*)::integer AS transaction_count
         FROM expenses
         WHERE user_id = $1
           AND spent_on >= $2::date
           AND spent_on < ($2::date + INTERVAL '1 month')`,
        [userId, monthStart],
      );

      return {
        totalSpent: Number(rows[0].total_spent),
        transactionCount: rows[0].transaction_count,
      };
    }),
    forecastMonthlySpending(userId),
  ]);

  const totalSpent = spendingResult.totalSpent;
  const remainingBudget = Math.round((budget - totalSpent) * 100) / 100;
  const savings = Math.round((income - totalSpent) * 100) / 100;

  return {
    month,
    current_spending: totalSpent,
    transaction_count: spendingResult.transactionCount,
    proposed_budget: budget,
    proposed_income: income,
    remaining_budget: remainingBudget,
    budget_exceeded: remainingBudget < 0,
    projected_savings: savings,
    savings_rate: income > 0
      ? Math.round((savings / income) * 10000) / 100
      : null,
    spending_forecast: forecast.forecast,
    forecast_available: forecast.available,
    forecast_reason: forecast.reason,
  };
}
