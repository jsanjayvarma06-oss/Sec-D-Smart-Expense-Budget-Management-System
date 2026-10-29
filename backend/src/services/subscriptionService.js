// Subscription detector (story #90).
//
// Finds repeating payments in the user's own expenses: the same merchant, a
// similar amount, about a week or a month apart, at least 3 times in a row. A
// price rise is the latest charge being more than 5% above the one before it.
// Everything runs inside withUser, so only the logged-in user's rows are read.

import crypto from 'node:crypto';
import { withUser } from '../db/userScope.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const MIN_CHARGES = 3;
// Percentage the latest charge must exceed the previous one by to count as a rise.
export const PRICE_RISE_PERCENT = 5;
// Neighbouring charges count as "a similar amount" when the larger is at most
// this many times the smaller, so a price rise doesn't hide a subscription.
const MAX_AMOUNT_RATIO = 1.5;

const CYCLES = {
  weekly: { minDays: 5, maxDays: 9 },
  monthly: { minDays: 26, maxDays: 35 },
};

const toDay = (date) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
const fromDay = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const toCents = (amount) => Math.round(Number(amount) * 100);
const fromCents = (cents) => (cents / 100).toFixed(2);

// One cycle after `date`. Monthly keeps the day of the month where it can and
// otherwise uses the month's last day (31 Jan → 28 Feb).
export function addCycle(date, cycle) {
  if (cycle === 'weekly') return fromDay(toDay(date) + 7);

  const [year, month, day] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

// The longest run of charges, ending with the latest one, that fits the cycle.
function latestRun(charges, cycle) {
  const { minDays, maxDays } = CYCLES[cycle];
  const run = [charges[charges.length - 1]];

  for (let i = charges.length - 2; i >= 0; i -= 1) {
    const gap = toDay(run[0].spent_on) - toDay(charges[i].spent_on);
    const larger = Math.max(run[0].cents, charges[i].cents);
    const smaller = Math.min(run[0].cents, charges[i].cents);

    if (gap < minDays || gap > maxDays || larger > smaller * MAX_AMOUNT_RATIO) break;
    run.unshift(charges[i]);
  }

  return run;
}

// Pure detection over expense rows ({ merchant, amount, spent_on, category_id,
// category_name }). Exported so the rules can be tested without a database.
export function detectSubscriptions(expenses, today) {
  const byMerchant = new Map();

  for (const expense of expenses) {
    const merchant = String(expense.merchant ?? '').trim();
    if (!merchant) continue;

    const key = merchant.toLowerCase();
    if (!byMerchant.has(key)) byMerchant.set(key, []);
    byMerchant.get(key).push({ ...expense, merchant, cents: toCents(expense.amount) });
  }

  const suggestions = [];

  for (const [key, charges] of byMerchant) {
    if (charges.length < MIN_CHARGES) continue;
    charges.sort((a, b) => a.spent_on.localeCompare(b.spent_on));

    const [cycle, run] = Object.keys(CYCLES)
      .map((name) => [name, latestRun(charges, name)])
      .sort((a, b) => b[1].length - a[1].length)[0];

    if (run.length < MIN_CHARGES) continue;

    const latest = run[run.length - 1];
    const previous = run[run.length - 2];
    let nextExpected = addCycle(latest.spent_on, cycle);

    // Missed a whole cycle after the expected date: probably cancelled.
    if (today > addCycle(nextExpected, cycle)) continue;
    // A charge a few days late: the next one to expect is the following cycle,
    // so "Make recurring" never starts in the past.
    if (nextExpected < today) nextExpected = addCycle(nextExpected, cycle);

    const rose = latest.cents * 100 > previous.cents * (100 + PRICE_RISE_PERCENT);

    suggestions.push({
      merchant_key: key,
      merchant: latest.merchant,
      cycle,
      typical_amount: fromCents(median(run.map((charge) => charge.cents))),
      latest_amount: fromCents(latest.cents),
      charge_count: run.length,
      last_charged_on: latest.spent_on,
      next_expected_date: nextExpected,
      category_id: latest.category_id,
      category_name: latest.category_name,
      price_rise: rose
        ? {
          from_amount: fromCents(previous.cents),
          to_amount: fromCents(latest.cents),
          percent: Math.round(((latest.cents - previous.cents) / previous.cents) * 1000) / 10,
          charged_on: latest.spent_on,
        }
        : null,
    });
  }

  return suggestions.sort((a, b) => a.next_expected_date.localeCompare(b.next_expected_date)
    || a.merchant_key.localeCompare(b.merchant_key));
}

async function loadSubscriptions(db, userId, today) {
  // A little over a year of history is plenty for weekly or monthly patterns.
  const { rows: expenses } = await db.query(
    `SELECT e.merchant, e.amount, e.spent_on::text AS spent_on,
            e.category_id, c.name AS category_name
     FROM expenses e
     JOIN categories c ON c.id = e.category_id
     WHERE e.user_id = $1
       AND e.merchant IS NOT NULL
       AND e.spent_on BETWEEN $2::date - 400 AND $2::date
     ORDER BY e.spent_on, e.created_at`,
    [userId, today],
  );

  // "Make recurring" saves the merchant as the recurring payment's note, so a
  // suggestion that already has one is marked rather than offered again.
  const { rows: recurring } = await db.query(
    `SELECT DISTINCT lower(btrim(note)) AS merchant_key
     FROM recurring_expenses
     WHERE user_id = $1 AND is_active = true AND note IS NOT NULL`,
    [userId],
  );
  const alreadyRecurring = new Set(recurring.map((row) => row.merchant_key));

  return detectSubscriptions(expenses, today).map((suggestion) => ({
    ...suggestion,
    already_recurring: alreadyRecurring.has(suggestion.merchant_key),
  }));
}

export async function findSubscriptions(userId, today) {
  return withUser(userId, (db) => loadSubscriptions(db, userId, today));
}

// Saves a notification for each price rise. The dedupe key holds a hash of the
// merchant and the date of the higher charge, so each rise is reported once.
export async function createPriceRiseNotifications(userId, today) {
  return withUser(userId, async (db) => {
    const subscriptions = await loadSubscriptions(db, userId, today);
    const created = [];

    for (const { merchant, merchant_key: key, price_rise: rise } of subscriptions) {
      if (!rise) continue;

      const merchantHash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
      const message = `${merchant} went up from ${rise.from_amount} to ${rise.to_amount} `
        + `(${rise.percent}% more) on ${rise.charged_on}.`;

      const { rows } = await db.query(
        `INSERT INTO notifications (user_id, type, message, dedupe_key)
         VALUES ($1, 'price_rise', $2, $3)
         ON CONFLICT (user_id, dedupe_key) DO NOTHING
         RETURNING id, type, message, is_read, created_at`,
        [userId, message.slice(0, 255), `price-rise:${merchantHash}:${rise.charged_on}`],
      );

      if (rows[0]) created.push(rows[0]);
    }

    return created;
  });
}
