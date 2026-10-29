// Two-factor login setup (card #104, story #103).
//
// Setup makes a new secret, stores it encrypted as "pending" and returns its QR
// code once. Nothing is turned on until the user types a valid code from their
// app, which proves the app was set up correctly. Starting setup again replaces
// the pending secret, so an old QR code stops working.

import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { base32Encode, otpauthUrl, verifyTotp } from './totp.js';

const SECRET_BYTES = 20;

// AES-256-GCM, stored as "v1:<iv>:<tag>:<ciphertext>" in base64url.
export function encryptSecret(secret, key = config.twoFactor.encryptionKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), ciphertext].map((part) => (
    typeof part === 'string' ? part : part.toString('base64url')
  )).join(':');
}

export function decryptSecret(stored, key = config.twoFactor.encryptionKey) {
  const [version, iv, tag, ciphertext] = String(stored).split(':');
  if (version !== 'v1') throw new Error('Unknown two-factor secret format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]);
}

// Returns null when two-factor login is already on.
export async function startTwoFactorSetup(userId) {
  const secret = crypto.randomBytes(SECRET_BYTES);
  const { rows } = await query(
    `UPDATE users SET two_factor_pending_secret = $2
     WHERE id = $1 AND two_factor_enabled_at IS NULL
     RETURNING email`,
    [userId, encryptSecret(secret)],
  );
  if (!rows[0]) return null;

  const url = otpauthUrl({ issuer: config.twoFactor.issuer, account: rows[0].email, secret });
  return {
    qr_code: await QRCode.toDataURL(url, { margin: 1, width: 220 }),
    // For typing into the app when the QR code can't be scanned.
    manual_key: base32Encode(secret).match(/.{1,4}/g).join(' '),
  };
}

// 'enabled', 'invalid_code', 'no_setup' (setup not started) or 'already_enabled'.
export async function confirmTwoFactorSetup(userId, code, now = Date.now()) {
  const { rows } = await query(
    `SELECT two_factor_pending_secret, two_factor_enabled_at FROM users WHERE id = $1`,
    [userId],
  );
  const user = rows[0];
  if (!user) return 'no_setup';
  if (user.two_factor_enabled_at) return 'already_enabled';
  if (!user.two_factor_pending_secret) return 'no_setup';

  if (!verifyTotp(decryptSecret(user.two_factor_pending_secret), code, now)) return 'invalid_code';

  // Only the pending secret that was checked can be confirmed, even if setup was
  // restarted in another tab in the meantime.
  const { rowCount } = await query(
    `UPDATE users
     SET two_factor_secret = two_factor_pending_secret,
         two_factor_pending_secret = NULL,
         two_factor_enabled_at = now()
     WHERE id = $1 AND two_factor_pending_secret = $2 AND two_factor_enabled_at IS NULL`,
    [userId, user.two_factor_pending_secret],
  );
  return rowCount === 1 ? 'enabled' : 'no_setup';
}
