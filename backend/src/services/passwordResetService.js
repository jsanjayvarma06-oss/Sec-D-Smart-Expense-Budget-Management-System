// Password recovery (UC-01 alternate flow 8b). Part of the Authentication
// Service, so it uses the plain pool like sessions and login protection do.
//
// A reset link is single-use, expires after PASSWORD_RESET_MINUTES, and only a
// SHA-256 hash of its token is stored. Using it logs the account out
// everywhere and clears any lockout.

import crypto from 'node:crypto';
import { config } from '../config.js';
import { pool, query } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { sendMail } from './mailService.js';
import { hashPassword } from './passwordService.js';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Creates and emails a reset link when the email belongs to an account; does
// nothing otherwise. Callers give the same reply either way.
export async function requestPasswordReset(email) {
  const { rows } = await query(
    `SELECT id, name, email FROM users WHERE lower(email) = lower($1)`,
    [email],
  );
  const user = rows[0];
  if (!user) return;

  const token = crypto.randomBytes(32).toString('base64url');
  // Only the newest link works.
  await query(
    `DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL`,
    [user.id],
  );
  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(mins => $3))`,
    [user.id, hashToken(token), config.passwordReset.expiryMinutes],
  );

  const link = `${config.passwordReset.appUrl}/reset-password?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Reset your Smart Expense password',
    text: [
      `Hi ${user.name},`,
      '',
      'Someone asked to reset the password for your Smart Expense & Budget account.',
      `Open this link within ${config.passwordReset.expiryMinutes} minutes to choose a new password:`,
      '',
      link,
      '',
      "If you didn't ask for this, you can ignore this email; your password stays the same.",
    ].join('\n'),
  });
  logger.info('Password reset requested', { userId: user.id });
}

// Sets a new password from a valid, unused, unexpired token. Returns false for
// any other token, without saying which check failed.
export async function resetPassword(token, newPassword) {
  const passwordHash = await hashPassword(newPassword);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       FOR UPDATE`,
      [hashToken(token)],
    );
    const reset = rows[0];
    if (!reset) {
      await client.query('ROLLBACK');
      return false;
    }

    await client.query(
      `UPDATE users
       SET password_hash = $1, failed_login_count = 0, locked_until = NULL
       WHERE id = $2`,
      [passwordHash, reset.user_id],
    );
    await client.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [reset.id]);
    await client.query(`DELETE FROM sessions WHERE user_id = $1`, [reset.user_id]);
    await client.query('COMMIT');
    logger.info('Password reset completed', { userId: reset.user_id });
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
