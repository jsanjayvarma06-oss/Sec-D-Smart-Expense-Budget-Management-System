
import { withUser } from '../db/userScope.js';

function validateMonth(month) {
  if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
    throw new TypeError('Month must use YYYY-MM format');
  }

  const [year, monthNumber] = month.split('-').map(Number);

  if (year < 1900 || monthNumber < 1 || monthNumber > 12) {
    throw new TypeError('Enter a valid month');
  }

  return `${month}-01`;
}

function previousMonthStart(monthStart) {
  const date = new Date(`${monthStart}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Analytics interface for financial reporting.
 * All queries are scoped to the authenticated user.
 */
export class IAnalyticsService {
  async getMonthlyAnalytics(_userId, _month) {
    throw new Error('getMonthlyAnalytics must be implemented');
  }
}

export class AnalyticsService extends IAnalyticsService {
  async getMonthlyAnalytics(userId, month) {
    const monthStart = validateMonth(month);
    const previousStart = previousMonthStart(monthStart);

    return withUser(userId, async (db) => {
      const totals = await db.query(
        `SELECT
           COALESCE(SUM(amount), 0)::numeric(12, 2) AS total_spent,
           COUNT(*)::integer AS transaction_count
         FROM expenses
         WHERE user_id = $1
           AND spent_on >= $2::date
           AND spent_on < ($2::date + INTERVAL '1 month')`,
        [userId, monthStart],
      );

      const previousTotals = await db.query(
        `SELECT
           COALESCE(SUM(amount), 0)::numeric(12, 2) AS total_spent,
           COUNT(*)::integer AS transaction_count
         FROM expenses
         WHERE user_id = $1
           AND spent_on >= $2::date
           AND spent_on < ($2::date + INTERVAL '1 month')`,
        [userId, previousStart],
      );

      const categoryTotals = await db.query(
        `SELECT
           e.category_id,
           c.name AS category_name,
           COALESCE(SUM(e.amount), 0)::numeric(12, 2) AS total_spent,
           COUNT(*)::integer AS transaction_count
         FROM expenses e
         JOIN categories c ON c.id = e.category_id
         WHERE e.user_id = $1
           AND e.spent_on >= $2::date
           AND e.spent_on < ($2::date + INTERVAL '1 month')
         GROUP BY e.category_id, c.name
         ORDER BY SUM(e.amount) DESC, c.name ASC`,
        [userId, monthStart],
      );

      const dailyTotals = await db.query(
        `SELECT
           spent_on::text AS date,
           SUM(amount)::numeric(12, 2) AS total_spent,
           COUNT(*)::integer AS transaction_count
         FROM expenses
         WHERE user_id = $1
           AND spent_on >= $2::date
           AND spent_on < ($2::date + INTERVAL '1 month')
         GROUP BY spent_on
         ORDER BY spent_on ASC`,
        [userId, monthStart],
      );

      const totalSpent = Number(totals.rows[0].total_spent);
      const previousSpent = Number(previousTotals.rows[0].total_spent);

      let percentageChange = null;

      if (previousSpent > 0) {
        percentageChange = Math.round(
          ((totalSpent - previousSpent) / previousSpent) * 10000,
        ) / 100;
      } else if (totalSpent > 0) {
        percentageChange = null;
      } else {
        percentageChange = 0;
      }

      return {
        month,
        total_spent: totalSpent,
        transaction_count: totals.rows[0].transaction_count,
        previous_month: {
          month: previousStart.slice(0, 7),
          total_spent: previousSpent,
          transaction_count: previousTotals.rows[0].transaction_count,
        },
        percentage_change: percentageChange,
        category_totals: categoryTotals.rows.map((row) => ({
          ...row,
          total_spent: Number(row.total_spent),
        })),
        daily_totals: dailyTotals.rows.map((row) => ({
          ...row,
          total_spent: Number(row.total_spent),
        })),
      };
    });
  }
}
