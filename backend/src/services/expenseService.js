
import { withUser } from '../db/userScope.js';

function formatExpense(row) {
  if (!row) {
    return row;
  }

  return {
    ...row,
    spent_on: row.spent_on instanceof Date
      ? row.spent_on.toISOString().slice(0, 10)
      : String(row.spent_on).slice(0, 10),
  };
}

export async function createExpense(userId, expense) {
  return withUser(userId, async (db) => {
    // Only allow default categories or categories owned by this user.
    const categoryResult = await db.query(
      `SELECT id
       FROM categories
       WHERE id = $1
         AND (user_id IS NULL OR user_id = $2)`,
      [expense.category_id, userId],
    );

    if (categoryResult.rows.length === 0) {
      return null;
    }

    const { rows } = await db.query(
      `INSERT INTO expenses
        (user_id, category_id, amount, spent_on, note)
       VALUES ($1, $2, $3, $4::date, $5)
       RETURNING id, category_id, amount, spent_on, note,
                 is_flagged, created_at, updated_at`,
      [
        userId,
        expense.category_id,
        expense.amount,
        expense.spent_on,
        expense.note ?? null,
      ],
    );

    return formatExpense(rows[0]);
  });
}

export async function listExpenses(userId) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `SELECT e.id, e.category_id, c.name AS category_name,
              e.amount, e.spent_on, e.note, e.is_flagged,
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
    const categoryResult = await db.query(
      `SELECT id
       FROM categories
       WHERE id = $1
         AND (user_id IS NULL OR user_id = $2)`,
      [expense.category_id, userId],
    );

    if (categoryResult.rows.length === 0) {
      return null;
    }

    const { rows } = await db.query(
      `UPDATE expenses
       SET category_id = $1,
           amount = $2,
           spent_on = $3::date,
           note = $4
       WHERE id = $5 AND user_id = $6
       RETURNING id, category_id, amount, spent_on, note,
                 is_flagged, created_at, updated_at`,
      [
        expense.category_id,
        expense.amount,
        expense.spent_on,
        expense.note ?? null,
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
