
import { withUser } from '../db/userScope.js';

// Money is compared in whole paise so a boundary such as exactly 20% saved is
// never missed by floating-point error (4.04 of 5.05 is 0.19999999999999996).
function toPaise(amount) {
  return Math.round(Number(amount) * 100);
}

export async function calculateFinancialHealth(userId, month) {
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

  const monthStart = `${month}-01`;

  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `SELECT
         COALESCE((
           SELECT SUM(amount)
           FROM income
           WHERE user_id = $1
             AND received_on >= $2::date
             AND received_on < ($2::date + INTERVAL '1 month')
         ), 0)::numeric(12,2) AS total_income,
         COALESCE((
           SELECT SUM(amount)
           FROM expenses
           WHERE user_id = $1
             AND spent_on >= $2::date
             AND spent_on < ($2::date + INTERVAL '1 month')
         ), 0)::numeric(12,2) AS total_expenses,
         COALESCE((
           SELECT SUM(amount)
           FROM budgets
           WHERE user_id = $1
             AND month = $2::date
             AND category_id IS NULL
         ), 0)::numeric(12,2) AS overall_budget`,
      [userId, monthStart],
    );

    const income = Number(rows[0].total_income);
    const expenses = Number(rows[0].total_expenses);
    const budget = Number(rows[0].overall_budget);

    const incomePaise = toPaise(income);
    const expensesPaise = toPaise(expenses);
    const budgetPaise = toPaise(budget);
    const savingsPaise = incomePaise - expensesPaise;

    const savings = savingsPaise / 100;
    const savingsRate = incomePaise > 0 ? savingsPaise / incomePaise : null;
    const budgetUsage = budgetPaise > 0 ? expensesPaise / budgetPaise : null;

    let score = 50;
    const reasons = [];

    if (incomePaise <= 0) {
      score -= 10;
      reasons.push('No income was recorded for this month.');
    } else if (savingsPaise * 100 >= 20 * incomePaise) {
      score += 30;
      reasons.push('You saved at least 20% of your income.');
    } else if (savingsPaise * 100 >= 10 * incomePaise) {
      score += 20;
      reasons.push('You saved 10–19.99% of your income.');
    } else if (savingsPaise > 0) {
      score += 10;
      reasons.push('Your income exceeded your expenses.');
    } else {
      score -= 25;
      reasons.push('Your expenses equalled or exceeded your income.');
    }

    if (budgetPaise > 0 && expensesPaise * 100 <= 80 * budgetPaise) {
      score += 20;
      reasons.push('Spending stayed within 80% of your overall budget.');
    } else if (budgetPaise > 0 && expensesPaise <= budgetPaise) {
      score += 10;
      reasons.push('Spending stayed within your overall budget.');
    } else if (budgetPaise > 0) {
      score -= 15;
      reasons.push('Spending exceeded your overall budget.');
    } else {
      reasons.push('No overall budget was set, so budget performance was not scored.');
    }

    score = Math.max(0, Math.min(100, score));

    let rating;
    if (score >= 80) {
      rating = 'Excellent';
    } else if (score >= 65) {
      rating = 'Good';
    } else if (score >= 45) {
      rating = 'Fair';
    } else {
      rating = 'Needs improvement';
    }

    return {
      month,
      score,
      rating,
      total_income: income,
      total_expenses: expenses,
      savings,
      savings_rate: savingsRate === null
        ? null
        : Math.round(savingsRate * 10000) / 100,
      overall_budget: budget,
      budget_usage_rate: budgetUsage === null
        ? null
        : Math.round(budgetUsage * 10000) / 100,
      explanation: reasons,
    };
  });
}
