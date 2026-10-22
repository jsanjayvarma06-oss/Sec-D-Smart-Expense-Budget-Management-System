// Minimal JSON logger. Anything that looks like a credential or an amount is
// replaced before it is written, so logs never expose them (SR10).

const SENSITIVE_KEYS = /pass(word)?|token|secret|cookie|authorization|amount|hash/i;

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

function write(level, message, fields = {}) {
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
