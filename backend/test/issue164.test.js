
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  createUser,
  loginAs,
  useTestDatabase,
} from './helpers.js';

useTestDatabase();

const app = createApp();
const month = new Date().toISOString().slice(0, 7);
const today = new Date().toISOString().slice(0, 10);

async function setupUser(email = 'issue164@test.com') {
  const user = await createUser(email);
  const cookie = await loginAs(user);

  const response = await request(app)
    .get('/api/categories')
    .set('Cookie', cookie)
    .expect(200);

  const food = response.body.categories.find(
    (item) => item.name === 'Food',
  );
  const transport = response.body.categories.find(
    (item) => item.name === 'Transport',
  );

  assert.ok(food, 'Food category should exist');
  assert.ok(transport, 'Transport category should exist');

  return { user, cookie, food, transport };
}

async function addExpense(cookie, category, values = {}) {
  return request(app)
    .post('/api/expenses')
    .set('Cookie', cookie)
    .send({
      amount: 100,
      category_id: category.id,
      spent_on: today,
      ...values,
    })
    .expect(201);
}

describe('Issue #164: Expense search and pagination', () => {
  test('ESP_01 - searches by merchant name', async () => {
    const { cookie, food } = await setupUser();

    await addExpense(cookie, food, {
      merchant: 'Blue Tokai',
    });

    await addExpense(cookie, food, {
      merchant: 'Local Store',
    });

    const { body } = await request(app)
      .get('/api/expenses?search=tokai')
      .set('Cookie', cookie)
      .expect(200);

    assert.equal(body.expenses.length, 1);
    assert.equal(body.expenses[0].merchant, 'Blue Tokai');
    assert.equal(body.pagination.total, 1);
  });

  test('ESP_02 - searches by expense note', async () => {
    const { cookie, food } = await setupUser();

    await addExpense(cookie, food, {
      note: 'semester project supplies',
    });

    await addExpense(cookie, food, {
      note: 'daily groceries',
    });

    const { body } = await request(app)
      .get('/api/expenses?search=project')
      .set('Cookie', cookie)
      .expect(200);

    assert.equal(body.expenses.length, 1);
    assert.equal(
      body.expenses[0].note,
      'semester project supplies',
    );
  });

  test('ESP_03 - searches by category name', async () => {
    const { cookie, food, transport } = await setupUser();

    await addExpense(cookie, food);
    await addExpense(cookie, transport);

    const { body } = await request(app)
      .get('/api/expenses?search=Transport')
      .set('Cookie', cookie)
      .expect(200);

    assert.equal(body.expenses.length, 1);
    assert.equal(
      body.expenses[0].category_name,
      'Transport',
    );
  });

  test('ESP_04 - combines search, category and date filters', async () => {
    const { cookie, food, transport } = await setupUser();

    await addExpense(cookie, food, {
      merchant: 'Campus Cafe',
    });

    await addExpense(cookie, transport, {
      merchant: 'Campus Bus',
    });

    const { body } = await request(app)
      .get(
        `/api/expenses?search=Campus&category_id=${food.id}&start_date=${today}&end_date=${today}`,
      )
      .set('Cookie', cookie)
      .expect(200);

    assert.equal(body.expenses.length, 1);
    assert.equal(body.expenses[0].merchant, 'Campus Cafe');
  });

  test('ESP_05 - returns the first page with correct metadata', async () => {
    const { cookie, food } = await setupUser();

    for (let i = 0; i < 5; i += 1) {
      await addExpense(cookie, food, {
        amount: 100 + i,
        note: `page item ${i}`,
      });
    }

    const { body } = await request(app)
      .get('/api/expenses?page=1&limit=2')
      .set('Cookie', cookie)
      .expect(200);

    assert.equal(body.expenses.length, 2);

    assert.deepEqual(body.pagination, {
      page: 1,
      limit: 2,
      total: 5,
      totalPages: 3,
    });
  });

  test('ESP_06 - retrieves the second page without duplicates', async () => {
    const { cookie, food } = await setupUser();

    for (let i = 0; i < 5; i += 1) {
      await addExpense(cookie, food, {
        amount: 100 + i,
        note: `page item ${i}`,
      });
    }

    const first = await request(app)
      .get('/api/expenses?page=1&limit=2')
      .set('Cookie', cookie)
      .expect(200);

    const second = await request(app)
      .get('/api/expenses?page=2&limit=2')
      .set('Cookie', cookie)
      .expect(200);

    const firstIds = first.body.expenses.map(
      (item) => item.id,
    );

    const secondIds = second.body.expenses.map(
      (item) => item.id,
    );

    assert.equal(second.body.expenses.length, 2);

    assert.equal(
      secondIds.some((id) => firstIds.includes(id)),
      false,
    );
  });

  test('ESP_07 - handles a page beyond the final page', async () => {
    const { cookie, food } = await setupUser();

    await addExpense(cookie, food);

    const { body } = await request(app)
      .get('/api/expenses?page=5&limit=2')
      .set('Cookie', cookie)
      .expect(200);

    assert.deepEqual(body.expenses, []);
    assert.equal(body.pagination.total, 1);
    assert.equal(body.pagination.totalPages, 1);
  });

  test('ESP_08 - rejects invalid pagination parameters', async () => {
    const { cookie } = await setupUser();

    await request(app)
      .get('/api/expenses?page=0')
      .set('Cookie', cookie)
      .expect(400);

    await request(app)
      .get('/api/expenses?limit=0')
      .set('Cookie', cookie)
      .expect(400);

    await request(app)
      .get('/api/expenses?limit=101')
      .set('Cookie', cookie)
      .expect(400);
  });

  test('ESP_09 - keeps search results isolated between users', async () => {
    const owner = await setupUser('owner164@test.com');
    const other = await setupUser('other164@test.com');

    await addExpense(owner.cookie, owner.food, {
      merchant: 'Private Merchant',
    });

    await addExpense(other.cookie, other.food, {
      merchant: 'Other Merchant',
    });

    const { body } = await request(app)
      .get('/api/expenses?search=Merchant')
      .set('Cookie', owner.cookie)
      .expect(200);

    assert.equal(body.expenses.length, 1);
    assert.equal(
      body.expenses[0].merchant,
      'Private Merchant',
    );
  });

  test('ESP_10 - returns empty results when no match exists', async () => {
    const { cookie } = await setupUser();

    const { body } = await request(app)
      .get('/api/expenses?search=no-such-expense')
      .set('Cookie', cookie)
      .expect(200);

    assert.deepEqual(body.expenses, []);
    assert.equal(body.pagination.total, 0);
  });

  test('requires authentication for expense search', async () => {
    await request(app)
      .get('/api/expenses?search=coffee')
      .expect(401);
  });
});

