// Unit test cases UT_01–UT_33 from Documents/04_Test_Plan.pdf (card #56),
// run through the real API. See planHelpers.js for how outcomes are recorded.

import assert from 'node:assert/strict';
import { describe } from 'node:test';
import { useTestDatabase } from '../helpers.js';
import {
  PASSWORD, addExpense, api, app, categoryId, dayInMonth, localDay, money,
  monthOf, monthlyAnalytics, newUser, notImplemented, overallRemaining, planTest,
  query, remaining, request, saveResults, setBudget, thisMonth,
} from './planHelpers.js';

useTestDatabase();
saveResults('unit');

describe('1. User Registration & Login (UC-01)', () => {
  planTest('UT_01', 'Test registration with valid details', async () => {
    const email = `ut01-${Date.now()}@test.com`;
    const reg = await request(app).post('/api/auth/register')
      .send({ name: 'Test User', email, password: PASSWORD }).expect(201);
    assert.equal(reg.body.user.email, email);
    const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie).expect(200);
    assert.equal(me.body.user.name, 'Test User');
    return 'Account created (201). As in UC-01, the app then asks the user to log in; after logging in the dashboard loads for "Test User".';
  });

  planTest('UT_02', 'Test login with a valid account', async () => {
    const user = await newUser();
    const me = await api(user).get('/api/auth/me').expect(200);
    assert.equal(me.body.user.email, user.email);
    return 'Login succeeded (200) with an HttpOnly session cookie; the dashboard data loads for the logged-in user.';
  });

  planTest('UT_03', 'Test login with a wrong password', async () => {
    const user = await newUser();
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'Wrong@999' }).expect(401);
    assert.equal(res.body.error, 'Invalid email or password');
    assert.equal(res.headers['set-cookie'], undefined);
    return `Login refused (401) with "${res.body.error}"; no session cookie set.`;
  });

  planTest('UT_04', 'Test registration with a duplicate email', async () => {
    const user = await newUser();
    const res = await request(app).post('/api/auth/register')
      .send({ name: 'Test User', email: user.email.toUpperCase(), password: PASSWORD }).expect(409);
    assert.match(res.body.error, /already/i);
    return `Registration refused (409) with "${res.body.error}". Same meaning as the planned "Email already registered" but different wording.`;
  });

  planTest('UT_05', 'Test that required fields are validated', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ name: 'Test User', email: '', password: '' }).expect(400);
    assert.ok(res.body.fields.email && res.body.fields.password);
    return `Not submitted (400). Email: "${res.body.fields.email}"; Password: "${res.body.fields.password}". The form also marks both fields required in the browser.`;
  });

  planTest('UT_06', 'Check that the password is not stored in plain text (SR02)', async () => {
    const user = await newUser();
    const { rows } = await query('SELECT password_hash FROM users WHERE email = $1', [user.email]);
    assert.notEqual(rows[0].password_hash, PASSWORD);
    assert.match(rows[0].password_hash, /^\$2[aby]\$12\$/);
    return `Stored value is a bcrypt hash (cost 12, starts "${rows[0].password_hash.slice(0, 7)}…"); the password is not readable.`;
  });
});

