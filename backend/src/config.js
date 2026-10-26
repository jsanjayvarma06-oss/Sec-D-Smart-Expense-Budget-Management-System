// All settings come from environment variables so secrets stay out of the repo.

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
  mail: {
    // e.g. smtps://user:pass@smtp.example.com. Unset: emails go to mail_outbox.
    smtpUrl: process.env.SMTP_URL || null,
    from: process.env.MAIL_FROM || 'Smart Expense <no-reply@localhost>',
  },
};
