// User management for the admin panel (story #113).
// Admins manage accounts and fix problems, never personal finances:
// no function here reads expenses, income, budgets or notes (#114).

import { query } from '../db/pool.js';
import { HttpError } from '../utils/httpError.js';

// Lists and searches users with pagination (#114). Returns account-level fields only.
export async function listUsers({ search = '', page = 1, limit = 20 } = {}) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (safePage - 1) * safeLimit;

  const searchParam = `%${String(search ?? '').trim().toLowerCase()}%`;

  const countResult = await query(
    `SELECT count(*)::int AS total
     FROM users u
     WHERE ($1 = '%%' OR lower(u.email) LIKE $1 OR lower(u.name) LIKE $1)`,
    [searchParam],
  );
  const total = countResult.rows[0]?.total || 0;

  const { rows } = await query(
    `SELECT u.id,
            u.name,
            u.email,
            u.role,
            u.created_at,
            u.last_active_at,
            u.locked_until,
            u.disabled_at,
            count(s.id)::int AS active_sessions,
            CASE
              WHEN u.disabled_at IS NOT NULL THEN 'disabled'
              WHEN u.locked_until > now() THEN 'locked'
              ELSE 'active'
            END AS status
     FROM users u
     LEFT JOIN sessions s
       ON s.user_id = u.id
      AND s.expires_at > now()
     WHERE ($1 = '%%' OR lower(u.email) LIKE $1 OR lower(u.name) LIKE $1)
     GROUP BY u.id
     ORDER BY u.created_at DESC
     LIMIT $2 OFFSET $3`,
    [searchParam, safeLimit, offset],
  );

  return {
    users: rows,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit) || 1,
  };
}

// Unlocks a locked account and resets the failed login count (#115).
export async function unlockUser(userId) {
  const { rows } = await query(
    `UPDATE users
     SET locked_until = NULL,
         failed_login_count = 0
     WHERE id = $1
     RETURNING id, name, email, role`,
    [userId],
  );
  return rows[0] ?? null;
}

// Logs out a user everywhere by terminating all their sessions (#115).
export async function logoutUserEverywhere(userId) {
  const { rowCount } = await query(
    `DELETE FROM sessions WHERE user_id = $1`,
    [userId],
  );
  return { terminated_sessions: rowCount };
}

// Disables an account so it cannot log in, and terminates all its sessions (#115).
// An admin cannot disable their own account.
export async function disableUser(adminId, userId) {
  if (adminId && String(adminId) === String(userId)) {
    throw new HttpError(400, 'An admin cannot disable their own account', {
      code: 'CANNOT_DISABLE_SELF',
    });
  }

  const { rows } = await query(
    `UPDATE users
     SET disabled_at = now()
     WHERE id = $1
     RETURNING id, name, email, role, disabled_at`,
    [userId],
  );

  if (rows[0]) {
    await query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  }

  return rows[0] ?? null;
}

// Re-enables a previously disabled account (#115).
export async function enableUser(userId) {
  const { rows } = await query(
    `UPDATE users
     SET disabled_at = NULL
     WHERE id = $1
     RETURNING id, name, email, role, disabled_at`,
    [userId],
  );
  return rows[0] ?? null;
}
