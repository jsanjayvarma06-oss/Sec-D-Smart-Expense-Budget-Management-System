// Minimal JSON logger. Anything that looks like a credential or an amount is
// replaced before it is written, so logs never expose them (SR10).

const SENSITIVE_KEYS = /pass(word)?|token|secret|cookie|authorization|amount|hash|email|note|merchant|detail/i;

function redact(value, depth = 0) {
  if (value === null || typeof value !== 'object' || depth > 4) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      SENSITIVE_KEYS.test(key) ? '[REDACTED]' : redact(inner, depth + 1),
    ]),
  );
}

// Times of error entries from the last 24 hours, for the admin health screen
// (#121). Kept in memory, so the count starts again when the server restarts.
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TRACKED_ERRORS = 10_000;
const recentErrors = [];

function trackError(now = Date.now()) {
  recentErrors.push(now);
  while (recentErrors.length > MAX_TRACKED_ERRORS || recentErrors[0] < now - DAY_MS) {
    recentErrors.shift();
  }
}

// Number of errors logged in the last 24 hours (or since the server started).
export function errorsInLastDay(now = Date.now()) {
  return recentErrors.filter((time) => time >= now - DAY_MS).length;
}

function write(level, message, fields = {}) {
  if (level === 'error') trackError();
  if (process.env.NODE_ENV === 'test' && level !== 'error') return;
  const entry = { time: new Date().toISOString(), level, message, ...redact(fields) };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const logger = {
  info: (message, fields) => write('info', message, fields),
  warn: (message, fields) => write('warn', message, fields),
  error: (message, fields) => write('error', message, fields),
};

export { redact };
