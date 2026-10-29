import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { addCycle, detectSubscriptions } from '../src/services/subscriptionService.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();

const app = createApp();

const charge = (merchant, amount, spent_on) => ({
  merchant, amount: String(amount), spent_on, category_id: 'c1', category_name: 'Entertainment',
});

describe('Subscription detection rules', () => {
  test('finds a monthly subscription after three charges', () => {
    const [found] = detectSubscriptions([
      charge('Netflix', 199, '2026-07-05'),
      charge('Netflix', 199, '2026-08-05'),
      charge('Netflix', 199, '2026-09-04'),
    ], '2026-09-20');

    assert.equal(found.merchant, 'Netflix');
    assert.equal(found.cycle, 'monthly');
    assert.equal(found.typical_amount, '199.00');
    assert.equal(found.next_expected_date, '2026-10-04');
    assert.equal(found.charge_count, 3);
    assert.equal(found.price_rise, null);
  });

  test('finds a weekly subscription', () => {
    const [found] = detectSubscriptions([
      charge('Gym', 150, '2026-09-01'),
      charge('Gym', 150, '2026-09-08'),
      charge('Gym', 150, '2026-09-15'),
      charge('Gym', 150, '2026-09-22'),
    ], '2026-09-25');

    assert.equal(found.cycle, 'weekly');
    assert.equal(found.next_expected_date, '2026-09-29');
    assert.equal(found.charge_count, 4);
  });

  test('two charges are not enough', () => {
    assert.deepEqual(detectSubscriptions([
      charge('Spotify', 119, '2026-08-01'),
      charge('Spotify', 119, '2026-09-01'),
    ], '2026-09-10'), []);
  });

  test('irregular gaps or very different amounts are not a subscription', () => {
    assert.deepEqual(detectSubscriptions([
      charge('Cafe', 120, '2026-09-01'),
      charge('Cafe', 90, '2026-09-03'),
      charge('Cafe', 150, '2026-09-20'),
    ], '2026-09-25'), []);

    assert.deepEqual(detectSubscriptions([
      charge('Amazon', 300, '2026-07-10'),
      charge('Amazon', 2500, '2026-08-10'),
      charge('Amazon', 450, '2026-09-10'),
    ], '2026-09-25'), []);
  });

  test('merchant names match regardless of case and spaces', () => {
    const [found] = detectSubscriptions([
      charge('netflix', 199, '2026-07-05'),
      charge(' Netflix ', 199, '2026-08-05'),
      charge('NETFLIX', 199, '2026-09-05'),
    ], '2026-09-20');

    assert.equal(found.merchant, 'NETFLIX');
    assert.equal(found.merchant_key, 'netflix');
  });

  test('a subscription that stopped a cycle ago is left out', () => {
    const charges = [
      charge('Hotstar', 299, '2026-05-01'),
      charge('Hotstar', 299, '2026-06-01'),
      charge('Hotstar', 299, '2026-07-01'),
    ];

    assert.equal(detectSubscriptions(charges, '2026-09-02').length, 0);
  });

  test('a late charge moves the next expected date to the next cycle', () => {
    const charges = [
      charge('Hotstar', 299, '2026-05-01'),
      charge('Hotstar', 299, '2026-06-01'),
      charge('Hotstar', 299, '2026-07-01'),
    ];

    assert.equal(detectSubscriptions(charges, '2026-08-01')[0].next_expected_date, '2026-08-01');
    assert.equal(detectSubscriptions(charges, '2026-08-05')[0].next_expected_date, '2026-09-01');
    assert.equal(detectSubscriptions(charges, '2026-09-01')[0].next_expected_date, '2026-09-01');
  });

  test('reports a price rise of more than 5%', () => {
    const [found] = detectSubscriptions([
      charge('Netflix', 199, '2026-07-05'),
      charge('Netflix', 199, '2026-08-05'),
      charge('Netflix', 249, '2026-09-05'),
    ], '2026-09-20');

    assert.deepEqual(found.price_rise, {
      from_amount: '199.00', to_amount: '249.00', percent: 25.1, charged_on: '2026-09-05',
    });
    assert.equal(found.latest_amount, '249.00');
  });

  test('a rise of exactly 5% is not reported', () => {
    const [found] = detectSubscriptions([
      charge('Cloud', 100, '2026-07-05'),
      charge('Cloud', 100, '2026-08-05'),
      charge('Cloud', 105, '2026-09-05'),
    ], '2026-09-20');

    assert.equal(found.price_rise, null);
  });

  test('monthly next date keeps the day or uses the last day of the month', () => {
    assert.equal(addCycle('2026-01-31', 'monthly'), '2026-02-28');
    assert.equal(addCycle('2026-03-15', 'monthly'), '2026-04-15');
    assert.equal(addCycle('2026-12-20', 'monthly'), '2027-01-20');
    assert.equal(addCycle('2026-12-29', 'weekly'), '2027-01-05');
  });
});

