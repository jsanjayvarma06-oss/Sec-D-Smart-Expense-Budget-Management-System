import { withUser } from '../db/userScope.js';

const MINIMUM_HISTORY = 5;
const UNUSUAL_AMOUNT_MULTIPLIER = 3;

// Pass `db` when already inside withUser (as createExpense is). Opening a second
// connection while holding the first can use up the pool when many requests
// arrive at once, and then every request waits forever.
// Amounts are compared in whole paise, so an amount exactly at the limit is
// never flagged because of floating-point rounding.
function toPaise(amount) {
  return Math.round(Number(amount) * 100);
}

// Pass `excludeExpenseId` when re-checking an expense that is being edited, so
// it is not compared against itself.
export async function detectUnusualSpending(
  userId,
  amount,
  categoryId,
  db = null,
  excludeExpenseId = null,
) {
  if (!db) {
    return withUser(userId, (scoped) => detectUnusualSpending(
      userId,
      amount,
      categoryId,
      scoped,
      excludeExpenseId,
    ));
  }

  const { rows } = await db.query(
    `SELECT amount
     FROM expenses
     WHERE user_id = $1
       AND category_id = $2
       AND is_flagged = false
       AND ($3::uuid IS NULL OR id <> $3::uuid)
     ORDER BY spent_on DESC, created_at DESC
     LIMIT 20`,
    [userId, categoryId, excludeExpenseId],
  );

  const history = rows.map((row) => toPaise(row.amount));

  if (history.length < MINIMUM_HISTORY) {
    return {
      isUnusual: false,
      reason: 'Not enough transaction history',
      historyCount: history.length,
    };
  }

  const totalPaise = history.reduce((sum, value) => sum + value, 0);
  const average = totalPaise / history.length / 100;
  const threshold = average * UNUSUAL_AMOUNT_MULTIPLIER;

  // amount > 3 x average, without dividing: amount x count > 3 x total.
  const isUnusual = toPaise(amount) * history.length
    > UNUSUAL_AMOUNT_MULTIPLIER * totalPaise;

  return {
    isUnusual,
    reason: isUnusual
      ? 'Amount is significantly higher than your recent spending in this category'
      : null,
    averageAmount: Math.round(average * 100) / 100,
    thresholdAmount: Math.round(threshold * 100) / 100,
    historyCount: history.length,
  };
}
