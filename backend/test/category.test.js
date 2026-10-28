
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();

const app = createApp();

describe('Category Management API', () => {
  test('lists built-in default categories', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const response = await request(app)
      .get('/api/categories')
      .set('Cookie', cookie)
      .expect(200);

    const names = response.body.categories.map((category) => category.name);

    for (const name of [
      'Food',
      'Transport',
      'Housing',
      'Utilities',
      'Healthcare',
      'Entertainment',
      'Shopping',
      'Education',
      'Travel',
      'Other',
    ]) {
      assert.ok(names.includes(name), `Missing default category: ${name}`);
    }
  });

  test('creates a custom category and normalizes whitespace', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const response = await request(app)
      .post('/api/categories')
      .set('Cookie', cookie)
      .send({ name: '  Pet   Care  ' })
      .expect(201);

    assert.equal(response.body.category.name, 'Pet Care');
    assert.equal(response.body.category.user_id, user.id);
  });

  test('rejects duplicate custom category names', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    await request(app)
      .post('/api/categories')
      .set('Cookie', cookie)
      .send({ name: 'Pet Care' })
      .expect(201);

    const response = await request(app)
      .post('/api/categories')
      .set('Cookie', cookie)
      .send({ name: 'pet care' })
      .expect(409);

    // errorHandler.js returns the code as response.body.code.
    assert.equal(response.body.code, 'CATEGORY_EXISTS');
  });

  test('rejects empty or overly long category names', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    await request(app)
      .post('/api/categories')
      .set('Cookie', cookie)
      .send({ name: '   ' })
      .expect(400);

    await request(app)
      .post('/api/categories')
      .set('Cookie', cookie)
      .send({ name: 'A'.repeat(51) })
      .expect(400);
  });

  test('lists only the current user custom categories plus defaults', async () => {
    const user1 = await createUser('user1@test.com');
    const user2 = await createUser('user2@test.com');
    const cookie1 = await loginAs(user1);
    const cookie2 = await loginAs(user2);

    await request(app)
      .post('/api/categories')
      .set('Cookie', cookie1)
      .send({ name: 'User One Category' })
      .expect(201);

    await request(app)
      .post('/api/categories')
      .set('Cookie', cookie2)
      .send({ name: 'User Two Category' })
      .expect(201);

    const response = await request(app)
      .get('/api/categories')
      .set('Cookie', cookie1)
      .expect(200);

    const names = response.body.categories.map((category) => category.name);

    assert.ok(names.includes('User One Category'));
    assert.ok(!names.includes('User Two Category'));
    assert.ok(names.includes('Food'));
  });

  test('updates a custom category', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const created = await request(app)
      .post('/api/categories')
      .set('Cookie', cookie)
      .send({ name: 'Old Name' })
      .expect(201);

    const response = await request(app)
      .put(`/api/categories/${created.body.category.id}`)
      .set('Cookie', cookie)
      .send({ name: 'New Name' })
      .expect(200);

    assert.equal(response.body.category.name, 'New Name');
  });

  test('refuses to rename a category to a name that already exists', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    await request(app)
      .post('/api/categories')
      .set('Cookie', cookie)
      .send({ name: 'Pet Care' })
      .expect(201);

    const other = await request(app)
      .post('/api/categories')
      .set('Cookie', cookie)
      .send({ name: 'Hobbies' })
      .expect(201);

    // Same name in a different letter case, and a built-in name.
    for (const name of ['pet care', 'Food']) {
      const response = await request(app)
        .put(`/api/categories/${other.body.category.id}`)
        .set('Cookie', cookie)
        .send({ name })
        .expect(409);

      assert.equal(response.body.code, 'CATEGORY_EXISTS');
    }
  });

  test('does not allow updating a built-in default category', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const listed = await request(app)
      .get('/api/categories')
      .set('Cookie', cookie)
      .expect(200);

    const food = listed.body.categories.find(
      (category) => category.name === 'Food' && category.user_id === null,
    );

    assert.ok(food, 'Food default category should exist');

    await request(app)
      .put(`/api/categories/${food.id}`)
      .set('Cookie', cookie)
      .send({ name: 'Changed Food' })
      .expect(404);
  });

  test('does not allow deleting a built-in default category', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const listed = await request(app)
      .get('/api/categories')
      .set('Cookie', cookie)
      .expect(200);

    const food = listed.body.categories.find(
      (category) => category.name === 'Food' && category.user_id === null,
    );

    assert.ok(food, 'Food default category should exist');

    await request(app)
      .delete(`/api/categories/${food.id}`)
      .set('Cookie', cookie)
      .expect(404);
  });

  test('does not allow changing another user custom category', async () => {
    const user1 = await createUser('user1@test.com');
    const user2 = await createUser('user2@test.com');
    const cookie1 = await loginAs(user1);
    const cookie2 = await loginAs(user2);

    const created = await request(app)
      .post('/api/categories')
      .set('Cookie', cookie1)
      .send({ name: 'Private Category' })
      .expect(201);

    await request(app)
      .put(`/api/categories/${created.body.category.id}`)
      .set('Cookie', cookie2)
      .send({ name: 'Hijacked Category' })
      .expect(404);

    await request(app)
      .delete(`/api/categories/${created.body.category.id}`)
      .set('Cookie', cookie2)
      .expect(404);
  });

  test('deletes a custom category', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const created = await request(app)
      .post('/api/categories')
      .set('Cookie', cookie)
      .send({ name: 'Temporary Category' })
      .expect(201);

    await request(app)
      .delete(`/api/categories/${created.body.category.id}`)
      .set('Cookie', cookie)
      .expect(204);

    const { rows } = await query(
      'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
      [created.body.category.id, user.id],
    );

    assert.equal(rows.length, 0);
  });

  test('requires authentication', async () => {
    await request(app).get('/api/categories').expect(401);

    await request(app)
      .post('/api/categories')
      .send({ name: 'Unauthenticated Category' })
      .expect(401);
  });

  test('rejects malformed category IDs', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    await request(app)
      .put('/api/categories/not-a-uuid')
      .set('Cookie', cookie)
      .send({ name: 'Updated Name' })
      .expect(400);

    await request(app)
      .delete('/api/categories/not-a-uuid')
      .set('Cookie', cookie)
      .expect(400);
  });
});
