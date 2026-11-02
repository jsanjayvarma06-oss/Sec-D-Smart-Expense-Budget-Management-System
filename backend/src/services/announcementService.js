import { pool } from '../db/pool.js';
import { recordAdminAction } from './auditLogService.js';

// Send one announcement to every active user and save its history.
// Notifications, history and audit log are committed or rolled back together.
export async function sendAnnouncement({ adminId, title, message }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // The database function handles the cross-user notification insert.
    const broadcast = await client.query(
      'SELECT public.broadcast_announcement($1) AS recipient_count',
      [message],
    );

    const recipientCount = broadcast.rows[0].recipient_count;

    const announcementResult = await client.query(
      `INSERT INTO announcements (title, message, admin_id, recipient_count)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, message, admin_id, recipient_count, created_at`,
      [title, message, adminId, recipientCount],
    );

    const announcement = announcementResult.rows[0];

    await recordAdminAction(
      {
        adminId,
        action: 'send_announcement',
        details: {
          announcement_id: announcement.id,
          recipient_count: recipientCount,
        },
      },
      client,
    );

    await client.query('COMMIT');
    return announcement;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Return the latest announcements for the admin history screen.
export async function listAnnouncements({ limit = 50 } = {}) {
  const { rows } = await pool.query(
    `SELECT a.id, a.title, a.message, a.admin_id,
            u.name AS admin_name,
            a.recipient_count, a.created_at
     FROM announcements a
     JOIN users u ON u.id = a.admin_id
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT $1`,
    [limit],
  );

  return rows;
}