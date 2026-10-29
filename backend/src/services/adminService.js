// Admin panel (story #109). Admins manage accounts and the system, never
// personal finances: nothing here reads expenses, income, budgets or notes.

import { query } from '../db/pool.js';

// Makes an existing account an admin. Returns null for an unknown email, so the
// command line can refuse it instead of creating anything.
export async function promoteToAdmin(email) {
  const { rows } = await query(
    `UPDATE users SET role = 'admin'
     WHERE lower(email) = lower($1)
     RETURNING id, name, email, role`,
    [String(email ?? '').trim()],
  );
  return rows[0] ?? null;
}

// Counts for the admin home screen. Counts only, no names or emails.
export async function getAdminOverview() {
  const { rows } = await query(
    `SELECT count(*)::int AS user_count,
            count(*) FILTER (WHERE role = 'admin')::int AS admin_count,
            count(*) FILTER (WHERE locked_until > now())::int AS locked_count
     FROM users`,
  );
  return rows[0];
}