describe('2. Income & Expense Records (UC-02, UC-03)', () => {
  planTest('UT_07', 'Test adding a valid expense', async () => {
    const user = await newUser();
    await addExpense(user, { amount: 100, category: 'Food', spent_on: localDay(-1) });
    const created = await addExpense(user, { amount: 450, category: 'Food' });
    const list = (await api(user).get('/api/expenses').expect(200)).body.expenses;
    assert.equal(list[0].id, created.id);
    assert.equal(list[0].amount, '450.00');
    return `Expense of ${money(450)} (Food, today) saved and shown first in the expense list.`;
  });

  planTest('UT_08', 'Test adding an expense with a negative amount', async () => {
    const user = await newUser();
    const res = await api(user).post('/api/expenses', {
      amount: -200, category_id: await categoryId(user, 'Food'), spent_on: localDay(0),
    }).expect(400);
    assert.equal(res.body.fields.amount, 'Amount must be greater than zero');
    return `Refused (400) with "${res.body.fields.amount}".`;
  });

  planTest('UT_09', 'Test adding an expense with a future date', async () => {
    const user = await newUser();
    const res = await api(user).post('/api/expenses', {
      amount: 100, category_id: await categoryId(user, 'Food'), spent_on: localDay(10),
    }).expect(400);
    assert.match(res.body.fields.spent_on, /cannot be in the future/);
    return `Refused (400) with "${res.body.fields.spent_on}".`;
  });

  planTest('UT_10', 'Test editing an existing expense', async () => {
    const user = await newUser();
    const expense = await addExpense(user, { amount: 450, category: 'Food' });
    const before = await monthlyAnalytics(user);
    await api(user).put(`/api/expenses/${expense.id}`, {
      amount: 600, category_id: expense.category_id, spent_on: expense.spent_on,
    }).expect(200);
    const list = (await api(user).get('/api/expenses').expect(200)).body.expenses;
    const after = await monthlyAnalytics(user);
    assert.equal(list[0].amount, '600.00');
    assert.equal(after.total_spent - before.total_spent, 150);
    return `Amount changed ${money(450)} → ${money(600)}; the list shows ${money(600)} and the month's total went from ${money(before.total_spent)} to ${money(after.total_spent)}.`;
  });

  planTest('UT_11', 'Test deleting an expense', async () => {
    const user = await newUser();
    const expense = await addExpense(user, { amount: 600, category: 'Food' });
    await api(user).delete(`/api/expenses/${expense.id}`).expect(204);
    const list = (await api(user).get('/api/expenses').expect(200)).body.expenses;
    const after = await monthlyAnalytics(user);
    assert.equal(list.length, 0);
    assert.equal(after.total_spent, 0);
    return `Deleted (204); the list is empty and the month's total is ${money(after.total_spent)}.`;
  });

  planTest('UT_12', 'Test adding an income record', async () => {
    const user = await newUser();
    const month = thisMonth();
    const before = (await api(user).get(`/api/financial-health?month=${month}`).expect(200)).body.health;
    await api(user).post('/api/income', { amount: 15000, source: 'Part-time job', received_on: localDay(0) }).expect(201);
    const after = (await api(user).get(`/api/financial-health?month=${month}`).expect(200)).body.health;
    assert.equal(after.total_income - before.total_income, 15000);
    assert.equal(after.savings - before.savings, 15000);
    return `Income of ${money(15000)} (Part-time job) saved; the month's income and available balance (savings) both rose by ${money(15000)}.`;
  });

  planTest('UT_13', 'Test the category suggestion (FR05)', async () => {
    const user = await newUser();
    const res = await api(user).post('/api/expenses', { amount: 40, merchant: 'Metro Station', spent_on: localDay(0) });
    assert.equal(res.status, 201, `expense without a category was refused: ${res.status} "${res.body.fields?.category_id ?? res.body.error}"`);
    const categories = (await api(user).get('/api/categories').expect(200)).body.categories;
    const suggested = categories.find((category) => category.id === res.body.expense.category_id);
    assert.equal(suggested?.name, 'Transport');
    assert.equal(res.body.expense.category_suggested, true);

    // A category the user picks is never replaced by the suggestion.
    const food = categories.find((category) => category.name === 'Food');
    const chosen = await api(user).post('/api/expenses', {
      amount: 40, merchant: 'Metro Station', category_id: food.id, spent_on: localDay(0),
    }).expect(201);
    assert.equal(chosen.body.expense.category_id, food.id);
    return `An expense for "Metro Station" with no category was saved (201) under ${suggested.name}, suggested from the merchant name; when the user picked ${food.name} themselves, that was kept.`;
  });
});

describe('3. Budget Management & Alerts (UC-04)', () => {
  planTest('UT_14', 'Test setting a monthly budget', async () => {
    const user = await newUser();
    await setBudget(user, { amount: 10000 });
    const overall = await overallRemaining(user);
    assert.equal(overall.budget_amount, 10000);
    return `Monthly budget of ${money(10000)} saved for ${thisMonth()} and returned by the dashboard's remaining-budget data.`;
  });

  planTest('UT_15', 'Test setting a zero or negative budget', async () => {
    const user = await newUser();
    const zero = await api(user).post('/api/budgets', { month: thisMonth(), amount: 0 }).expect(400);
    await api(user).post('/api/budgets', { month: thisMonth(), amount: -50 }).expect(400);
    assert.match(zero.body.fields.amount, /greater than zero/);
    return `0 and -50 both refused (400) with "${zero.body.fields.amount}".`;
  });

  planTest('UT_16', 'Test setting a category-wise budget', async () => {
    const user = await newUser();
    await setBudget(user, { amount: 10000 });
    await setBudget(user, { amount: 3000, category: 'Food' });
    const rows = await remaining(user);
    const food = rows.find((b) => b.category_name === 'Food');
    assert.equal(food.budget_amount, 3000);
    assert.equal(rows.find((b) => b.category_id === null).budget_amount, 10000);
    return `Food limit of ${money(3000)} saved and tracked as its own row beside the ${money(10000)} monthly budget.`;
  });

  planTest('UT_17', 'Test the remaining budget calculation (FR08)', async () => {
    const user = await newUser();
    await setBudget(user, { amount: 10000 });
    await addExpense(user, { amount: 1500, category: 'Food' });
    await addExpense(user, { amount: 1000, category: 'Transport' });
    const overall = await overallRemaining(user);
    assert.equal(overall.remaining_amount, 7500);
    return `Budget ${money(10000)}, spent ${money(overall.spent_amount)}: remaining shows ${money(overall.remaining_amount)}.`;
  });
});