describe('Issue #164: CSV and PDF exports', () => {
  test('UT_51 - exports CSV with expense details', async () => {
    const { cookie, food } = await setupUser(
      'csv164@test.com',
    );

    await addExpense(cookie, food, {
      amount: 456.75,
      merchant: 'Report Cafe',
      note: 'monthly export check',
    });

    const response = await request(app)
      .get(
        `/api/reports/export?month=${month}&format=csv`,
      )
      .set('Cookie', cookie)
      .expect(200);

    assert.match(
      response.headers['content-type'],
      /text\/csv/,
    );

    assert.match(response.text, /Report Cafe/);
    assert.match(response.text, /monthly export check/);
    assert.match(response.text, /456\.75/);
    assert.match(response.text, /Food/);
  });

  test('UT_52 - exports a valid PDF document', async () => {
    const { cookie, food } = await setupUser(
      'pdf164@test.com',
    );

    await addExpense(cookie, food, {
      amount: 789.25,
      merchant: 'PDF Test Shop',
      note: 'PDF report content',
    });

    const response = await request(app)
      .get(
        `/api/reports/export?month=${month}&format=pdf`,
      )
      .set('Cookie', cookie)
      .buffer(true)
      .parse((res, callback) => {
        const chunks = [];

        res.on('data', (chunk) => chunks.push(chunk));

        res.on('end', () => {
          callback(null, Buffer.concat(chunks));
        });
      })
      .expect(200);

    assert.match(
      response.headers['content-type'],
      /application\/pdf/,
    );

    assert.ok(Buffer.isBuffer(response.body));

    assert.equal(
      response.body.subarray(0, 5).toString(),
      '%PDF-',
    );

    assert.ok(response.body.length > 500);
  });

  test('rejects an unsupported report format', async () => {
    const { cookie } = await setupUser(
      'invalid164@test.com',
    );

    await request(app)
      .get(
        `/api/reports/export?month=${month}&format=xlsx`,
      )
      .set('Cookie', cookie)
      .expect(400);
  });
});
