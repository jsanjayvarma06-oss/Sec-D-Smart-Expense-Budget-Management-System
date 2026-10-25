import { withUser } from '../db/userScope.js';

const MINIMUM_HISTORY = 5;
const UNUSUAL_AMOUNT_MULTIPLIER = 3;

export async function detectUnusualSpending(userId, amount, categoryId) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `SELECT amount
       FROM expenses
       WHERE user_id = $1
         AND category_id = $2
         AND is_flagged = false
       ORDER BY spent_on DESC, created_at DESC
       LIMIT 20`,
      [userId, categoryId],
    );

    const history = rows.map((row) => Number(row.amount));

    if (history.length < MINIMUM_HISTORY) {
      return {
        isUnusual: false,
        reason: 'Not enough transaction history',
        historyCount: history.length,
      };
    }

    const average = history.reduce((sum, value) => sum + value, 0)
      / history.length;

    const threshold = average * UNUSUAL_AMOUNT_MULTIPLIER;
    const isUnusual = Number(amount) > threshold;

    return {
      isUnusual,
      reason: isUnusual
        ? 'Amount is significantly higher than your recent spending in this category'
        : null,
      averageAmount: Math.round(average * 100) / 100,
      thresholdAmount: Math.round(threshold * 100) / 100,
      historyCount: history.length,
    };
  });
}
