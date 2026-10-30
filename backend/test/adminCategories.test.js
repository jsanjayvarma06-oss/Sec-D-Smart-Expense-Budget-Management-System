import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool, query } from '../src/db/pool.js';
import { promoteToAdmin } from '../src/services/adminService.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();

const app = createApp();

// These tests add, rename and remove the built-in categories, and the test
// database keeps them between tests (only users are cleared). Put them back
// exactly as they were after each test so other tests still find them.
let snapshot = [];

beforeEach(async () => {
  snapshot = (await query(
    'SELECT id, name, created_at FROM categories WHERE user_id IS NULL',
  )).rows;
});

afterEach(async () => {
  // Users first: their expenses and budgets may point at a category added here.
  await query('DELETE FROM users');
  await query(
    'DELETE FROM categories WHERE user_id IS NULL AND id <> ALL($1::uuid[])',
    [snapshot.map((row) => row.id)],
  );
  for (const row of snapshot) {
    await query(
      `INSERT INTO categories (id, user_id, name, created_at) VALUES ($1, NULL, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [row.id, row.name, row.created_at],
    );
  }
});

async function setupAdmin() {
  const admin = await createUser('admin@test.com', 'Admin User');
  await promoteToAdmin('admin@test.com');
  const cookie = await loginAs(admin);

  return {
    admin,
    cookie,
    list: () => request(app).get('/api/admin/categories').set('Cookie', cookie),
    add: (name) => request(app).post('/api/admin/categories').set('Cookie', cookie).send({ name }),
    rename: (id, name) => request(app).put(`/api/admin/categories/${id}`).set('Cookie', cookie).send({ name }),
    remove: (id) => request(app).delete(`/api/admin/categories/${id}`).set('Cookie', cookie),
  };
}

async function builtIn(name) {
  const { rows } = await query(
    'SELECT id FROM categories WHERE user_id IS NULL AND lower(name) = lower($1)',
    [name],
  );
  return rows[0]?.id;
}

async function entriesBy(adminId) {
  const { rows } = await query(
    'SELECT action, details FROM admin_audit_log WHERE admin_id = $1 ORDER BY id',
    [adminId],
  );
  return rows;
}

describe('Admin: built-in categories (#129)', () => {
  describe('who can use it', () => {
    test('needs a login', async () => {
      await request(app).get('/api/admin/categories').expect(401);
      await request(app).post('/api/admin/categories').send({ name: 'Pets' }).expect(401);
    });

    test('is refused for an ordinary user, and nothing changes', async () => {
      const user = await createUser('user@test.com');
      const cookie = await loginAs(user);
      const food = await builtIn('Food');

      await request(app).get('/api/admin/categories').set('Cookie', cookie).expect(403);
      await request(app).post('/api/admin/categories').set('Cookie', cookie).send({ name: 'Pets' }).expect(403);
      await request(app).put(`/api/admin/categories/${food}`).set('Cookie', cookie).send({ name: 'Meals' }).expect(403);
      await request(app).delete(`/api/admin/categories/${food}`).set('Cookie', cookie).expect(403);

      assert.equal(await builtIn('Pets'), undefined);
      assert.equal(await builtIn('Meals'), undefined);
      assert.ok(await builtIn('Food'));
    });
  });

  describe('listing', () => {
    test('shows the built-in categories and the names the merchant suggestion uses', async () => {
      const { list } = await setupAdmin();
      const { body } = await list().expect(200);

      const names = body.categories.map((category) => category.name);
      assert.equal(names.length, 10);
      assert.ok(names.includes('Food') && names.includes('Other'));
      assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
      assert.ok(body.suggestion_names.includes('Food'));
    });

    test("never includes a user's own categories", async () => {
      const user = await createUser('user@test.com');
      await query(`INSERT INTO categories (user_id, name) VALUES ($1, 'My secret hobby')`, [user.id]);
      const { list } = await setupAdmin();
      const { body } = await list().expect(200);

      assert.ok(!body.categories.some((category) => category.name === 'My secret hobby'));
    });

    test('is recorded in the audit log', async () => {
      const { admin, list } = await setupAdmin();
      await list().expect(200);

      assert.ok((await entriesBy(admin.id)).some((entry) => entry.action === 'view_default_categories'));
    });
  });

  describe('adding', () => {
    test('adds a category that every user then sees', async () => {
      const { add } = await setupAdmin();
      const { body } = await add('  Pet   care ').expect(201);
      assert.equal(body.category.name, 'Pet care');

      const user = await createUser('user@test.com');
      const cookie = await loginAs(user);
      const categories = (await request(app).get('/api/categories').set('Cookie', cookie).expect(200)).body.categories;
      const added = categories.find((category) => category.name === 'Pet care');

      assert.ok(added);
      assert.equal(added.user_id, null);
    });

    test('a user can put an expense in the new category', async () => {
      const { add } = await setupAdmin();
      const { body } = await add('Pet care').expect(201);
      const user = await createUser('user@test.com');
      const cookie = await loginAs(user);

      await request(app).post('/api/expenses').set('Cookie', cookie)
        .send({ amount: 300, category_id: body.category.id, spent_on: '2026-10-05' })
        .expect(201);
    });

    test('refuses a name that already exists, ignoring case', async () => {
      const { admin, add } = await setupAdmin();
      const { body } = await add('FOOD').expect(409);
      assert.equal(body.code, 'CATEGORY_EXISTS');

      // A refused change is not recorded as if it happened.
      assert.ok(!(await entriesBy(admin.id)).some((entry) => entry.action === 'create_default_category'));
    });

    test('refuses an empty or very long name', async () => {
      const { add } = await setupAdmin();
      await add('   ').expect(400);
      await add('x'.repeat(51)).expect(400);
    });

    test('is recorded in the audit log with the name only', async () => {
      const { admin, add } = await setupAdmin();
      await add('Pet care').expect(201);

      const entry = (await entriesBy(admin.id)).find((row) => row.action === 'create_default_category');
      assert.deepEqual(entry.details, { category: 'Pet care' });
    });
  });

  describe('renaming', () => {
    test('renames a category, and expenses keep pointing at it', async () => {
      const { rename } = await setupAdmin();
      const user = await createUser('user@test.com');
      const cookie = await loginAs(user);
      const food = await builtIn('Food');
      await request(app).post('/api/expenses').set('Cookie', cookie)
        .send({ amount: 120, category_id: food, spent_on: '2026-10-05' }).expect(201);

      const { body } = await rename(food, 'Eating out').expect(200);
      assert.equal(body.category.name, 'Eating out');
      assert.equal(body.category.id, food);

      const expenses = (await request(app).get('/api/expenses').set('Cookie', cookie).expect(200)).body.expenses;
      assert.equal(expenses[0].category_id, food);
      assert.equal(expenses[0].category_name, 'Eating out');
    });

    test('allows changing only the letter case of a name', async () => {
      const { rename } = await setupAdmin();
      const { body } = await rename(await builtIn('Food'), 'FOOD').expect(200);
      assert.equal(body.category.name, 'FOOD');
    });

    test('refuses a name another built-in category has', async () => {
      const { rename } = await setupAdmin();
      const { body } = await rename(await builtIn('Food'), 'transport').expect(409);
      assert.equal(body.code, 'CATEGORY_EXISTS');
      assert.ok(await builtIn('Food'));
    });

    test('is refused for an unknown or malformed ID', async () => {
      const { rename } = await setupAdmin();
      await rename('00000000-0000-4000-8000-000000000000', 'Meals').expect(404);
      await rename('not-an-id', 'Meals').expect(404);
    });

    test("cannot rename a user's own category", async () => {
      const user = await createUser('user@test.com');
      const { rows } = await query(
        `INSERT INTO categories (user_id, name) VALUES ($1, 'Mine') RETURNING id`,
        [user.id],
      );
      const { rename } = await setupAdmin();

      await rename(rows[0].id, 'Taken over').expect(404);
      const after = await query('SELECT name FROM categories WHERE id = $1', [rows[0].id]);
      assert.equal(after.rows[0].name, 'Mine');
    });

    test('is recorded in the audit log with the old and new name', async () => {
      const { admin, rename } = await setupAdmin();
      await rename(await builtIn('Food'), 'Eating out').expect(200);

      const entry = (await entriesBy(admin.id)).find((row) => row.action === 'rename_default_category');
      assert.deepEqual(entry.details, { renamed_from: 'Food', renamed_to: 'Eating out' });
    });
  });

  describe('removing', () => {
    test('removes a category nobody uses', async () => {
      const { add, remove, list } = await setupAdmin();
      const { body } = await add('Pet care').expect(201);

      await remove(body.category.id).expect(204);

      assert.equal(await builtIn('Pet care'), undefined);
      assert.ok(!(await list().expect(200)).body.categories.some((c) => c.name === 'Pet care'));
    });

    test('refuses to remove a category that expenses, budgets or recurring payments use', async () => {
      const { remove } = await setupAdmin();
      const user = await createUser('user@test.com');
      const cookie = await loginAs(user);

      for (const [name, use] of [
        ['Food', (id) => request(app).post('/api/expenses').set('Cookie', cookie)
          .send({ amount: 50, category_id: id, spent_on: '2026-10-05' })],
        ['Travel', (id) => request(app).post('/api/budgets').set('Cookie', cookie)
          .send({ month: '2026-10', amount: 5000 }).then(() => request(app).post('/api/budgets')
            .set('Cookie', cookie).send({ month: '2026-10', amount: 1000, category_id: id }))],
        ['Housing', (id) => request(app).post('/api/recurring-expenses').set('Cookie', cookie)
          .send({ category_id: id, amount: 9000, cycle: 'monthly', start_date: '2026-10-30' })],
      ]) {
        const id = await builtIn(name);
        const used = await use(id);
        assert.ok(used.status < 300, `${name}: setup failed with ${used.status}`);

        const { body } = await remove(id).expect(409);
        assert.equal(body.code, 'CATEGORY_IN_USE');
        assert.ok(await builtIn(name), `${name} was removed while in use`);
      }
    });

    test('is refused for an unknown ID, and cannot remove a custom category', async () => {
      const user = await createUser('user@test.com');
      const { rows } = await query(
        `INSERT INTO categories (user_id, name) VALUES ($1, 'Mine') RETURNING id`,
        [user.id],
      );
      const { remove } = await setupAdmin();

      await remove('00000000-0000-4000-8000-000000000000').expect(404);
      await remove('not-an-id').expect(404);
      await remove(rows[0].id).expect(404);
      assert.equal((await query('SELECT 1 FROM categories WHERE id = $1', [rows[0].id])).rowCount, 1);
    });

    test('is recorded in the audit log, and only when it happened', async () => {
      const { admin, add, remove } = await setupAdmin();
      const { body } = await add('Pet care').expect(201);
      await remove(body.category.id).expect(204);
      await remove(await builtIn('Food')).expect(204);
      await remove(await builtIn('Food')).expect(404);

      const removed = (await entriesBy(admin.id)).filter((row) => row.action === 'delete_default_category');
      assert.deepEqual(removed.map((row) => row.details.category), ['Pet care', 'Food']);
    });
  });

  describe('privacy (admins never see personal finances)', () => {
    async function asAdminRole(sql, params = []) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE app_admin');
        return await client.query(sql, params);
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    }

    test('the admin database role cannot read expenses, income, budgets, notes or users', async () => {
      for (const table of [
        'expenses', 'income', 'budgets', 'recurring_expenses', 'notifications', 'savings_goals', 'users',
      ]) {
        await assert.rejects(
          asAdminRole(`SELECT * FROM ${table}`),
          (err) => err.code === '42501',
          `app_admin could read ${table}`,
        );
      }
    });

    test('the admin database role can only touch built-in categories', async () => {
      const user = await createUser('user@test.com');
      await query(`INSERT INTO categories (user_id, name) VALUES ($1, 'Mine')`, [user.id]);

      const seen = await asAdminRole('SELECT name FROM categories WHERE user_id IS NOT NULL');
      assert.equal(seen.rowCount, 0);

      const changed = await asAdminRole(`UPDATE categories SET name = 'x' WHERE user_id IS NOT NULL`);
      assert.equal(changed.rowCount, 0);

      await assert.rejects(
        asAdminRole(`INSERT INTO categories (user_id, name) VALUES ('${user.id}', 'Planted')`),
        (err) => err.code === '42501',
      );
    });

    test('the answers contain only category names, never anyone\'s records', async () => {
      const user = await createUser('user@test.com');
      const cookie = await loginAs(user);
      await request(app).post('/api/expenses').set('Cookie', cookie)
        .send({ amount: 777.77, category_id: await builtIn('Food'), merchant: 'Secret Cafe', note: 'private note', spent_on: '2026-10-05' })
        .expect(201);
      const { list, add, rename } = await setupAdmin();

      const texts = [
        JSON.stringify((await list().expect(200)).body),
        JSON.stringify((await add('Pet care').expect(201)).body),
        JSON.stringify((await rename(await builtIn('Food'), 'Eating out').expect(200)).body),
      ].join(' ');

      for (const secret of ['777.77', 'Secret Cafe', 'private note', 'user@test.com']) {
        assert.ok(!texts.includes(secret), `the admin answers leaked "${secret}"`);
      }
    });
  });
});
