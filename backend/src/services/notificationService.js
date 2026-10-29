
import { withUser } from '../db/userScope.js';

const ALERT_NOTIFICATION_TYPES = {
  80: 'budget_warning',
  100: 'budget_exceeded',
};

/**
 * Save budget alerts as notifications.
 * The database unique constraint on (user_id, dedupe_key)
 * prevents duplicate notifications for the same threshold.
 */
export async function createBudgetNotifications(userId, alerts) {
  if (!Array.isArray(alerts) || alerts.length === 0) {
    return [];
  }

  return withUser(userId, async (db) => {
    const created = [];

    for (const alert of alerts) {
      const threshold = Number(alert.threshold);
      const type = ALERT_NOTIFICATION_TYPES[threshold];

      if (!type || !alert.budget_id) {
        continue;
      }

      const category = alert.category_name || 'Overall budget';
      const dedupeKey = `budget:${alert.budget_id}:${threshold}`;
      const message = `${category}: ${alert.message}`;

      const result = await db.query(
        `INSERT INTO notifications
          (user_id, type, message, dedupe_key)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, dedupe_key) DO NOTHING
         RETURNING id, type, message, is_read, created_at`,
        [userId, type, message.slice(0, 255), dedupeKey],
      );

      if (result.rows[0]) {
        created.push(result.rows[0]);
      }
    }

    return created;
  });
}

/**
 * List notifications for the logged-in user.
 * Set unreadOnly to true to return unread notifications only.
 */
export async function listNotifications(userId, unreadOnly = false) {
  return withUser(userId, async (db) => {
    const result = await db.query(
      `SELECT id, type, message, is_read, created_at
       FROM notifications
       WHERE user_id = $1
         AND ($2::boolean = false OR is_read = false)
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId, unreadOnly],
    );

    return result.rows;
  });
}

/**
 * Mark one of the logged-in user's notifications as read.
 */
export async function markNotificationRead(userId, notificationId) {
  return withUser(userId, async (db) => {
    const result = await db.query(
      `UPDATE notifications
       SET is_read = true
       WHERE id = $1 AND user_id = $2
       RETURNING id, type, message, is_read, created_at`,
      [notificationId, userId],
    );

    return result.rows[0] || null;
  });
}

/**
 * Create reminders for recurring payments due within the next 3 days, and a
 * follow-up for a payment whose due date has passed without being marked paid
 * (UC-07 10a-10b). Paid cycles and duplicate reminders are excluded, so each
 * cycle gets at most one reminder and one follow-up.
 */
export async function createPaymentReminders(userId, today) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `SELECT id, amount, cycle, next_due_date::text AS due_date
       FROM recurring_expenses
       WHERE user_id = $1
         AND is_active = true
         AND next_due_date BETWEEN $2::date AND ($2::date + 3)
         AND (
           last_paid_due_date IS NULL
           OR last_paid_due_date < next_due_date
         )
       ORDER BY next_due_date ASC`,
      [userId, today],
    );

    const created = [];

    for (const payment of rows) {
      const dedupeKey = `payment-reminder:${payment.id}:${payment.due_date}`;

      const result = await db.query(
        `INSERT INTO notifications
           (user_id, type, message, dedupe_key)
         VALUES ($1, 'payment_reminder', $2, $3)
         ON CONFLICT (user_id, dedupe_key) DO NOTHING
         RETURNING id, type, message, is_read, created_at`,
        [
          userId,
          `Payment of ${payment.amount} is due on ${payment.due_date}.`,
          dedupeKey,
        ],
      );

      if (result.rows[0]) {
        created.push(result.rows[0]);
      }
    }

    // Only the latest unpaid cycle of each payment gets a follow-up, so a
    // payment added with an old start date does not flood the list.
    const { rows: overdue } = await db.query(
      `SELECT r.id, r.amount, c.name AS category_name,
              MAX(e.spent_on)::text AS due_date
       FROM recurring_expenses r
       JOIN categories c ON c.id = r.category_id
       JOIN expenses e
         ON e.recurring_expense_id = r.id AND e.user_id = r.user_id
       WHERE r.user_id = $1
         AND r.is_active = true
         AND e.spent_on < $2::date
         AND (r.last_paid_due_date IS NULL
              OR e.spent_on > r.last_paid_due_date)
       GROUP BY r.id, r.amount, c.name
       ORDER BY MAX(e.spent_on) ASC`,
      [userId, today],
    );

    for (const payment of overdue) {
      const dedupeKey = `payment-overdue:${payment.id}:${payment.due_date}`;
      const message = `Overdue: your ${payment.category_name} payment of `
        + `${payment.amount} was due on ${payment.due_date}. `
        + 'Mark it as paid to stop these reminders.';

      const result = await db.query(
        `INSERT INTO notifications
           (user_id, type, message, dedupe_key)
         VALUES ($1, 'payment_overdue', $2, $3)
         ON CONFLICT (user_id, dedupe_key) DO NOTHING
         RETURNING id, type, message, is_read, created_at`,
        [userId, message.slice(0, 255), dedupeKey],
      );

      if (result.rows[0]) {
        created.push(result.rows[0]);
      }
    }

    return created;
  });
}


