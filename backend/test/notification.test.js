
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();

const app = createApp();

describe('Notification API', () => {
  test('requires authentication to list notifications', async () => {
    await request(app)
      .get('/api/notifications')
      .expect(401);
  });

  test('creates a budget notification only once for the same threshold', async () => {
    const { createBudgetNotifications } =
  await import('../src/services/notificationService.js');

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
});
