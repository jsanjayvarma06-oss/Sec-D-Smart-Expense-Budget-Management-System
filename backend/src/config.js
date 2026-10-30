// All settings come from environment variables so secrets stay out of the repo.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

function int(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) throw new Error(`${name} must be a number`);
  return parsed;
}

const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Add it to backend/.env (see README)');
}

// Key that encrypts two-factor secrets in the database (AES-256-GCM): 32 bytes
// written as 64 hex characters. Production must set its own. Development and
// tests fall back to a fixed key so the app runs without setup; secrets
// encrypted with it are only as safe as this repository.
function twoFactorKey() {
  const value = process.env.TWO_FACTOR_KEY;
  if (value) {
    if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error('TWO_FACTOR_KEY must be 64 hex characters');
    return Buffer.from(value, 'hex');
  }
  if (isProduction) throw new Error('TWO_FACTOR_KEY is not set (see README)');
  return Buffer.from('a3f1c2d4e5b6978877665544332211000f1e2d3c4b5a69788796a5b4c3d2e1f0', 'hex');
}

export const config = {
  env,
  isProduction,
  port: int('PORT', 4000),
  databaseUrl: process.env.DATABASE_URL,
  // DATABASE_SSL=require encrypts the API-to-database connection and checks the
  // server's certificate (SR06). Hosted PostgreSQL needs it; a local one doesn't.
  databaseSsl: process.env.DATABASE_SSL === 'require',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  session: {
    cookieName: 'sid',
    idleMinutes: int('SESSION_IDLE_MINUTES', 15),
    maxHours: int('SESSION_MAX_HOURS', 12),
    // Secure cookies need HTTPS, which only production has (SR06).
    secureCookie: isProduction,
  },
  login: {
    maxFailedAttempts: int('LOGIN_MAX_FAILED_ATTEMPTS', 5),
    lockoutMinutes: int('LOGIN_LOCKOUT_MINUTES', 15),
  },
  // Requests per 15 minutes per source (SR09). Raised only for load testing.
  rateLimit: {
    api: int('API_RATE_LIMIT', 300),
    login: int('LOGIN_RATE_LIMIT', 20),
  },
  passwordReset: {
    // Where the reset link in the email points (the web app).
    appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
    expiryMinutes: int('PASSWORD_RESET_MINUTES', 30),
  },
  twoFactor: {
    // Shown as the account name in the authenticator app.
    issuer: 'Smart Expense',
    encryptionKey: twoFactorKey(),
  },
  // Where npm run db:backup writes its files (see scripts/backup.js). The admin
  // health screen reads the time of the newest one.
  backupDir: path.resolve(
    process.env.BACKUP_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../../backups'),
  ),
  mail: {
    // e.g. smtps://user:pass@smtp.example.com. Unset: emails go to mail_outbox.
    smtpUrl: process.env.SMTP_URL || null,
    from: process.env.MAIL_FROM || 'Smart Expense <no-reply@localhost>',
  },
};
