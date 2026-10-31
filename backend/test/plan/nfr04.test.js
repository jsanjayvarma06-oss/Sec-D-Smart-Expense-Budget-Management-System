// NFR04 (card #57): "all figures match a manual calculation over a test set of
// 100 transactions; any mismatch in the totals fails."
//
// test/fixtures/transactions-100.csv holds 12 income records and 88 expenses
// over four months, with amounts chosen to break floating-point arithmetic
// (0.10, 0.20, 199.99, 333.33…). They are entered through the real API, then
// every total the app reports is compared with an independent calculation in
// whole paise.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe } from 'node:test';
import { useTestDatabase } from '../helpers.js';
import {
  addExpense, api, dayInMonth, monthOf, monthlyAnalytics, newUser, planTest,
  remaining, saveResults, setBudget, thisMonth,
} from './planHelpers.js';

useTestDatabase();
saveResults('nfr04');

const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/transactions-100.csv');
const BUDGETS = { overall: '30000.00', Food: '8000.00', Transport: '3000.00' };

const toPaise = (amount) => {
  const [rupees, paise = ''] = String(amount).split('.');
  return Number(rupees) * 100 + Number(paise.padEnd(2, '0'));
};
const fromPaise = (paise) => paise / 100;


function loadTransactions() {
  const content = fs.readFileSync(fixture, 'utf8').trim();

  const [header, ...lines] = content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  const cols = header.split(',').map((column) => column.trim());

  return lines.map((line) => {
    const values = line.split(',').map((value) => value.trim());
    const row = Object.fromEntries(
      values.map((value, index) => [cols[index], value])
    );

    return {
      ...row,
      date: dayInMonth(Number(row.months_ago), Number(row.day)),
      paise: toPaise(row.amount),
    };
  });
}


// The "manual calculation": plain integer sums, no app code involved.
function expectedTotals(transactions) {
  const months = {};
  for (const t of transactions) {
    const m = (months[monthOf(t.date)] ??= { income: 0, expenses: 0, categories: {} });
    if (t.type === 'income') m.income += t.paise;
    else {
      m.expenses += t.paise;
      m.categories[t.category] = (m.categories[t.category] ?? 0) + t.paise;
    }
  }
  return months;
}

describe('NFR04 calculations against 100 transactions', () => {
  planTest('NFR04', 'Verify calculations against a 100-transaction test set', async () => {
    const transactions = loadTransactions();
    assert.equal(transactions.length, 100);
    const user = await newUser('NFR04 User');

    for (const t of transactions) {
      if (t.type === 'income') {
        const response = await api(user).post('/api/income', {
          amount: t.amount,
          source: t.category,
          received_on: t.date,
        });
        
        if (response.status !== 201) {
          throw new Error(
            `Income record rejected: ${JSON.stringify(t)}. API response: ${JSON.stringify(response.body)}`
          );
        } 
      } else {
        await addExpense(user, { amount: t.amount, category: t.category, spent_on: t.date });
      }
    }
    await setBudget(user, { amount: BUDGETS.overall });
    await setBudget(user, { amount: BUDGETS.Food, category: 'Food' });
    await setBudget(user, { amount: BUDGETS.Transport, category: 'Transport' });

    const expected = expectedTotals(transactions);
    let compared = 0;
    const mismatches = [];
    const check = (label, actual, expectedPaise) => {
      compared += 1;
      if (Number(actual) !== fromPaise(expectedPaise)) mismatches.push(`${label}: app ${actual}, expected ${fromPaise(expectedPaise)}`);
    };

    for (const [month, totals] of Object.entries(expected)) {
      const analytics = await monthlyAnalytics(user, month);
      check(`${month} total spent`, analytics.total_spent, totals.expenses);
      for (const [category, paise] of Object.entries(totals.categories)) {
        const row = analytics.category_totals.find((c) => c.category_name === category);
        check(`${month} ${category}`, row?.total_spent, paise);
      }
      const health = (await api(user).get(`/api/financial-health?month=${month}`).expect(200)).body.health;
      check(`${month} income`, health.total_income, totals.income);
      check(`${month} expenses (health score)`, health.total_expenses, totals.expenses);
      check(`${month} savings`, health.savings, totals.income - totals.expenses);
    }

    const current = expected[thisMonth()];
    const budgetRows = await remaining(user);
    const overall = budgetRows.find((b) => b.category_id === null);
    check('this month remaining (overall)', overall.remaining_amount, toPaise(BUDGETS.overall) - current.expenses);
    check('this month spent (overall)', overall.spent_amount, current.expenses);
    for (const category of ['Food', 'Transport']) {
      const row = budgetRows.find((b) => b.category_name === category);
      check(`this month remaining (${category})`, row.remaining_amount, toPaise(BUDGETS[category]) - (current.categories[category] ?? 0));
    }

    const previous = [1, 2, 3].map((m) => expected[monthOf(dayInMonth(m))].expenses);
    const forecast = (await api(user).get('/api/forecast/monthly').expect(200)).body.forecast;
    check('forecast (average of last 3 months)', forecast.forecast, Math.round(previous.reduce((a, b) => a + b, 0) / 3));

    assert.deepEqual(mismatches, [], `${mismatches.length} of ${compared} figures differ:\n${mismatches.join('\n')}`);
    return `100 transactions (12 income, 88 expenses, 4 months) entered through the API. All ${compared} figures matched the hand calculation to the paisa: monthly totals, every category total, income, savings, remaining budgets and the forecast.`;
  });
});
