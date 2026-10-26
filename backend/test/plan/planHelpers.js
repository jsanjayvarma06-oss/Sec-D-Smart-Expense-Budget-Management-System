// Helpers for the automated versions of Documents/04_Test_Plan.pdf.
//
// Each case is a test named after its ID. It returns a short description of
// what actually happened, which is saved with its outcome to
// backend/test-results/ and turned into Documents/07_Test_Results.md by
// `npm run test:plan -w backend`.
//
// Outcomes:
//   pass             the expected result happened
//   fail             it did not (the test run fails)
//   known gap        a `gap` case: it runs and records what happened, but a
//                    known difference from the plan does not fail the build
//   not implemented  the feature has not been built, so the case is not run

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { query } from '../../src/db/pool.js';

const resultsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-results');

export const app = createApp({ loginRateLimit: 100_000, apiRateLimit: 100_000, passwordResetRateLimit: 100_000 });
export const PASSWORD = 'Test@1234';

const results = [];

export function planTest(id, title, fn, { gap } = {}) {
  test(`${id} ${title}`, gap ? { todo: gap } : {}, async (t) => {
    const entry = { id, outcome: 'fail', actual: '', note: gap ?? '' };
    results.push(entry);
    try {
      entry.actual = (await fn(t)) ?? '';
      entry.outcome = 'pass';
    } catch (err) {
      entry.actual = `${err.message.split('\n')[0]}`;
      if (gap) entry.outcome = 'known gap';
      throw err;
    }
  });
}

export function notImplemented(id, title, reason) {
  results.push({ id, outcome: 'not implemented', actual: '', note: reason });
  test(`${id} ${title}`, { skip: reason }, () => {});
}

export function saveResults(name) {
  after(() => {
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(path.join(resultsDir, `${name}.json`), JSON.stringify(results, null, 2));
  });
}

// Dates as the server sees them (expense dates are checked in server-local time).
export function localDay(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

// A date in the month `monthsAgo` months before this one.
export function dayInMonth(monthsAgo, dayOfMonth = 10) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  d.setDate(dayOfMonth);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

export const thisMonth = () => localDay(0).slice(0, 7);
export const monthOf = (date) => date.slice(0, 7);

let counter = 0;

// Registers and logs in through the real API, as a user would.
export async function newUser(name = 'Test User') {
  const email = `plan-${Date.now()}-${(counter += 1)}@test.com`;
  const reg = await request(app).post('/api/auth/register').send({ name, email, password: PASSWORD });
  if (reg.status !== 201) throw new Error(`register failed: ${reg.status}`);
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  if (login.status !== 200) throw new Error(`login failed: ${login.status}`);
  const cookie = login.headers['set-cookie'].find((c) => c.startsWith('sid=')).split(';')[0];
  return { email, cookie, id: login.body.user.id, name };
}

export const api = (user) => ({
  get: (url) => request(app).get(url).set('Cookie', user.cookie),
  post: (url, body) => request(app).post(url).set('Cookie', user.cookie).send(body),
  put: (url, body) => request(app).put(url).set('Cookie', user.cookie).send(body),
  patch: (url, body) => request(app).patch(url).set('Cookie', user.cookie).send(body),
  delete: (url) => request(app).delete(url).set('Cookie', user.cookie),
});

export async function categoryId(user, name) {
  const res = await api(user).get('/api/categories').expect(200);
  const list = res.body.categories ?? res.body;
  const found = list.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (found) return found.id;
  const created = await api(user).post('/api/categories', { name }).expect(201);
  return (created.body.category ?? created.body).id;
}

export async function addExpense(user, { amount, category, spent_on = localDay(0), merchant, note }) {
  const category_id = await categoryId(user, category);
  const res = await api(user).post('/api/expenses', { amount, category_id, spent_on, merchant, note });
  if (res.status !== 201) throw new Error(`expense ${amount} ${category} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.expense;
}

export async function setBudget(user, { amount, category, month = thisMonth() }) {
  const body = { month, amount };
  if (category) body.category_id = await categoryId(user, category);
  const res = await api(user).post('/api/budgets', body);
  if (res.status !== 201) throw new Error(`budget failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.budget;
}

export async function remaining(user, month = thisMonth()) {
  const res = await api(user).get(`/api/budgets/remaining?month=${month}`).expect(200);
  return res.body.remainingBudgets;
}

export async function overallRemaining(user, month = thisMonth()) {
  return (await remaining(user, month)).find((b) => b.category_id === null);
}

export async function monthlyAnalytics(user, month = thisMonth()) {
  return (await api(user).get(`/api/analytics/monthly?month=${month}`).expect(200)).body.analytics;
}

export { query, request };

export const money = (n) => {
  const value = Number(n);
  const text = Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${value < 0 ? '−' : ''}₹${text}`;
};
