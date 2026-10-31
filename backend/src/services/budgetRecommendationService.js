
import { withUser } from '../db/userScope.js';

const MINIMUM_MONTHS = 3;

export async function recommendBudgets(userId) {
  return withUser(userId, async (db) => {
    // Get the user's income received during the last 3 complete months.
    const { rows: incomeRows } = await db.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS total_income
       FROM income
       WHERE user_id = $1
         AND received_on >= date_trunc('month', CURRENT_DATE) - INTERVAL '3 months'
         AND received_on < date_trunc('month', CURRENT_DATE)`,
      [userId],
    );

    // Get spending by category for the same period.
    const { rows: spendingRows } = await db.query(
      `SELECT
         c.id AS category_id,
         c.name AS category_name,
         COUNT(DISTINCT date_trunc('month', e.spent_on))::integer
           AS months_with_spending,
         SUM(e.amount)::numeric(12,2) AS total_spent
       FROM expenses e
       JOIN categories c ON c.id = e.category_id
       WHERE e.user_id = $1
         AND e.spent_on >= date_trunc('month', CURRENT_DATE) - INTERVAL '3 months'
         AND e.spent_on < date_trunc('month', CURRENT_DATE)
       GROUP BY c.id, c.name
       ORDER BY SUM(e.amount) DESC`,
      [userId],
    );

    // The query covers three complete months. Convert the sum to an average
    // monthly income before applying the budget cap (FR13 / #45).
    const totalIncome = Math.round((Number(incomeRows[0].total_income) / MINIMUM_MONTHS) * 100) / 100;
    const categories = spendingRows.map((row) => ({
      category_id: row.category_id,
      category_name: row.category_name,
      months_with_spending: row.months_with_spending,
      average_monthly_spending:
        Math.round((Number(row.total_spent) / MINIMUM_MONTHS) * 100) / 100,
    }));

    const historyMonths = categories.length > 0
      ? Math.max(...categories.map((item) => item.months_with_spending))
      : 0;

    if (historyMonths < MINIMUM_MONTHS) {
      return {
        available: false,
        reason: 'At least 3 months of spending history are required',
        total_monthly_income: totalIncome,
        total_recommended_budget: 0,
        categories: [],
      };
    }

    if (totalIncome <= 0) {
      return {
        available: false,
        reason: 'Income history is required before recommending budgets',
        total_monthly_income: totalIncome,
        total_recommended_budget: 0,
        categories: [],
      };
    }

    // Reserve 10% of income rather than allocating all income to budgets.
    const budgetLimit = Math.round(totalIncome * 0.9 * 100) / 100;
    const totalAverage = categories.reduce(
      (sum, item) => sum + item.average_monthly_spending,
      0,
    );

    const scale = totalAverage > budgetLimit
      ? budgetLimit / totalAverage
      : 1;

    // Work in integer paise so rounding cannot push the total over the cap.
    // Do not fill unused income by padding the final category: each suggestion
    // must remain proportional to that category's observed average spending.
    const budgetLimitPaise = Math.round(budgetLimit * 100);
    let remainingPaise = budgetLimitPaise;
    const recommendations = categories.map((item) => {
      const averagePaise = Math.round(item.average_monthly_spending * 100);
      const recommendedPaise = Math.min(
        Math.round(averagePaise * scale),
        remainingPaise,
      );
      remainingPaise -= recommendedPaise;

      return {
        ...item,
        recommended_monthly_budget: recommendedPaise / 100,
      };
    });
    const allocated = (budgetLimitPaise - remainingPaise) / 100;

    return {
      available: true,
      reason: null,
      total_monthly_income: totalIncome,
      budget_limit: budgetLimit,
      total_recommended_budget: allocated,
      categories: recommendations,
    };
  });
}
