
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import {
  createUser,
  loginAs,
  useTestDatabase,
} from './helpers.js';
import { createBudgetNotifications } from '../src/services/notificationService.js';
import { generateDueRecurringExpenses, markRecurringExpensePaid } from '../src/services/recurringExpenseService.js';

useTestDatabase();

const app = createApp();

// Dates relative to the server's today: the reminders route only accepts a
// "today" within a day of the real date.
const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function createRecurringExpense(userId, dueDate = day(1)) {
  const { rows: categories } = await query(
    `INSERT INTO categories (user_id, name)
     VALUES ($1, $2)
     RETURNING id`,
    [userId, `Reminder Test ${Math.random()}`],
  );

  const { rows } = await query(
    `INSERT INTO recurring_expenses
       (user_id, category_id, amount, cycle, start_date, next_due_date, note)
     VALUES ($1, $2, 250, 'monthly', $3::date, $3::date, 'Test payment reminder')
     RETURNING id`,
    [userId, categories[0].id, dueDate],
  );

  return rows[0].id;
}

describe('Notification API', () => {
  test('requires authentication to list notifications', async () => {
    await request(app)
      .get('/api/notifications')
      .expect(401);
  });

  test('creates a budget notification only once for the same threshold', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const alert = {
      budget_id: '00000000-0000-4000-8000-000000000010',
      month: '2026-10-01',
      category_id: null,
      category_name: null,
      threshold: 80,
      message: 'You have used at least 80% of your budget.',
    };

    const firstCreated = await createBudgetNotifications(user.id, [alert]);
    const secondCreated = await createBudgetNotifications(user.id, [alert]);

    assert.equal(firstCreated.length, 1);
    assert.equal(secondCreated.length, 0);

    const response = await request(app)
      .get('/api/notifications')
      .set('Cookie', cookie)
      .expect(200);

    const matching = response.body.notifications.filter(
      (notification) =>
        notification.message.includes('You have used at least 80%'),
    );

    assert.equal(matching.length, 1);
  });

  test('lists notifications and filters unread notifications', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    const listed = await request(app)
      .get('/api/notifications')
      .set('Cookie', cookie)
      .expect(200);

    assert.ok(Array.isArray(listed.body.notifications));

    const unread = await request(app)
      .get('/api/notifications?unreadOnly=true')
      .set('Cookie', cookie)
      .expect(200);

    assert.ok(Array.isArray(unread.body.notifications));
    assert.ok(
      unread.body.notifications.every(
        (notification) => notification.is_read === false,
      ),
    );
  });

  test('rejects invalid unreadOnly values', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    await request(app)
      .get('/api/notifications?unreadOnly=yes')
      .set('Cookie', cookie)
      .expect(400);
  });

  test('rejects malformed notification IDs', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    await request(app)
      .patch('/api/notifications/not-a-uuid/read')
      .set('Cookie', cookie)
      .expect(400);
  });

  test('returns 404 for a notification that does not exist', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const missingId = '00000000-0000-4000-8000-000000000001';

    await request(app)
      .patch(`/api/notifications/${missingId}/read`)
      .set('Cookie', cookie)
      .expect(404);
  });

  test('does not expose another user notifications', async () => {
    const user1 = await createUser('notification1@test.com');
    const user2 = await createUser('notification2@test.com');
    const cookie1 = await loginAs(user1);
    const cookie2 = await loginAs(user2);

    const user1Notifications = await request(app)
      .get('/api/notifications')
      .set('Cookie', cookie1)
      .expect(200);

    const user2Notifications = await request(app)
      .get('/api/notifications')
      .set('Cookie', cookie2)
      .expect(200);

    assert.ok(Array.isArray(user1Notifications.body.notifications));
    assert.ok(Array.isArray(user2Notifications.body.notifications));

    const user2Ids = new Set(
      user2Notifications.body.notifications.map(
        (notification) => notification.id,
      ),
    );

    for (const notification of user1Notifications.body.notifications) {
      assert.ok(
        !user2Ids.has(notification.id),
        'Notifications must not be shared between users',
      );
    }
  });

  test('creates a reminder for a payment due within three days', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    await createRecurringExpense(user.id, day(1));

    const response = await request(app)
      .post('/api/notifications/payment-reminders')
      .set('Cookie', cookie)
      .send({ today: day(0) })
      .expect(200);

    assert.equal(response.body.created_count, 1);
    assert.equal(response.body.notifications[0].type, 'payment_reminder');
  });

  test('does not create duplicate reminders for the same payment cycle', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    await createRecurringExpense(user.id, day(1));

    const first = await request(app)
      .post('/api/notifications/payment-reminders')
      .set('Cookie', cookie)
      .send({ today: day(0) })
      .expect(200);

    const second = await request(app)
      .post('/api/notifications/payment-reminders')
      .set('Cookie', cookie)
      .send({ today: day(0) })
      .expect(200);

    assert.equal(first.body.created_count, 1);
    assert.equal(second.body.created_count, 0);
  });

  test('does not create reminders for a payment outside the three-day window', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    await createRecurringExpense(user.id, day(6));

    const response = await request(app)
      .post('/api/notifications/payment-reminders')
      .set('Cookie', cookie)
      .send({ today: day(0) })
      .expect(200);

    assert.equal(response.body.created_count, 0);
  });

  test('does not create a reminder after the payment cycle is marked paid', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const recurringId = await createRecurringExpense(user.id, day(1));

    await generateDueRecurringExpenses(user.id, day(1));

    const paid = await markRecurringExpensePaid(
      user.id,
      recurringId,
      day(1),
    );

    assert.ok(paid);
    assert.equal(paid.last_paid_due_date, day(1));

    const response = await request(app)
      .post('/api/notifications/payment-reminders')
      .set('Cookie', cookie)
      .send({ today: day(0) })
      .expect(200);

    assert.equal(response.body.created_count, 0);
  });

});

