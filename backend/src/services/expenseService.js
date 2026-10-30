import { detectUnusualSpending } from './anomalyDetectionService.js';

import { withUser } from '../db/userScope.js';
import { HttpError } from '../utils/httpError.js';
import { findCategoryByName } from './categoryService.js';
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
async function resolveCategory(db, userId, expense, existingCategoryId = null) {
  // A manually selected category always takes priority.
  if (expense.category_id) {
    const { rows } = await db.query(
      `SELECT id
       FROM categories
       WHERE id = $1
         AND (user_id IS NULL OR user_id = $2)
         AND (retired_at IS NULL OR id = $3)`,
      [expense.category_id, userId, existingCategoryId],
    );

    return rows[0]?.id ?? null;
  }

  // Suggest a category from the merchant name if no category was selected.
  const suggestedName = suggestCategoryName(expense.merchant);

  if (!suggestedName) return null;

  const suggested = await findCategoryByName(db, userId, suggestedName);

  return suggested?.id ?? null;
}

// With no category chosen and none to suggest from the merchant, the user has
// to pick one. (A category that was chosen but isn't theirs gets the usual
// "invalid category" answer from the route.)
function noCategoryError() {
  return new HttpError(
    400,
    'Choose a category, or enter a merchant name we can suggest one for',
    { code: 'INVALID_CATEGORY', fields: { category_id: 'Choose a category' } },
  );
}

export async function createExpense(userId, expense) {
  return withUser(userId, async (db) => {
    const categoryId = await resolveCategory(db, userId, expense, current[0].category_id);

    if (!categoryId) {
      if (!expense.category_id) throw noCategoryError();
      return null;
    }

    const detection = await detectUnusualSpending(
      userId,
      expense.amount,
      categoryId,
      db,
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
      // True when the category came from the merchant name, not the user.
      category_suggested: !expense.category_id,
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
    const { rows: current } = await db.query(
      `SELECT amount, category_id, is_flagged
       FROM expenses
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [expenseId, userId],
    );

    if (!current[0]) return null;

    const categoryId = await resolveCategory(db, userId, expense);

    if (!categoryId) {
      if (!expense.category_id) throw noCategoryError();
      return null;
    }

    // Editing is the "fix it" half of the review flow: if the amount or
    // category changed, check the expense again so a corrected typo clears the
    // flag and a new large amount raises one. Edits to the note or date alone
    // keep whatever the user already decided.
    const changed = Math.round(Number(current[0].amount) * 100)
        !== Math.round(Number(expense.amount) * 100)
      || current[0].category_id !== categoryId;

    let isFlagged = current[0].is_flagged;
    let anomaly;

    if (changed) {
      anomaly = await detectUnusualSpending(
        userId,
        expense.amount,
        categoryId,
        db,
        expenseId,
      );
      isFlagged = anomaly.isUnusual;
    }

    const { rows } = await db.query(
      `UPDATE expenses
       SET category_id = $1,
           amount = $2,
           spent_on = $3::date,
           note = $4,
           merchant = $5,
           is_flagged = $6,
           updated_at = now()
       WHERE id = $7 AND user_id = $8
       RETURNING id, category_id, amount, spent_on, note, merchant,
                 is_flagged, created_at, updated_at`,
      [
        categoryId,
        expense.amount,
        expense.spent_on,
        expense.note ?? null,
        expense.merchant ?? null,
        isFlagged,
        expenseId,
        userId,
      ],
    );

    const updated = formatExpense(rows[0] ?? null);
    const extras = {
      ...(anomaly ? { anomaly } : {}),
      category_suggested: !expense.category_id,
    };
    return updated ? { ...updated, ...extras } : updated;
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

export async function dismissExpenseFlag(userId, expenseId) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `UPDATE expenses
       SET is_flagged = false,
           updated_at = now()
       WHERE id = $1
         AND user_id = $2
         AND is_flagged = true
       RETURNING id, category_id, amount, spent_on, note, merchant,
                 is_flagged, created_at, updated_at`,
      [expenseId, userId],
    );

    return formatExpense(rows[0] ?? null);
  });
}




