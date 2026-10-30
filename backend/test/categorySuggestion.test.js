import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();

const app = createApp();

async function defaultId(name) {
  const { rows } = await query(
    'SELECT id FROM categories WHERE user_id IS NULL AND name = $1',
    [name],
  );
  return rows[0]?.id;
}

async function setup(email = 'user1@test.com') {
  const user = await createUser(email);
  const cookie = await loginAs(user);

  return {
    user,
    cookie,
    post: (body) => request(app).post('/api/expenses').set('Cookie', cookie).send(body),
    put: (id, body) => request(app).put(`/api/expenses/${id}`).set('Cookie', cookie).send(body),
    suggest: (merchant) => request(app)
      .get('/api/categories/suggest')
      .query(merchant === undefined ? {} : { merchant })
      .set('Cookie', cookie),
  };
}

const spentOn = '2026-10-05';

describe('Category suggestion from the merchant name (FR05)', () => {
  test('an expense with no category gets one suggested from the merchant', async () => {
    const { post } = await setup();
    const { body } = await post({ amount: 250, merchant: 'Swiggy order', spent_on: spentOn }).expect(201);

    assert.equal(body.expense.category_id, await defaultId('Food'));
    assert.equal(body.expense.category_suggested, true);
  });

  test('a category the user picks always wins over the suggestion', async () => {
    const { post } = await setup();
    const transport = await defaultId('Transport');
    const { body } = await post({
      amount: 250, merchant: 'Swiggy order', category_id: transport, spent_on: spentOn,
    }).expect(201);

    assert.equal(body.expense.category_id, transport);
    assert.equal(body.expense.category_suggested, false);
  });

  test('a null category is the same as none', async () => {
    const { post } = await setup();
    const { body } = await post({
      amount: 40, merchant: 'Metro Station', category_id: null, spent_on: spentOn,
    }).expect(201);

    assert.equal(body.expense.category_id, await defaultId('Transport'));
  });

  test('with no category and no recognised merchant, the user is asked to choose', async () => {
    const { post } = await setup();

    const unknown = await post({ amount: 40, merchant: 'Corner Shop', spent_on: spentOn }).expect(400);
    assert.equal(unknown.body.code, 'INVALID_CATEGORY');
    assert.equal(unknown.body.fields.category_id, 'Choose a category');

    await post({ amount: 40, spent_on: spentOn }).expect(400);
  });

  test('a category ID that is not a valid ID is still refused', async () => {
    const { post } = await setup();
    await post({
      amount: 40, merchant: 'Swiggy', category_id: 'not-an-id', spent_on: spentOn,
    }).expect(400);
  });

  test("another user's category is still refused", async () => {
    const other = await createUser('other@test.com');
    const { rows } = await query(
      `INSERT INTO categories (user_id, name) VALUES ($1, 'Private') RETURNING id`,
      [other.id],
    );
    const { post } = await setup();

    await post({
      amount: 40, merchant: 'Swiggy', category_id: rows[0].id, spent_on: spentOn,
    }).expect(400);
  });

  test('no suggestion is made when the built-in category was removed', async () => {
    const { post } = await setup();
    const { rows } = await query(
      `DELETE FROM categories WHERE user_id IS NULL AND name = 'Entertainment'
       RETURNING id, name, created_at`,
    );

    try {
      await post({ amount: 40, merchant: 'Netflix', spent_on: spentOn }).expect(400);
    } finally {
      // The test database keeps built-in categories between tests: put it back.
      await query(
        'INSERT INTO categories (id, user_id, name, created_at) VALUES ($1, NULL, $2, $3)',
        [rows[0].id, rows[0].name, rows[0].created_at],
      );
    }
  });

  test('editing an expense without a category suggests one too', async () => {
    const { post, put } = await setup();
    const food = await defaultId('Food');
    const { body } = await post({ amount: 90, category_id: food, spent_on: spentOn }).expect(201);

    const edited = await put(body.expense.id, {
      amount: 90, merchant: 'Uber ride', spent_on: spentOn,
    }).expect(200);
    assert.equal(edited.body.expense.category_id, await defaultId('Transport'));
    assert.equal(edited.body.expense.category_suggested, true);

    await put(body.expense.id, { amount: 90, merchant: 'Corner Shop', spent_on: spentOn }).expect(400);
  });

  test('editing an expense that does not exist is still a 404', async () => {
    const { put } = await setup();
    await put('00000000-0000-4000-8000-000000000000', {
      amount: 90, merchant: 'Corner Shop', spent_on: spentOn,
    }).expect(404);
  });

  test('the suggestion endpoint returns the category, or null', async () => {
    const { suggest } = await setup();

    const known = await suggest('Zomato');
    assert.equal(known.status, 200);
    assert.equal(known.body.category.name, 'Food');
    assert.equal(known.body.category.id, await defaultId('Food'));

    assert.equal((await suggest('Corner Shop')).body.category, null);
    assert.equal((await suggest('')).body.category, null);
    assert.equal((await suggest(undefined)).body.category, null);
  });

  test('the suggestion endpoint needs a login', async () => {
    await request(app).get('/api/categories/suggest?merchant=Zomato').expect(401);
  });
});
