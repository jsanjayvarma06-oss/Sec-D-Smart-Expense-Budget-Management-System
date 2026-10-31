import { withUser } from '../db/userScope.js';

export async function getMonthlyExpenseReport(userId, month) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `SELECT
         e.spent_on,
         e.merchant,
         c.name AS category_name,
         e.note,
         e.amount
       FROM expenses e
       JOIN categories c ON c.id = e.category_id
       WHERE e.user_id = $1
         AND e.spent_on >= $2::date
         AND e.spent_on < ($2::date + INTERVAL '1 month')
       ORDER BY e.spent_on ASC, e.created_at ASC`,
      [userId, `${month}-01`],
    );

    return rows;
  });
}