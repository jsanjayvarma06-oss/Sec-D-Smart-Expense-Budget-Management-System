
import { withUser } from '../db/userScope.js';

// About a year of weekly payments; keeps one request short.
export const MAX_CYCLES_PER_RUN = 60;

function toDateString(value) {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

// `anchorDay` is the day of the month the payment started on. A monthly payment
// that starts on the 31st falls on the last day of shorter months and returns
// to the 31st afterwards (31 Jan, 28 Feb, 31 Mar), instead of drifting to the
// 28th for good.
function nextCycleDate(date, cycle, anchorDay = null) {
  const [year, month, dueDay] = date.split('-').map(Number);

  if (cycle === 'weekly') {
    const next = new Date(Date.UTC(year, month - 1, dueDay + 7));
    return next.toISOString().slice(0, 10);
  }

  if (cycle === 'monthly') {
    // Keep the starting day when possible; otherwise use the month's last day.
    const day = anchorDay ?? dueDay;
    const targetMonth = month;
    const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
    const nextDay = Math.min(day, lastDay);

    return new Date(Date.UTC(year, targetMonth, nextDay))
      .toISOString()
      .slice(0, 10);
  }

  throw new TypeError('Unsupported recurring expense cycle');
}

export async function generateDueRecurringExpenses(userId, today) {
  if (
    typeof today !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(today)
    || Number.isNaN(Date.parse(`${today}T00:00:00Z`))
    || new Date(`${today}T00:00:00Z`).toISOString().slice(0, 10) !== today
  ) {
    throw new TypeError('Today must be a valid YYYY-MM-DD date');
  }

  return withUser(userId, async (db) => {
    const { rows: recurringExpenses } = await db.query(
      `SELECT id, user_id, category_id, amount, cycle,
              start_date::text AS start_date,
              next_due_date::text AS next_due_date, note
       FROM recurring_expenses
       WHERE user_id = $1
         AND is_active = true
         AND next_due_date <= $2::date
       ORDER BY next_due_date ASC
       FOR UPDATE`,
      [userId, today],
    );

    const generated = [];

    for (const recurring of recurringExpenses) {
      let dueDate = toDateString(recurring.next_due_date);
      const anchorDay = Number(recurring.start_date.slice(8, 10));
      let cycles = 0;

      // Generate every overdue cycle, not just the latest one, up to a cap per
      // run. next_due_date is saved below, so the next run carries on from
      // wherever this one stopped.
      while (dueDate <= today && cycles < MAX_CYCLES_PER_RUN) {
        cycles += 1;
        const { rows } = await db.query(
          `INSERT INTO expenses
             (user_id, category_id, amount, spent_on, note,
              recurring_expense_id)
           VALUES ($1, $2, $3, $4::date, $5, $6)
           ON CONFLICT (recurring_expense_id, spent_on)
             WHERE recurring_expense_id IS NOT NULL
           DO NOTHING
           RETURNING id, category_id, amount, spent_on, note,
                     recurring_expense_id, created_at`,
          [
            userId,
            recurring.category_id,
            recurring.amount,
            dueDate,
            recurring.note,
            recurring.id,
          ],
        );

        if (rows[0]) {
          generated.push({
            ...rows[0],
            spent_on: toDateString(rows[0].spent_on),
          });
        }

        dueDate = nextCycleDate(dueDate, recurring.cycle, anchorDay);
      }

      await db.query(
        `UPDATE recurring_expenses
         SET next_due_date = $1::date,
             updated_at = now()
         WHERE id = $2 AND user_id = $3`,
        [dueDate, recurring.id, userId],
      );
    }

    return generated;
  });
}
export async function markRecurringExpensePaid(userId, recurringExpenseId, dueDate) {
  if (
    typeof dueDate !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)
    || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`))
    || new Date(`${dueDate}T00:00:00Z`).toISOString().slice(0, 10) !== dueDate
  ) {
    throw new TypeError('Due date must be a valid YYYY-MM-DD date');
  }

  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `UPDATE recurring_expenses
       SET last_paid_due_date = $1::date,
           updated_at = now()
       WHERE id = $2
         AND user_id = $3
         AND is_active = true
         AND next_due_date > $1::date
         AND EXISTS (
           SELECT 1
           FROM expenses e
           WHERE e.recurring_expense_id = recurring_expenses.id
             AND e.user_id = $3
             AND e.spent_on = $1::date
         )
       RETURNING id, category_id, amount, cycle,
                 next_due_date::text AS next_due_date,
                 last_paid_due_date::text AS last_paid_due_date,
                 is_active`,
      [dueDate, recurringExpenseId, userId],
    );

    if (!rows[0]) return null;

    // The reminders for this cycle, and for any earlier one, are done: mark
    // them read so they stop showing as something to deal with. The date is
    // the last part of their dedupe key.
    await db.query(
      `UPDATE notifications
       SET is_read = true
       WHERE user_id = $1
         AND type IN ('payment_reminder', 'payment_overdue')
         AND is_read = false
         AND split_part(dedupe_key, ':', 2) = $2
         AND split_part(dedupe_key, ':', 3)::date <= $3::date`,
      [userId, recurringExpenseId, dueDate],
    );

    return rows[0];
  });
}



// `today` is the user's own date (YYYY-MM-DD); it defaults to the server's.
//
// unpaid_due_date is the most recent cycle whose expense has been created but
// not marked paid. It is overdue (UC-07 10a) once that date is before today,
// so a payment that fell due today is still shown as simply unpaid.
export async function listRecurringExpenses(userId, today = null) {
  const asOf = today ?? new Date().toISOString().slice(0, 10);

  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `SELECT r.id, r.category_id, c.name AS category_name,
              r.amount, r.cycle, r.start_date::text AS start_date,
              r.next_due_date::text AS next_due_date, r.note,
              r.is_active,
              r.last_paid_due_date::text AS last_paid_due_date,
              CASE WHEN r.is_active THEN (
                SELECT MAX(e.spent_on)::text
                FROM expenses e
                WHERE e.recurring_expense_id = r.id
                  AND e.user_id = r.user_id
                  AND e.spent_on <= $2::date
                  AND (r.last_paid_due_date IS NULL
                       OR e.spent_on > r.last_paid_due_date)
              ) END AS unpaid_due_date
       FROM recurring_expenses r
       JOIN categories c ON c.id = r.category_id
       WHERE r.user_id = $1
       ORDER BY r.is_active DESC, r.next_due_date ASC`,
      [userId, asOf],
    );

    return rows.map((row) => ({
      ...row,
      is_overdue: row.unpaid_due_date !== null && row.unpaid_due_date < asOf,
    }));
  });
}

export async function createRecurringExpense(userId, data) {
  return withUser(userId, async (db) => {
    const { rows: categories } = await db.query(
      `SELECT id FROM categories
       WHERE id = $1
         AND (user_id IS NULL OR user_id = $2)`,
      [data.category_id, userId],
    );

    if (!categories[0]) return null;

    const { rows } = await db.query(
      `INSERT INTO recurring_expenses
         (user_id, category_id, amount, cycle, start_date,
          next_due_date, note)
       VALUES ($1, $2, $3, $4, $5::date, $5::date, $6)
       RETURNING id, category_id, amount, cycle,
                 start_date::text AS start_date,
                 next_due_date::text AS next_due_date,
                 note, is_active`,
      [
        userId,
        data.category_id,
        data.amount,
        data.cycle,
        data.start_date,
        data.note ?? null,
      ],
    );

    return rows[0];
  });
}