describe('4. Analytics, Prediction & Anomaly Detection (UC-05)', () => {
  planTest('UT_18', 'Test the pie chart totals by category (FR10)', async () => {
    const user = await newUser();
    await addExpense(user, { amount: 1200, category: 'Food' });
    await addExpense(user, { amount: 800, category: 'Travel' });
    await addExpense(user, { amount: 2000, category: 'Bills' });
    const analytics = await monthlyAnalytics(user);
    const byName = Object.fromEntries(analytics.category_totals.map((c) => [c.category_name, c.total_spent]));
    assert.deepEqual([byName.Food, byName.Travel, byName.Bills], [1200, 800, 2000]);
    assert.equal(analytics.total_spent, 4000);
    return `Category totals Food ${money(1200)}, Travel ${money(800)}, Bills ${money(2000)} match the expense list (total ${money(4000)}). This checks the data behind the pie chart; the chart itself is card #41.`;
  });

  planTest('UT_19', 'Test the monthly trend line chart', async () => {
    const user = await newUser();
    const amounts = [3000, 4500, 6000];
    for (const [i, amount] of amounts.entries()) {
      await addExpense(user, { amount, category: 'Food', spent_on: dayInMonth(2 - i) });
    }
    const totals = [];
    for (let i = 2; i >= 0; i -= 1) totals.push((await monthlyAnalytics(user, monthOf(dayInMonth(i)))).total_spent);
    assert.deepEqual(totals, amounts);
    return `One total per month for the last 3 months: ${totals.map(money).join(', ')}, each correct. This checks the data behind the line chart; the chart itself is card #40.`;
  });

  async function foodHistory(user) {
    for (const amount of [200, 300, 400, 500, 600]) {
      await addExpense(user, { amount, category: 'Food', spent_on: localDay(-2) });
    }
  }

  planTest('UT_20', 'Test that an unusual expense is flagged (FR11)', async () => {
    const user = await newUser();
    await foodHistory(user);
    const expense = await addExpense(user, { amount: 9000, category: 'Food' });
    assert.equal(expense.is_flagged, true);
    assert.ok(expense.anomaly.reason);
    return `${money(9000)} flagged for review: "${expense.anomaly.reason}" (recent average ${money(expense.anomaly.averageAmount)}).`;
  });

  planTest('UT_21', 'Test that a normal expense is not flagged', async () => {
    const user = await newUser();
    await foodHistory(user);
    const expense = await addExpense(user, { amount: 350, category: 'Food' });
    assert.equal(expense.is_flagged, false);
    return `${money(350)} saved normally with no flag.`;
  });

  planTest('UT_22', 'Test the monthly expenditure forecast (FR12)', async () => {
    const user = await newUser();
    for (const [monthsAgo, amount] of [[3, 8000], [2, 8500], [1, 9000]]) {
      await addExpense(user, { amount, category: 'Food', spent_on: dayInMonth(monthsAgo) });
    }
    const forecast = (await api(user).get('/api/forecast/monthly').expect(200)).body.forecast;
    assert.equal(forecast.available, true);
    assert.equal(forecast.forecast, 8500);
    assert.equal(forecast.monthlyTotals.length, 3);
    return `Forecast ${money(forecast.forecast)} for this month, based on ${forecast.monthlyTotals.map((m) => `${m.month.slice(0, 7)}: ${money(m.total_spent)}`).join(', ')}.`;
  });

  planTest('UT_23', 'Test the forecast for a new account with no history', async () => {
    const user = await newUser();
    for (let i = 0; i < 4; i += 1) await addExpense(user, { amount: 100, category: 'Food', spent_on: localDay(-i) });
    const forecast = (await api(user).get('/api/forecast/monthly').expect(200)).body.forecast;
    assert.equal(forecast.available, false);
    assert.equal(forecast.forecast, null);
    return `No forecast; message: "${forecast.reason}".`;
  });
});

