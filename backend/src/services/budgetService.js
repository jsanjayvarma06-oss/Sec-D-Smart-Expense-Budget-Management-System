
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

// Amounts are added and compared in SQL NUMERIC, never as JavaScript numbers,
// so a total like 1000.10 + 0.20 is exactly 1000.30 (NFR04).
async function validateOverallBudget(db, userId, budgetId, amount) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(amount), 0) <= $3::numeric AS fits
     FROM budgets
     WHERE user_id = $1
       AND category_id IS NOT NULL
       AND month = (
         SELECT month
         FROM budgets
         WHERE id = $2 AND user_id = $1
       )`,
    [userId, budgetId, amount],
  );

  return rows[0].fits;
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

  // Category budgets can exist without an overall budget.
  if (overallRows.length === 0) {
    return true;
  }

  const { rows: categoryRows } = await db.query(
    `SELECT COALESCE(SUM(amount), 0) + $4::numeric <= $5::numeric AS fits
     FROM budgets
     WHERE user_id = $1
       AND month = $2::date
       AND category_id IS NOT NULL
       AND ($3::uuid IS NULL OR id <> $3::uuid)`,
    [userId, normalizeMonth(month), excludeBudgetId, amount, overallRows[0].amount],
  );

  return categoryRows[0].fits;
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
           AND (user_id IS NULL OR user_id = $2)
           AND retired_at IS NULL`,
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
        `SELECT COALESCE(SUM(amount), 0) > $3::numeric AS exceeds
         FROM budgets
         WHERE user_id = $1
           AND month = $2::date
           AND category_id IS NOT NULL`,
        [userId, normalizeMonth(budget.month), budget.amount],
      );

      if (categoryRows[0].exceeds) {
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

/**
 * Calculate the amount spent and remaining for every budget in a month.
 *
 * Overall budget:
 *   Includes all of the user's expenses in that month.
 *
 * Category budget:
 *   Includes only expenses assigned to that category.
 *
 * Returns an empty array when the user has no budgets for that month.
 */
// Dates come back from PostgreSQL as 'YYYY-MM-DD' strings (see db/pool.js).
function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function serverToday() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

// Budget pace (story #93): for the current month, project the day each budget
// runs out at the average daily spending so far.
//   pace_status        'on_track' | 'early' | 'exceeded' | 'not_enough_data',
//                      or null for a month that isn't the current one
//   projected_run_out  'YYYY-MM-DD' when the budget runs out before month end
//   days_early         days between that date and the last day of the month
// The first 2 days of a month are too little to project from. `today` is a
// parameter so tests can pin the date.
export async function getRemainingBudget(userId, month, today = serverToday()) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `WITH totals AS (
       SELECT
         b.id AS budget_id,
         b.month,
         b.category_id,
         c.name AS category_name,
         b.amount AS budget_amount,
         COALESCE(SUM(e.amount), 0) AS spent_amount,
         b.amount - COALESCE(SUM(e.amount), 0) AS remaining_amount,
         COALESCE(SUM(e.amount), 0) > b.amount AS exceeded
       FROM budgets b
       LEFT JOIN categories c
         ON c.id = b.category_id
       LEFT JOIN expenses e
         ON e.user_id = b.user_id
        AND e.spent_on >= b.month
        AND e.spent_on < (b.month + INTERVAL '1 month')
        AND (
          b.category_id IS NULL
          OR e.category_id = b.category_id
        )
       WHERE b.user_id = $1
         AND b.month = $2::date
       GROUP BY
         b.id,
         b.month,
         b.category_id,
         c.name,
         b.amount
       ),
       pace AS (
         SELECT t.*,
                ($3::date >= t.month AND $3::date < t.month + INTERVAL '1 month') AS is_current,
                ($3::date - t.month + 1) AS days_elapsed,
                (t.month + INTERVAL '1 month' - INTERVAL '1 day')::date AS month_end
         FROM totals t
       ),
       projected AS (
         SELECT p.*,
                CASE WHEN p.is_current AND p.spent_amount > 0
                     THEN round(p.spent_amount / p.days_elapsed, 2) END AS daily_pace,
                CASE WHEN p.is_current AND p.spent_amount > 0 AND NOT p.exceeded
                     THEN $3::date + ceil(p.remaining_amount / (p.spent_amount / p.days_elapsed))::int END AS run_out
         FROM pace p
       )
       SELECT *,
              CASE
                WHEN NOT is_current THEN NULL
                WHEN exceeded THEN 'exceeded'
                WHEN days_elapsed < 3 THEN 'not_enough_data'
                WHEN run_out IS NOT NULL AND run_out < month_end THEN 'early'
                ELSE 'on_track'
              END AS pace_status
       FROM projected
       ORDER BY category_id NULLS FIRST, category_name ASC`,
      [userId, normalizeMonth(month), today],
    );

    // The subtraction happened in SQL, so converting the exact NUMERIC results
    // to numbers here cannot introduce rounding like 400.19999999999993.
    return rows.map((row) => {
      const early = row.pace_status === 'early';
      return {
        budget_id: row.budget_id,
        month: formatBudget(row).month,
        category_id: row.category_id,
        category_name: row.category_name,
        budget_amount: Number(row.budget_amount),
        spent_amount: Number(row.spent_amount),
        remaining_amount: Number(row.remaining_amount),
        exceeded: row.exceeded,
        pace_status: row.pace_status,
        daily_pace: row.daily_pace === null ? null : Number(row.daily_pace),
        projected_run_out: early ? row.run_out : null,
        days_early: early ? daysBetween(row.run_out, row.month_end) : null,
      };
    });
  });
}
