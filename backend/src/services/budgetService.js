import { withUser } from '../db/userScope.js';

function normalizeMonth(month) {
  return `${month}-01`;
}

function formatBudget(row) {
  if (!row) return row;

  return {
    ...row,
    month: row.month instanceof Date
      ? row.month.toISOString().slice(0, 7)
      : String(row.month).slice(0, 7),
  };
}

async function validateOverallBudget(db, userId, budgetId, amount) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(amount), 0) AS category_total
     FROM budgets
     WHERE user_id = $1
       AND category_id IS NOT NULL
       AND month = (
         SELECT month
         FROM budgets
         WHERE id = $2 AND user_id = $1
       )`,
    [userId, budgetId],
  );

  if (Number(rows[0].category_total) > Number(amount)) {
    return false;
  }

  return true;
}

async function validateCategoryBudget(
  db,
  userId,
  month,
  categoryId,
  amount,
  excludeBudgetId = null,
) {
  const { rows: overallRows } = await db.query(
    `SELECT amount
     FROM budgets
     WHERE user_id = $1
       AND month = $2::date
       AND category_id IS NULL
     FOR UPDATE`,
    [userId, normalizeMonth(month)],
  );

  // An overall budget is optional. If it exists, category budgets
  // must not exceed it in total.
  if (overallRows.length === 0) {
    return true;
  }

  const { rows: categoryRows } = await db.query(
    `SELECT COALESCE(SUM(amount), 0) AS category_total
     FROM budgets
     WHERE user_id = $1
       AND month = $2::date
       AND category_id IS NOT NULL
       AND ($3::uuid IS NULL OR id <> $3::uuid)`,
    [userId, normalizeMonth(month), excludeBudgetId],
  );

  const total = Number(categoryRows[0].category_total) + Number(amount);

  return total <= Number(overallRows[0].amount);
}

export async function listBudgets(userId, month) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `SELECT b.id, b.month, b.category_id,
              c.name AS category_name,
              b.amount, b.created_at, b.updated_at
       FROM budgets b
       LEFT JOIN categories c ON c.id = b.category_id
       WHERE b.user_id = $1
         AND b.month = $2::date
       ORDER BY b.category_id NULLS FIRST, c.name ASC`,
      [userId, normalizeMonth(month)],
    );

    return rows.map(formatBudget);
  });
}

export async function createBudget(userId, budget) {
  return withUser(userId, async (db) => {
    if (budget.category_id) {
      const { rows: categories } = await db.query(
        `SELECT id
         FROM categories
         WHERE id = $1
           AND (user_id IS NULL OR user_id = $2)`,
        [budget.category_id, userId],
      );

      if (categories.length === 0) {
        return { error: 'INVALID_CATEGORY' };
      }

      const { rows: existingRows } = await db.query(
        `SELECT id
         FROM budgets
         WHERE user_id = $1
           AND month = $2::date
           AND category_id = $3`,
        [userId, normalizeMonth(budget.month), budget.category_id],
      );

      const valid = await validateCategoryBudget(
        db,
        userId,
        budget.month,
        budget.category_id,
        budget.amount,
        existingRows[0]?.id ?? null,
      );

      if (!valid) {
        return { error: 'CATEGORY_BUDGETS_EXCEED_OVERALL' };
      }
    } else {
      const { rows: categoryRows } = await db.query(
        `SELECT COALESCE(SUM(amount), 0) AS category_total
         FROM budgets
         WHERE user_id = $1
           AND month = $2::date
           AND category_id IS NOT NULL`,
        [userId, normalizeMonth(budget.month)],
      );

      if (Number(categoryRows[0].category_total) > Number(budget.amount)) {
        return { error: 'CATEGORY_BUDGETS_EXCEED_OVERALL' };
      }
    }

    const { rows } = await db.query(
      `INSERT INTO budgets (user_id, month, category_id, amount)
       VALUES ($1, $2::date, $3, $4)
       ON CONFLICT (user_id, month, category_id)
       DO UPDATE SET
         amount = EXCLUDED.amount,
         updated_at = now()
       RETURNING id, month, category_id, amount,
                 created_at, updated_at`,
      [
        userId,
        normalizeMonth(budget.month),
        budget.category_id ?? null,
        budget.amount,
      ],
    );

    return { budget: formatBudget(rows[0]) };
  });
}

export async function updateBudget(userId, budgetId, amount) {
  return withUser(userId, async (db) => {
    const { rows: currentRows } = await db.query(
      `SELECT id, month, category_id
       FROM budgets
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [budgetId, userId],
    );

    const current = currentRows[0];

    if (!current) {
      return null;
    }

    if (current.category_id === null) {
      const valid = await validateOverallBudget(
        db,
        userId,
        budgetId,
        amount,
      );

      if (!valid) {
        return { error: 'CATEGORY_BUDGETS_EXCEED_OVERALL' };
      }
    } else {
      const month = current.month instanceof Date
        ? current.month.toISOString().slice(0, 7)
        : String(current.month).slice(0, 7);

      const valid = await validateCategoryBudget(
        db,
        userId,
        month,
        current.category_id,
        amount,
        budgetId,
      );

      if (!valid) {
        return { error: 'CATEGORY_BUDGETS_EXCEED_OVERALL' };
      }
    }

    const { rows } = await db.query(
      `UPDATE budgets
       SET amount = $1,
           updated_at = now()
       WHERE id = $2 AND user_id = $3
       RETURNING id, month, category_id, amount,
                 created_at, updated_at`,
      [amount, budgetId, userId],
    );

    return formatBudget(rows[0] ?? null);
  });
}

export async function deleteBudget(userId, budgetId) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `DELETE FROM budgets
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [budgetId, userId],
    );

    return rows.length > 0;
  });
}