describe('Overdue payments (UC-07 10a-10b)', () => {
  function remind(cookie, today = day(0)) {
    return request(app)
      .post('/api/notifications/payment-reminders')
      .set('Cookie', cookie)
      .send({ today })
      .expect(200);
  }

  function listRecurring(cookie, today = day(0)) {
    return request(app)
      .get(`/api/recurring-expenses?today=${today}`)
      .set('Cookie', cookie)
      .expect(200);
  }

  // A payment that fell due two days ago, with its expense already created.
  async function missedPayment(user) {
    const recurringId = await createRecurringExpense(user.id, day(-2));
    await generateDueRecurringExpenses(user.id, day(0));
    return recurringId;
  }

  test('a missed payment gets one follow-up, not one on every visit', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    await missedPayment(user);

    const first = await remind(cookie);
    const second = await remind(cookie);

    assert.equal(first.body.created_count, 1);
    assert.equal(first.body.notifications[0].type, 'payment_overdue');
    assert.match(first.body.notifications[0].message, new RegExp(day(-2)));
    assert.equal(second.body.created_count, 0);
  });

  test('a payment that falls due today is not overdue yet', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    await createRecurringExpense(user.id, day(0));
    await generateDueRecurringExpenses(user.id, day(0));

    const response = await remind(cookie);
    const { recurringExpenses } = (await listRecurring(cookie)).body;

    assert.equal(response.body.created_count, 0);
    assert.equal(recurringExpenses[0].unpaid_due_date, day(0));
    assert.equal(recurringExpenses[0].is_overdue, false);
  });

  test('the list marks a missed payment as overdue and names the date', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const recurringId = await missedPayment(user);

    const { recurringExpenses } = (await listRecurring(cookie)).body;

    assert.equal(recurringExpenses[0].id, recurringId);
    assert.equal(recurringExpenses[0].is_overdue, true);
    assert.equal(recurringExpenses[0].unpaid_due_date, day(-2));
  });

  test('marking it paid stops the follow-ups and the overdue mark', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const recurringId = await missedPayment(user);

    await remind(cookie);

    await request(app)
      .patch(`/api/recurring-expenses/${recurringId}/pay`)
      .set('Cookie', cookie)
      .send({ due_date: day(-2) })
      .expect(200);

    const again = await remind(cookie);
    const { recurringExpenses } = (await listRecurring(cookie)).body;

    assert.equal(again.body.created_count, 0);
    assert.equal(recurringExpenses[0].is_overdue, false);
    assert.equal(recurringExpenses[0].unpaid_due_date, null);
  });

  test('paying marks that cycle\'s reminders as read', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const recurringId = await missedPayment(user);

    await remind(cookie);

    const before = await request(app)
      .get('/api/notifications?unreadOnly=true')
      .set('Cookie', cookie)
      .expect(200);
    assert.equal(before.body.notifications.length, 1);

    await request(app)
      .patch(`/api/recurring-expenses/${recurringId}/pay`)
      .set('Cookie', cookie)
      .send({ due_date: day(-2) })
      .expect(200);

    const after = await request(app)
      .get('/api/notifications?unreadOnly=true')
      .set('Cookie', cookie)
      .expect(200);
    assert.equal(after.body.notifications.length, 0);
  });

  test('a payment with several missed cycles gets one follow-up, for the latest', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const { rows: categories } = await query(
      `INSERT INTO categories (user_id, name) VALUES ($1, 'Weekly Overdue') RETURNING id`,
      [user.id],
    );
    await query(
      `INSERT INTO recurring_expenses
         (user_id, category_id, amount, cycle, start_date, next_due_date)
       VALUES ($1, $2, 90, 'weekly', $3::date, $3::date)`,
      [user.id, categories[0].id, day(-15)],
    );
    await generateDueRecurringExpenses(user.id, day(0));

    const response = await remind(cookie);

    assert.equal(response.body.created_count, 1);
    assert.match(response.body.notifications[0].message, new RegExp(day(-1)));
  });

  test('an inactive payment is never overdue', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const recurringId = await missedPayment(user);
    await query('UPDATE recurring_expenses SET is_active = false WHERE id = $1', [recurringId]);

    const response = await remind(cookie);
    const { recurringExpenses } = (await listRecurring(cookie)).body;

    assert.equal(response.body.created_count, 0);
    assert.equal(recurringExpenses[0].is_overdue, false);
  });

  test("one user's missed payment does not appear for another", async () => {
    const owner = await createUser();
    const other = await createUser('other@test.com');
    const otherCookie = await loginAs(other);
    await missedPayment(owner);

    const response = await remind(otherCookie);
    const { recurringExpenses } = (await listRecurring(otherCookie)).body;

    assert.equal(response.body.created_count, 0);
    assert.equal(recurringExpenses.length, 0);
  });

  test('rejects a today that is not close to the real date', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);

    await request(app)
      .get(`/api/recurring-expenses?today=${day(30)}`)
      .set('Cookie', cookie)
      .expect(400);
    await request(app)
      .get('/api/recurring-expenses?today=not-a-date')
      .set('Cookie', cookie)
      .expect(400);
  });
});