describe('5. Savings Goals & Recurring Expenses (UC-06, UC-07)', () => {
  notImplemented('UT_24', 'Test creating a savings goal (FR14)', 'Savings goals are not built yet (#50).');
  notImplemented('UT_25', 'Test the time-to-goal estimate (FR15)', 'Time-to-goal estimate is not built yet (#51).');
  notImplemented('UT_26', 'Test the estimate when nothing is being saved', 'Time-to-goal estimate is not built yet (#51).');

  planTest('UT_27', 'Test creating a recurring expense (FR16)', async () => {
    const user = await newUser();
    const res = await api(user).post('/api/recurring-expenses', {
      amount: 6000, category_id: await categoryId(user, 'Rent'), cycle: 'monthly', start_date: localDay(0),
    }).expect(201);
    const list = (await api(user).get('/api/recurring-expenses').expect(200)).body.recurringExpenses;
    assert.equal(list.length, 1);
    assert.equal(list[0].next_due_date, res.body.recurringExpense.next_due_date);
    return `Monthly Rent of ${money(6000)} saved and listed with next due date ${list[0].next_due_date}.`;
  });

  planTest('UT_28', 'Test that a recurring expense is not created twice in one cycle', async () => {
    const user = await newUser();
    await api(user).post('/api/recurring-expenses', {
      amount: 6000, category_id: await categoryId(user, 'Rent'), cycle: 'monthly', start_date: localDay(0),
    }).expect(201);
    const first = await api(user).post('/api/recurring-expenses/generate-due', { today: localDay(0) }).expect(200);
    const second = await api(user).post('/api/recurring-expenses/generate-due', { today: localDay(0) }).expect(200);
    const { rows } = await query(
      'SELECT count(*)::int AS n FROM expenses WHERE user_id = $1 AND recurring_expense_id IS NOT NULL', [user.id],
    );
    assert.equal(rows[0].n, 1);
    return `First run created ${first.body.generated_count}, a repeat in the same cycle created ${second.body.generated_count}: exactly one entry.`;
  });
});

describe('6. Simulator & Reports (UC-08, UC-10)', () => {
  const purchaseGap = 'The what-if simulator takes a proposed budget and income, not a planned purchase, and gives no affordable/not-affordable verdict (#47, UC-08).';

  planTest('UT_29', 'Test simulating an affordable purchase (FR19)', async () => {
    const user = await newUser();
    await setBudget(user, { amount: 10000 });
    await addExpense(user, { amount: 2500, category: 'Food' });
    const res = await api(user).post('/api/what-if/simulate', { month: thisMonth(), purchaseAmount: 2000, category_id: await categoryId(user, 'Shopping') });
    assert.equal(res.status, 200, `planned purchase refused: ${res.status} "${res.body.error}"`);
    assert.equal(res.body.simulation.affordable, true, 'no affordable verdict in the response');
    return `Remaining after purchase ${money(res.body.simulation.remaining_budget)}; affordable.`;
  }, { gap: purchaseGap });

  planTest('UT_30', 'Test simulating a purchase the user cannot afford', async () => {
    const user = await newUser();
    await setBudget(user, { amount: 10000 });
    await addExpense(user, { amount: 2500, category: 'Food' });
    const res = await api(user).post('/api/what-if/simulate', { month: thisMonth(), purchaseAmount: 40000, category_id: await categoryId(user, 'Shopping') });
    assert.equal(res.status, 200, `planned purchase refused: ${res.status} "${res.body.error}"`);
    assert.equal(res.body.simulation.affordable, false, 'no affordable verdict in the response');
    return `Shortfall ${money(res.body.simulation.shortfall)}; not affordable.`;
  }, { gap: purchaseGap });

  planTest('UT_31', 'Check that a simulation is not saved as a real expense', async () => {
    const user = await newUser();
    await setBudget(user, { amount: 10000 });
    await addExpense(user, { amount: 2500, category: 'Food' });
    const before = await overallRemaining(user);
    const sim = await api(user).post('/api/what-if/simulate', { month: thisMonth(), proposedBudget: 40000, proposedIncome: 15000 }).expect(200);
    const list = (await api(user).get('/api/expenses').expect(200)).body.expenses;
    const after = await overallRemaining(user);
    assert.equal(list.length, 1);
    assert.equal(after.remaining_amount, before.remaining_amount);
    return `Simulation ran (simulated remaining ${money(sim.body.simulation.remaining_budget)}); the expense list still has 1 entry and the real remaining budget stayed ${money(after.remaining_amount)}.`;
  });

  notImplemented('UT_32', 'Test exporting a report (FR20)', 'Report export is not built yet (#54 CSV, #55 PDF).');
  notImplemented('UT_33', 'Test exporting a month with no data', 'Report export is not built yet (#54 CSV, #55 PDF).');
});
