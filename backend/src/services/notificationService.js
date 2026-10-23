
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
