// Account lockout after repeated failed logins (SR09). The per-IP request limit
// on /api/auth/login is the other half, set up in app.js.
//
// The login endpoint uses these around its password check:
//
//   if (isLocked(user)) throw new HttpError(429, 'Too many failed attempts. Please try again later.');
//   if (!passwordMatches) { await recordFailedLogin(user.id); throw ... }
//   await resetFailedLogins(user.id);
//
// user must include the locked_until column.

import { config } from '../config.js';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';

export function isLocked(user) {
  return Boolean(user.locked_until && user.locked_until > new Date());
}

// Counts consecutive failures and locks the account once the limit is reached.
// A lock that has already expired starts the count again from one.
export async function recordFailedLogin(userId) {
  const { rows } = await query(
    `UPDATE users SET
       failed_login_count = CASE WHEN locked_until <= now() THEN 1
                                 ELSE failed_login_count + 1 END,
       locked_until = CASE WHEN (CASE WHEN locked_until <= now() THEN 1
                                      ELSE failed_login_count + 1 END) >= $2
                           THEN now() + make_interval(mins => $3)
                           ELSE NULL END
     WHERE id = $1
     RETURNING failed_login_count, locked_until`,
    [userId, config.login.maxFailedAttempts, config.login.lockoutMinutes],
  );
  logger.warn('Failed login attempt', {
    userId,
    failedCount: rows[0].failed_login_count,
    locked: rows[0].locked_until !== null,
  });
  return { locked: rows[0].locked_until !== null };
}

export async function resetFailedLogins(userId) {
  await query(`UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1`, [
    userId,
  ]);
}
