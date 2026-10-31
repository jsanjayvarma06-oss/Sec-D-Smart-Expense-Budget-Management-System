// Session store for the Authentication Service (SR03, SR07).
//
// Sessions live in the database rather than in stateless JWTs, so a token stops
// working the moment the user logs out. Only a SHA-256 hash of each token is
// stored, so a leaked database does not hand out working sessions.
//
// The login endpoint creates a session after checking the password:
//
//   const token = await createSession(user.id);
//   res.cookie(config.session.cookieName, token, {
//     ...sessionCookieOptions(),
//     maxAge: config.session.maxHours * 60 * 60 * 1000,
//   });

import crypto from 'node:crypto';
import { config } from '../config.js';
import { query } from '../db/pool.js';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Starts a session and returns its token. Also clears out the user's sessions
// that have already expired.
export async function createSession(userId) {
  await query(`DELETE FROM sessions WHERE user_id = $1 AND expires_at <= now()`, [userId]);

  const token = crypto.randomBytes(32).toString('base64url');
  await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(hours => $3))`,
    [userId, hashToken(token), config.session.maxHours],
  );
  return token;
}

// Returns the session's user and refreshes its idle timer, or null when the token
// is unknown, logged out, idle past the timeout or past its absolute lifetime.
export async function findSession(token) {
  const tokenHash = hashToken(token);
  const { rows } = await query(
    `UPDATE sessions s SET last_seen_at = now()
     FROM users u
     WHERE s.token_hash = $1
       AND u.id = s.user_id
       AND s.expires_at > now()
       AND s.last_seen_at > now() - make_interval(mins => $2)
     RETURNING u.id, u.name, u.email, u.role,
               u.two_factor_enabled_at IS NOT NULL AS two_factor_enabled`,
    [tokenHash, config.session.idleMinutes],
  );
  if (rows.length === 0) {
    await query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
    return null;
  }
  // Keep a durable activity timestamp for weekly-active-user aggregates.
  // Throttle writes to at most once per minute per account.
  await query(
    `UPDATE users
     SET last_active_at = now()
     WHERE id = $1
       AND (last_active_at IS NULL OR last_active_at < now() - INTERVAL '1 minute')`,
    [rows[0].id],
  );

  // The role is read on every request, so a change takes effect immediately.
  const { id, name, email, role, two_factor_enabled: twoFactorEnabled } = rows[0];
  return { id, name, email, role, two_factor_enabled: twoFactorEnabled };
}

export async function destroySession(token) {
  await query(`DELETE FROM sessions WHERE token_hash = $1`, [hashToken(token)]);
}
