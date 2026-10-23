import { detectUnusualSpending } from './anomalyDetectionService.js';

import { withUser } from '../db/userScope.js';
import { suggestCategoryName } from './merchantCategoryService.js';

function formatExpense(row) {
  if (!row) return row;

  return {
    ...row,
    spent_on: row.spent_on instanceof Date
      ? row.spent_on.toISOString().slice(0, 10)
      : String(row.spent_on).slice(0, 10),
  };
}

// Resolve the category while respecting the user's manual selection.
async function resolveCategory(db, userId, expense) {
  // A manually selected category always takes priority.
  if (expense.category_id) {
    const { rows } = await db.query(
      `SELECT id
       FROM categories
       WHERE id = $1
         AND (user_id IS NULL OR user_id = $2)`,
      [expense.category_id, userId],
    );

    return rows[0]?.id ?? null;
  }

  // Suggest a category from the merchant name if no category was selected.
  const suggestedName = suggestCategoryName(expense.merchant);

  if (!suggestedName) return null;

  const { rows } = await db.query(
    `SELECT id
     FROM categories
     WHERE lower(name) = lower($1)
       AND (user_id IS NULL OR user_id = $2)
     ORDER BY CASE WHEN user_id IS NULL THEN 0 ELSE 1 END
     LIMIT 1`,
    [suggestedName, userId],
  );

  return rows[0]?.id ?? null;
}

export async function createExpense(userId, expense) {
  return withUser(userId, async (db) => {
    const categoryId = await resolveCategory(db, userId, expense);

    if (!categoryId) return null;

    const detection = await detectUnusualSpending(
      userId,
      expense.amount,
      categoryId,
    );

    const { rows } = await db.query(
      `INSERT INTO expenses
        (user_id, category_id, amount, spent_on, note, merchant, is_flagged)
       VALUES ($1, $2, $3, $4::date, $5, $6, $7)
       RETURNING id, category_id, amount, spent_on, note, merchant,
                 is_flagged, created_at, updated_at`,
      [
        userId,
        categoryId,
        expense.amount,
        expense.spent_on,
        expense.note ?? null,
        expense.merchant ?? null,
        detection.isUnusual,
      ],
    );

    return {
      ...formatExpense(rows[0]),
      anomaly: detection,
    };
  });
}
export async function listExpenses(userId) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `SELECT e.id, e.category_id, c.name AS category_name,
              e.amount, e.spent_on, e.note, e.merchant, e.is_flagged,
              e.created_at, e.updated_at
       FROM expenses e
       JOIN categories c ON c.id = e.category_id
       WHERE e.user_id = $1
       ORDER BY e.spent_on DESC, e.created_at DESC`,
      [userId],
    );

    return rows.map(formatExpense);
  });
}

export async function updateExpense(userId, expenseId, expense) {
  return withUser(userId, async (db) => {
    const categoryId = await resolveCategory(db, userId, expense);

    if (!categoryId) return null;

    const { rows } = await db.query(
      `UPDATE expenses
       SET category_id = $1,
           amount = $2,
           spent_on = $3::date,
           note = $4,
           merchant = $5,
           updated_at = now()
       WHERE id = $6 AND user_id = $7
       RETURNING id, category_id, amount, spent_on, note, merchant,
                 is_flagged, created_at, updated_at`,
      [
        categoryId,
        expense.amount,
        expense.spent_on,
        expense.note ?? null,
        expense.merchant ?? null,
        expenseId,
        userId,
      ],
    );

    return formatExpense(rows[0] ?? null);
  });
}

export async function deleteExpense(userId, expenseId) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `DELETE FROM expenses
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [expenseId, userId],
    );

    return rows.length > 0;
  });
}



