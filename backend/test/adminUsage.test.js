import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { promoteToAdmin } from '../src/services/adminService.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();

const app = createApp();

async function createAdmin() {
  const admin = await createUser('usage-admin@test.com', 'Usage Admin');
  await promoteToAdmin(admin.email);
  return { admin, cookie: await loginAs(admin) };
}

async function addExpense(userId, categoryId) {
  await query(
    `INSERT INTO expenses (user_id, category_id, amount, spent_on, note)
     VALUES ($1, $2, 12345.67, CURRENT_DATE, 'private test note')`,
    [userId, categoryId],
  );
}

async function builtInCategory(name) {
  const { rows } = await query(
    'SELECT id FROM categories WHERE user_id IS NULL AND lower(name) = lower($1)',
    [name],
  );
  assert.ok(rows[0], `missing built-in category ${name}`);
  return rows[0].id;
}

describe('GET /api/admin/usage (#125, #126)', () => {
  test('requires an admin account', async () => {
    const user = await createUser('ordinary-usage@test.com');
    const cookie = await loginAs(user);

    await request(app).get('/api/admin/usage').expect(401);
    await request(app).get('/api/admin/usage').set('Cookie', cookie).expect(403);
  });

  test('returns 30 days of aggregate counts and suppresses daily groups under five users', async () => {
    const { cookie } = await createAdmin();
    const user = await createUser('single-activity@test.com');
    await loginAs(user);
    await addExpense(user.id, await builtInCategory('Food'));

    const { body } = await request(app).get('/api/admin/usage').set('Cookie', cookie).expect(200);
    const { usage } = body;

    assert.equal(usage.period_days, 30);
    assert.equal(usage.daily.length, 30);
    assert.equal(usage.daily.at(-1).date, new Date().toISOString().slice(0, 10));
    assert.equal(usage.daily.at(-1).signups_suppressed, true);
    assert.equal(usage.daily.at(-1).new_signups, null);
    assert.equal(usage.daily.at(-1).expenses_suppressed, true);
    assert.equal(usage.daily.at(-1).expenses_added, null);
    assert.equal(usage.weekly_active_users, null);
    assert.equal(usage.weekly_active_users_suppressed, true);
  });

  test('shows only categories used by at least five users and safely combines smaller groups', async () => {
    const { cookie } = await createAdmin();
    const food = await builtInCategory('Food');
    const travel = await builtInCategory('Travel');

    for (let index = 0; index < 5; index += 1) {
      const user = await createUser(`food-${index}@test.com`);
      await addExpense(user.id, food);
    }

    for (let index = 0; index < 4; index += 1) {
      const user = await createUser(`travel-${index}@test.com`);
      await addExpense(user.id, travel);
    }

    for (let index = 0; index < 4; index += 1) {
      const user = await createUser(`custom-${index}@test.com`);
      const { rows } = await query(
        'INSERT INTO categories (user_id, name) VALUES ($1, $2) RETURNING id',
        [user.id, 'Private medical detail'],
      );
      await addExpense(user.id, rows[0].id);
    }

    const { body } = await request(app).get('/api/admin/usage').set('Cookie', cookie).expect(200);
    const categories = body.usage.top_categories;

    assert.ok(categories.some((item) => item.category === 'Food' && item.users === 5));
    assert.ok(categories.some((item) => item.category === 'Other' && item.users === 8));
    assert.ok(!categories.some((item) => item.category === 'Travel'));
    assert.doesNotMatch(JSON.stringify(body), /Private medical detail|@test\.com|12345\.67|private test note/);
    assert.doesNotMatch(JSON.stringify(body), /category_id|user_id|email|merchant|amount|note/);
  });

  test('daily metrics expose event counts only after five distinct users contribute', async () => {
    const { cookie } = await createAdmin();
    const food = await builtInCategory('Food');

    for (let index = 0; index < 5; index += 1) {
      const user = await createUser(`daily-${index}@test.com`);
      await loginAs(user);
      await addExpense(user.id, food);
    }

    const { body } = await request(app).get('/api/admin/usage').set('Cookie', cookie).expect(200);
    const today = body.usage.daily.at(-1);

    assert.equal(today.signups_suppressed, false);
    assert.equal(today.new_signups, 6); // five users plus the admin account
    assert.equal(today.expenses_suppressed, false);
    assert.equal(today.expenses_added, 5);
    assert.equal(body.usage.weekly_active_users, 6);
    assert.equal(body.usage.weekly_active_users_suppressed, false);
  });
});
