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
