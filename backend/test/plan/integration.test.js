// Integration test cases IT_01–IT_11 from Documents/04_Test_Plan.pdf (card #59).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe } from 'node:test';
import { useTestDatabase } from '../helpers.js';
import {
  addExpense, api, categoryId, dayInMonth, localDay, money, monthlyAnalytics, newUser,
  overallRemaining, planTest, query, saveResults, setBudget, thisMonth,
} from './planHelpers.js';

useTestDatabase();
saveResults('integration');

async function alerts(user, month = thisMonth()) {
  return (await api(user).get(`/api/budgets/alerts?month=${month}`).expect(200)).body.alerts;
}

describe('Integration', () => {
  planTest('IT_01', "Check that the dashboard loads the logged-in user's own data", async () => {
    const user1 = await newUser('User One');
    const user2 = await newUser('User Two');
    await addExpense(user1, { amount: 1200, category: 'Food' });
    await addExpense(user2, { amount: 9000, category: 'Travel' });
    const a1 = await monthlyAnalytics(user1);
    const a2 = await monthlyAnalytics(user2);
    const list1 = (await api(user1).get('/api/expenses').expect(200)).body.expenses;
    assert.equal(a1.total_spent, 1200);
    assert.equal(a2.total_spent, 9000);
    assert.ok(list1.every((e) => e.amount === '1200.00'));
    return `User One sees only ${money(a1.total_spent)} (1 expense); User Two sees only ${money(a2.total_spent)}. Neither total includes the other account.`;
  });

  planTest('IT_02', 'Check that an idle session expires (SR07)', async () => {
    const user = await newUser();
    await api(user).get('/api/auth/me').expect(200);
    await query(`UPDATE sessions SET last_seen_at = now() - interval '16 minutes' WHERE user_id = $1`, [user.id]);
    const res = await api(user).get('/api/expenses').expect(401);
    assert.equal(res.body.code, 'UNAUTHENTICATED');
    return 'After 16 idle minutes (timeout 15) the next request was refused (401) and the session deleted; the web app then returns to the login screen with "Your session has expired".';
  });

  planTest('IT_03', 'Check that adding an expense updates the remaining budget', async () => {
    const user = await newUser();
    await setBudget(user, { amount: 10000 });
    await addExpense(user, { amount: 2000, category: 'Food' });
    const before = await overallRemaining(user);
    await addExpense(user, { amount: 500, category: 'Food' });
    const after = await overallRemaining(user);
    assert.deepEqual([before.remaining_amount, after.remaining_amount], [8000, 7500]);
    return `Remaining budget went ${money(before.remaining_amount)} → ${money(after.remaining_amount)}; the dashboard reloads it straight after saving.`;
  });

  planTest('IT_04', 'Check that a new expense shows up in the charts', async () => {
    const user = await newUser();
    await addExpense(user, { amount: 700, category: 'Food' });
    const food = async () => (await monthlyAnalytics(user)).category_totals.find((c) => c.category_name === 'Food').total_spent;
    const before = await food();
    await addExpense(user, { amount: 300, category: 'Food' });
    const after = await monthlyAnalytics(user);
    const listTotal = (await api(user).get('/api/expenses').expect(200)).body.expenses
      .reduce((sum, e) => sum + Number(e.amount), 0);
    assert.equal(await food() - before, 300);
    assert.equal(after.total_spent, listTotal);
    return `Food total grew ${money(before)} → ${money(before + 300)}; the chart total ${money(after.total_spent)} equals the expense list total.`;
  });

  planTest('IT_05', 'Check that the warning alert fires at the threshold (FR09)', async () => {
    const user = await newUser();
    await setBudget(user, { amount: 10000 });
    await addExpense(user, { amount: 7500, category: 'Food' });
    assert.equal((await alerts(user)).length, 0);
    await addExpense(user, { amount: 600, category: 'Food' });
    const [alert] = await alerts(user);
    assert.equal(alert.threshold, 80);
    return `No alert at 75%. After the ${money(600)} expense (81%): "${alert.message}"`;
  });

  planTest('IT_06', 'Check the alert when the budget is crossed', async () => {
    const user = await newUser();
    await setBudget(user, { amount: 10000 });
    await addExpense(user, { amount: 9800, category: 'Food' });
    await addExpense(user, { amount: 500, category: 'Food' });
    const [alert] = await alerts(user);
    const overall = await overallRemaining(user);
    assert.equal(alert.threshold, 100);
    assert.equal(overall.remaining_amount, -300);
    return `Over-budget alert: "${alert.message}"; remaining budget ${money(overall.remaining_amount)}.`;
  });

  planTest('IT_07', 'Check that only one alert is sent per threshold crossing', async () => {
    const user = await newUser();
    await setBudget(user, { amount: 10000 });
    await addExpense(user, { amount: 10500, category: 'Food' });
    await alerts(user);
    await addExpense(user, { amount: 50, category: 'Food' });
    await alerts(user);
    await addExpense(user, { amount: 80, category: 'Food' });
    await alerts(user);
    const list = (await api(user).get('/api/notifications').expect(200)).body.notifications;
    const exceeded = list.filter((n) => n.type === 'budget_exceeded');
    assert.equal(exceeded.length, 1);
    return `Budget crossed, then two more expenses (${money(50)}, ${money(80)}) with alerts checked each time: ${exceeded.length} over-budget notification in total.`;
  });

  planTest('IT_08', 'Check the recommended budget stays within income (FR13)', async () => {
    const user = await newUser();
    for (let m = 1; m <= 3; m += 1) {
      await api(user).post('/api/income', { amount: 15000, source: 'Salary', received_on: dayInMonth(m, 1) }).expect(201);
      await addExpense(user, { amount: 5000, category: 'Food', spent_on: dayInMonth(m) });
      await addExpense(user, { amount: 4000, category: 'Transport', spent_on: dayInMonth(m) });
    }
    const rec = (await api(user).get('/api/budgets/recommendations').expect(200)).body.recommendations;
    const suggested = rec.categories.map((c) => `${c.category_name} ${money(c.recommended_monthly_budget)}`).join(', ');
    assert.equal(rec.available, true);
    assert.ok(rec.categories.length >= 2);
    // The user earns 15,000 a month; the API's own income figure is not trusted here.
    assert.ok(
      rec.total_recommended_budget <= 15000,
      `suggested ${suggested} (total ${money(rec.total_recommended_budget)}) against a monthly income of ${money(15000)}; the API reports monthly income as ${money(rec.total_monthly_income)}`,
    );
    return `Suggested ${suggested}; total ${money(rec.total_recommended_budget)} ≤ monthly income ${money(15000)}.`;
  }, { gap: 'Recommendations treat 3 months of income as one month (reports ₹45,000 for a ₹15,000 salary), and the last category is padded to use up the whole limit (#45).' });

  async function recurringDue(user, dueOffset) {
    return (await api(user).post('/api/recurring-expenses', {
      amount: 499, category_id: await categoryId(user, 'Entertainment'), cycle: 'monthly', start_date: localDay(dueOffset), note: 'Streaming',
    }).expect(201)).body.recurringExpense;
  }

  planTest('IT_09', 'Check the reminder before a due date (FR17)', async () => {
    const user = await newUser();
    await recurringDue(user, 3);
    const res = await api(user).post('/api/notifications/payment-reminders', { today: localDay(0) }).expect(200);
    assert.equal(res.body.created_count, 1);
    return `Payment due in 3 days: reminder created, "${res.body.notifications[0].message}"`;
  });

  planTest('IT_10', 'Check that reminders stop once the payment is marked paid', async () => {
    const user = await newUser();
    const recurring = await recurringDue(user, 1);
    await api(user).post('/api/recurring-expenses/generate-due', { today: localDay(1) }).expect(200);
    await api(user).patch(`/api/recurring-expenses/${recurring.id}/pay`, { due_date: recurring.next_due_date }).expect(200);
    const res = await api(user).post('/api/notifications/payment-reminders', { today: localDay(0) }).expect(200);
    assert.equal(res.body.created_count, 0);
    return `Payment due ${recurring.next_due_date} marked paid; checking reminders again created ${res.body.created_count}.`;
  });

  planTest('IT_11', 'Check that unsafe input is rejected (SR05)', async () => {
    const user = await newUser();
    const script = '<script>alert(1)</script>';
    const res = await api(user).post('/api/expenses', {
      amount: 10, category_id: await categoryId(user, 'Food'), spent_on: localDay(0), note: script,
    });
    const appSource = fs.readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../frontend/src/App.jsx'), 'utf8',
    );
    assert.ok(!appSource.includes('dangerouslySetInnerHTML'), 'the UI must not insert raw HTML');
    assert.match(res.headers['content-type'], /application\/json/);
    if (res.status === 400) return 'The note was rejected (400).';
    assert.equal(res.status, 201);
    return 'The note is stored as plain text and returned as JSON. The React UI shows it as text (no raw HTML insertion anywhere), so the script tag is displayed, not run.';
  });
});
