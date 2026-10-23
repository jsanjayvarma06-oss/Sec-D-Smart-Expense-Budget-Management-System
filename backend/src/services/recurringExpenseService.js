
import { withUser } from '../db/userScope.js';

function toDateString(value) {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

function nextCycleDate(date, cycle) {
  const [year, month, day] = date.split('-').map(Number);

  if (cycle === 'weekly') {
    const next = new Date(Date.UTC(year, month - 1, day + 7));
    return next.toISOString().slice(0, 10);
  }

  if (cycle === 'monthly') {
    // Keep the day when possible; otherwise use the month's last day.
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

      // Generate every overdue cycle, not just the latest one.
      while (dueDate <= today) {
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

        dueDate = nextCycleDate(dueDate, recurring.cycle);
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
