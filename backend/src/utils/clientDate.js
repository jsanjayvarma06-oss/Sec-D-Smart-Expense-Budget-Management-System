import { HttpError } from './httpError.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function isRealDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// The browser sends its own local date so a user in India just after midnight
// gets that day's reminders. It is only trusted within a day of the server's
// date: anything further away could generate future-dated expenses or skip
// months of them.
export function parseClientToday(value, now = new Date()) {
  if (!isRealDate(value)) {
    throw new HttpError(400, 'A valid today date is required (YYYY-MM-DD)', {
      code: 'VALIDATION',
    });
  }

  const serverToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const offset = Math.abs(Date.parse(`${value}T00:00:00Z`) - serverToday);

  if (offset > DAY_MS) {
    throw new HttpError(400, "Today's date must match the current date", {
      code: 'INVALID_TODAY',
    });
  }

  return value;
}

// True when `value` is within `days` of the server's date, in either direction.
export function isWithinDaysOfToday(value, days, now = new Date()) {
  if (!isRealDate(value)) return false;
  const serverToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.abs(Date.parse(`${value}T00:00:00Z`) - serverToday) <= days * DAY_MS;
}