// The API only accepts a "today" within a day of the server's date.
const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function addExpenses(userId, merchant, rows) {
  const { rows: [category] } = await query(
    `INSERT INTO categories (user_id, name) VALUES ($1, $2)
     ON CONFLICT DO NOTHING RETURNING id`,
    [userId, 'Subscriptions'],
  );
  const categoryId = category?.id ?? (await query(
    `SELECT id FROM categories WHERE user_id = $1 AND name = 'Subscriptions'`, [userId],
  )).rows[0].id;

  for (const [amount, spentOn] of rows) {
    await query(
      `INSERT INTO expenses (user_id, category_id, amount, spent_on, merchant)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, categoryId, amount, spentOn, merchant],
    );
  }
  return categoryId;
}

describe('Subscriptions API', () => {
  test('requires a session', async () => {
    await request(app).get(`/api/insights/subscriptions?today=${day(0)}`).expect(401);
    await request(app).post('/api/insights/subscriptions/price-alerts').send({ today: day(0) }).expect(401);
  });

  test('rejects a missing or far-off today', async () => {
    const cookie = await loginAs(await createUser());
    await request(app).get('/api/insights/subscriptions').set('Cookie', cookie).expect(400);
    await request(app).get(`/api/insights/subscriptions?today=${day(-10)}`).set('Cookie', cookie).expect(400);
  });

  test('lists suggestions with merchant, amount, cycle and next date', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const categoryId = await addExpenses(user.id, 'Netflix', [[199, day(-60)], [199, day(-30)], [199, day(0)]]);

    const res = await request(app)
      .get(`/api/insights/subscriptions?today=${day(0)}`)
      .set('Cookie', cookie)
      .expect(200);

    assert.equal(res.body.subscriptions.length, 1);
    const [found] = res.body.subscriptions;
    assert.equal(found.merchant, 'Netflix');
    assert.equal(found.cycle, 'monthly');
    assert.equal(found.typical_amount, '199.00');
    assert.equal(found.next_expected_date, addCycle(day(0), 'monthly'));
    assert.equal(found.category_id, categoryId);
    assert.equal(found.already_recurring, false);
  });

  test("uses only the logged-in user's expenses", async () => {
    const owner = await createUser('owner@test.com');
    const other = await createUser('other@test.com');
    await addExpenses(owner.id, 'Netflix', [[199, day(-60)], [199, day(-30)], [199, day(0)]]);

    const res = await request(app)
      .get(`/api/insights/subscriptions?today=${day(0)}`)
      .set('Cookie', await loginAs(other))
      .expect(200);

    assert.deepEqual(res.body.subscriptions, []);
  });

  test('"Make recurring" turns a suggestion into a recurring payment', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    await addExpenses(user.id, 'Spotify', [[119, day(-14)], [119, day(-7)], [119, day(0)]]);

    const { body: { subscriptions: [found] } } = await request(app)
      .get(`/api/insights/subscriptions?today=${day(0)}`)
      .set('Cookie', cookie)
      .expect(200);

    await request(app)
      .post('/api/recurring-expenses')
      .set('Cookie', cookie)
      .send({
        category_id: found.category_id,
        amount: found.latest_amount,
        cycle: found.cycle,
        start_date: found.next_expected_date,
        note: found.merchant,
      })
      .expect(201);

    const after = await request(app)
      .get(`/api/insights/subscriptions?today=${day(0)}`)
      .set('Cookie', cookie)
      .expect(200);

    assert.equal(after.body.subscriptions[0].already_recurring, true);
  });

  test('a price rise becomes one notification, once', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    await addExpenses(user.id, 'Netflix', [[199, day(-60)], [199, day(-30)], [249, day(0)]]);

    const first = await request(app)
      .post('/api/insights/subscriptions/price-alerts')
      .set('Cookie', cookie)
      .send({ today: day(0) })
      .expect(200);

    assert.equal(first.body.created_count, 1);
    assert.equal(first.body.notifications[0].type, 'price_rise');
    assert.match(first.body.notifications[0].message, /Netflix went up from 199\.00 to 249\.00 \(25\.1% more\)/);

    const second = await request(app)
      .post('/api/insights/subscriptions/price-alerts')
      .set('Cookie', cookie)
      .send({ today: day(0) })
      .expect(200);

    assert.equal(second.body.created_count, 0);

    const { body } = await request(app).get('/api/notifications').set('Cookie', cookie).expect(200);
    assert.equal(body.notifications.filter((n) => n.type === 'price_rise').length, 1);
  });
});
