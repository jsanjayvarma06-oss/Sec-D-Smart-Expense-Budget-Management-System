// Two-factor login with an authenticator app (story #103, cards #104, #105, #106).
//
// Setup makes a new secret, stores it encrypted as "pending" and returns its QR
// code once. Nothing is turned on until the user types a valid code from their
// app, which proves the app was set up correctly. Starting setup again replaces
// the pending secret, so an old QR code stops working.
// Ten single-use backup codes are generated and shown once at setup (#105).

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

// Generates 10 single-use backup codes (8 characters, XXXX-XXXX).
export function generateBackupCodes() {
  const codes = [];
  for (let i = 0; i < 10; i++) {
    const raw = crypto.randomBytes(4).toString('hex').toLowerCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

// Stores SHA-256 hashes of backup codes for a user.
export async function storeBackupCodes(userId, codes, runQuery = query) {
  await runQuery(`DELETE FROM two_factor_backup_codes WHERE user_id = $1`, [userId]);
  for (const code of codes) {
    const clean = code.replace(/[\s-]/g, '').toLowerCase();
    const hash = crypto.createHash('sha256').update(clean).digest('hex');
    await runQuery(
      `INSERT INTO two_factor_backup_codes (user_id, code_hash) VALUES ($1, $2)`,
      [userId, hash],
    );
  }
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

// Helper to return string-compatible result with attached backup_codes property
function makeSetupResult(status, backupCodes = []) {
  const obj = new String(status);
  obj.status = status;
  obj.backup_codes = backupCodes;
  return obj;
}

// 'enabled', 'invalid_code', 'no_setup' (setup not started) or 'already_enabled'.
export async function confirmTwoFactorSetup(userId, code, now = Date.now()) {
  const { rows } = await query(
    `SELECT two_factor_pending_secret, two_factor_enabled_at FROM users WHERE id = $1`,
    [userId],
  );
  const user = rows[0];
  if (!user) return makeSetupResult('no_setup');
  if (user.two_factor_enabled_at) return makeSetupResult('already_enabled');
  if (!user.two_factor_pending_secret) return makeSetupResult('no_setup');

  if (!verifyTotp(decryptSecret(user.two_factor_pending_secret), code, now)) {
    return makeSetupResult('invalid_code');
  }

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

  if (rowCount !== 1) return makeSetupResult('no_setup');

  const backupCodes = generateBackupCodes();
  await storeBackupCodes(userId, backupCodes, query);

  return makeSetupResult('enabled', backupCodes);
}

// Verifies a 6-digit TOTP code or single-use backup code (#105).
// Consumed backup codes are marked used and cannot be reused.
export async function verifyTwoFactorOrBackupCode(userId, code, now = Date.now()) {
  const clean = String(code ?? '').trim().replace(/[\s-]/g, '').toLowerCase();
  if (!clean) return false;

  const { rows } = await query(
    `SELECT two_factor_secret, two_factor_enabled_at FROM users WHERE id = $1`,
    [userId],
  );
  const user = rows[0];
  if (!user || !user.two_factor_enabled_at || !user.two_factor_secret) {
    return false;
  }

  // 1. Try 6-digit TOTP
  if (/^\d{6}$/.test(clean)) {
    try {
      const secret = decryptSecret(user.two_factor_secret);
      if (verifyTotp(secret, clean, now)) {
        return true;
      }
    } catch {
      // Ignore decryption failure
    }
  }

  // 2. Try single-use backup code
  const codeHash = crypto.createHash('sha256').update(clean).digest('hex');
  const { rowCount } = await query(
    `UPDATE two_factor_backup_codes
     SET used_at = now()
     WHERE id = (
       SELECT id FROM two_factor_backup_codes
       WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
       LIMIT 1
     )`,
    [userId, codeHash],
  );

  return rowCount === 1;
}

// Turns off two-factor authentication after verifying a current code (#106).
export async function disableTwoFactor(userId, code, now = Date.now()) {
  const { rows } = await query(
    `SELECT two_factor_secret, two_factor_enabled_at FROM users WHERE id = $1`,
    [userId],
  );
  const user = rows[0];
  if (!user || !user.two_factor_enabled_at) return 'not_enabled';

  const valid = await verifyTwoFactorOrBackupCode(userId, code, now);
  if (!valid) return 'invalid_code';

  await query(
    `UPDATE users
     SET two_factor_secret = NULL,
         two_factor_pending_secret = NULL,
         two_factor_enabled_at = NULL
     WHERE id = $1`,
    [userId],
  );
  await query(`DELETE FROM two_factor_backup_codes WHERE user_id = $1`, [userId]);
  return 'disabled';
}

// Regenerates 10 single-use backup codes after verifying a current code (#106).
export async function regenerateBackupCodes(userId, code, now = Date.now()) {
  const { rows } = await query(
    `SELECT two_factor_secret, two_factor_enabled_at FROM users WHERE id = $1`,
    [userId],
  );
  const user = rows[0];
  if (!user || !user.two_factor_enabled_at) return null;

  const valid = await verifyTwoFactorOrBackupCode(userId, code, now);
  if (!valid) return null;

  const newCodes = generateBackupCodes();
  await storeBackupCodes(userId, newCodes, query);
  return newCodes;
}
