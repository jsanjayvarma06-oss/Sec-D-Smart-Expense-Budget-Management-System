import { withUser } from '../db/userScope.js';

const MINIMUM_MONTHS = 3;

export async function forecastMonthlySpending(userId) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `SELECT
         date_trunc('month', spent_on)::date::text AS month,
         SUM(amount)::numeric(12,2) AS total_spent
       FROM expenses
       WHERE user_id = $1
         AND spent_on >= date_trunc('month', CURRENT_DATE) - INTERVAL '3 months'
         AND spent_on < date_trunc('month', CURRENT_DATE)
       GROUP BY date_trunc('month', spent_on)
       ORDER BY date_trunc('month', spent_on)`,
      [userId],
    );

    const monthlyTotals = rows.map((row) => ({
      month: row.month,
      total_spent: Number(row.total_spent),
    }));

    if (monthlyTotals.length < MINIMUM_MONTHS) {
      return {
        available: false,
        reason: 'At least 3 months of spending history are required',
        monthsOfHistory: monthlyTotals.length,
        forecast: null,
        monthlyTotals,
      };
    }

    const average = monthlyTotals.reduce(
      (sum, item) => sum + item.total_spent,
      0,
    ) / monthlyTotals.length;

    return {
      available: true,
      reason: null,
      monthsOfHistory: monthlyTotals.length,
      forecast: Math.round(average * 100) / 100,
      monthlyTotals,
    };
  });
}
