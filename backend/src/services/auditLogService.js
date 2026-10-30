// Admin audit log (story #122). Every admin route records what the admin did
// through recordAdminAction, before it answers. The table is append-only (see
// migration 010), so entries can't be edited or deleted afterwards.

import { query } from '../db/pool.js';
import { redact } from '../utils/logger.js';

const ACTION_PATTERN = /^[a-z][a-z_]*$/;

// Records one admin action. `action` is a short snake_case name such as
// 'view_overview' or 'unlock_account'; `targetUserId` is the account it was
// done to, if any. `details` must never hold personal finances; anything that
// looks like a credential, email, amount or note is redacted anyway (SR10).
// Pass `db` to record inside the same transaction as the change itself.
export async function recordAdminAction(
  { adminId, action, targetUserId = null, details = {} },
  db = { query },
) {
  if (!adminId) throw new Error('recordAdminAction needs the admin ID');
  if (!ACTION_PATTERN.test(action ?? '')) throw new Error(`Invalid admin action name: ${action}`);

  const { rows } = await db.query(
    `INSERT INTO admin_audit_log (admin_id, action, target_user_id, details)
     VALUES ($1, $2, $3, $4)
     RETURNING id, admin_id, action, target_user_id, details, created_at`,
    [adminId, action, targetUserId, JSON.stringify(redact(details))],
  );
  return rows[0];
}

// The newest entries matching the filters, for the audit log screen (#124).
// `from` and `to` are timestamps; `to` is exclusive, so the screen can ask for
// whole days in the admin's own time zone. Names come from the users table at
// read time, so an account that has since been deleted shows no name. Also
// returns the admins and actions that appear in the log, for the filter lists.
export async function listAdminActions({
  adminId = null, action = null, from = null, to = null, limit = 100,
} = {}) {
  const { rows } = await query(
    `SELECT l.id, l.action, l.details, l.created_at,
            l.admin_id, a.name AS admin_name,
            l.target_user_id, t.name AS target_name, t.email AS target_email
     FROM admin_audit_log l
     LEFT JOIN users a ON a.id = l.admin_id
     LEFT JOIN users t ON t.id = l.target_user_id
     WHERE ($1::uuid IS NULL OR l.admin_id = $1)
       AND ($2::text IS NULL OR l.action = $2)
       AND ($3::timestamptz IS NULL OR l.created_at >= $3)
       AND ($4::timestamptz IS NULL OR l.created_at < $4)
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT $5`,
    [adminId, action, from, to, limit + 1],
  );

  const [admins, actions] = await Promise.all([
    query(
      `SELECT DISTINCT u.id, u.name
       FROM admin_audit_log l JOIN users u ON u.id = l.admin_id
       ORDER BY u.name, u.id`,
    ),
    query('SELECT DISTINCT action FROM admin_audit_log ORDER BY action'),
  ]);

  return {
    entries: rows.slice(0, limit),
    has_more: rows.length > limit,
    admins: admins.rows,
    actions: actions.rows.map((row) => row.action),
  };
}
