// System test cases ST_01–ST_06 from Documents/04_Test_Plan.pdf (card #61):
// complete journeys and cross-cutting behaviour.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe } from 'node:test';
import { useTestDatabase } from '../helpers.js';
import {
  PASSWORD, addExpense, api, app, money, monthlyAnalytics, newUser, overallRemaining,
  planTest, request, saveResults, setBudget, thisMonth, localDay,
} from './planHelpers.js';

useTestDatabase();
saveResults('system');

describe('System', () => {
  planTest('ST_01', 'Check that a user cannot reach data pages without logging in (SR01)', async () => {
    const urls = ['/api/expenses', '/api/income', `/api/budgets/remaining?month=${thisMonth()}`,
      `/api/analytics/monthly?month=${thisMonth()}`, '/api/auth/me'];
    for (const url of urls) {
      const res = await request(app).get(url).expect(401);
      assert.deepEqual(Object.keys(res.body).sort(), ['code', 'error']);
    }
    return `With no session, all ${urls.length} data routes answered 401 with no financial data; the web app shows the login screen instead of the dashboard.`;
  });

  planTest('ST_02', "Check a user cannot open another user's expense (SR04)", async () => {
    const user1 = await newUser('User One');
    const user2 = await newUser('User Two');
    const theirs = await addExpense(user2, { amount: 9000, category: 'Travel' });
    const edit = await api(user1).put(`/api/expenses/${theirs.id}`, { amount: 1, category_id: theirs.category_id, spent_on: theirs.spent_on });
    const del = await api(user1).delete(`/api/expenses/${theirs.id}`);
    const list = (await api(user1).get('/api/expenses').expect(200)).body.expenses;
    const still = (await api(user2).get('/api/expenses').expect(200)).body.expenses;
    assert.deepEqual([edit.status, del.status], [404, 404]);
    assert.equal(list.length, 0);
    assert.equal(still[0].amount, '9000.00');
    assert.doesNotMatch(JSON.stringify([edit.body, del.body]), /9000/);
    return `User One using User Two's expense ID: edit 404, delete 404, own list empty; User Two's ${money(9000)} expense is unchanged.`;
  });

  planTest('ST_03', 'Full budget cycle from setting a limit to being alerted', async () => {
    const user = await newUser();
    await setBudget(user, { amount: 5000 });
    const seen = [];
    for (const amount of [2000, 2000, 1500]) {
      await addExpense(user, { amount, category: 'Food' });
      seen.push((await overallRemaining(user)).remaining_amount);
    }
    const alerts = (await api(user).get(`/api/budgets/alerts?month=${thisMonth()}`).expect(200)).body.alerts;
    assert.deepEqual(seen, [3000, 1000, -500]);
    assert.equal(alerts[0].threshold, 100);
    return `Budget ${money(5000)}; remaining after each expense: ${seen.map(money).join(' → ')}; the last entry raised "${alerts[0].message}"`;
  });

  planTest('ST_04', 'Check that the health score reacts to a change in habits (FR18)', async () => {
    const user = await newUser();
    const month = thisMonth();
    await api(user).post('/api/income', { amount: 15000, source: 'Salary', received_on: localDay(0) }).expect(201);
    await setBudget(user, { amount: 10000 });
    await addExpense(user, { amount: 5000, category: 'Food' });
    const before = (await api(user).get(`/api/financial-health?month=${month}`).expect(200)).body.health;
    for (let i = 0; i < 3; i += 1) await addExpense(user, { amount: 5000, category: 'Shopping' });
    const after = (await api(user).get(`/api/financial-health?month=${month}`).expect(200)).body.health;
    assert.ok(after.score < before.score);
    assert.ok(after.explanation.length > 0);
    return `Score ${before.score} (${before.rating}) → ${after.score} (${after.rating}) after ${money(15000)} of extra spending. Reasons: ${after.explanation.join(' ')}`;
  });

  planTest('ST_05', 'Full user journey from registration to export', async () => {
    const email = `st05-${Date.now()}@test.com`;
    await request(app).post('/api/auth/register').send({ name: 'Journey User', email, password: PASSWORD }).expect(201);
    const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
    const user = { cookie: login.headers['set-cookie'][0].split(';')[0] };
    await api(user).post('/api/income', { amount: 15000, source: 'Salary', received_on: localDay(0) }).expect(201);
    for (const amount of [500, 1200, 800]) await addExpense(user, { amount, category: 'Food' });
    await setBudget(user, { amount: 10000 });
    const overall = await overallRemaining(user);
    const analytics = await monthlyAnalytics(user);
    assert.equal(overall.remaining_amount, 7500);
    assert.equal(analytics.total_spent, 2500);
    const exported = await api(user).get(`/api/reports/export?month=${thisMonth()}&format=csv`);
    assert.equal(exported.status, 200, `register, login, income, 3 expenses, budget and dashboard all worked (spent ${money(2500)}, remaining ${money(7500)}), but export answered ${exported.status}`);
    return 'Every step worked and the export matched the dashboard.';
  }, { gap: 'Every step up to the dashboard works; report export is not built yet (#54, #55), so the journey cannot finish.' });

  planTest('ST_06', 'Check that records survive a restart (NFR10)', async () => {
    const port = await freePort();
    let server = await startServer(port);
    const base = `http://localhost:${port}`;
    const user = await newUser();
    for (const amount of [500, 750, 1200, 300, 2250]) await addExpense(user, { amount, category: 'Food' });
    const totalBefore = (await (await fetch(`${base}/api/analytics/monthly?month=${thisMonth()}`, { headers: { Cookie: user.cookie } })).json()).analytics.total_spent;

    await killHard(server);
    server = await startServer(port);
    const res = await fetch(`${base}/api/expenses`, { headers: { Cookie: user.cookie } });
    const list = (await res.json()).expenses;
    const totalAfter = list.reduce((sum, e) => sum + Number(e.amount), 0);
    await killHard(server);
    assert.equal(res.status, 200);
    assert.equal(list.length, 5);
    assert.equal(totalAfter, totalBefore);
    return `5 expenses (total ${money(totalBefore)}) saved; the API was killed and restarted; all 5 were still there, the total was unchanged and the user was still logged in.`;
  });
});

// API process control for ST_06.
const serverPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/server.js');
const running = new Set();
after(() => { for (const child of running) child.kill('SIGKILL'); });

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on('error', reject);
  });
}

async function startServer(port) {
  const child = spawn(process.execPath, [serverPath], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  running.add(child);
  child.on('exit', () => running.delete(child));
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(`http://localhost:${port}/api/health`)).ok) return child; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill('SIGKILL');
  throw new Error('API did not start');
}

function killHard(child) {
  return new Promise((resolve) => { child.once('exit', resolve); child.kill('SIGKILL'); });
}
