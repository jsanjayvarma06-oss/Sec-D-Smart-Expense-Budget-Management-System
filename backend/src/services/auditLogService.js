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
