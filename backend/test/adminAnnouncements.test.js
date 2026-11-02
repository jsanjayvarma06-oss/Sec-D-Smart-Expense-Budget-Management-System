import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { promoteToAdmin } from '../src/services/adminService.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();

const app = createApp();

async function setupAdmin() {
  const admin = await createUser('admin@test.com', 'Admin User');
  await promoteToAdmin('admin@test.com');
  const cookie = await loginAs(admin);

  return {
    admin,
    cookie,
    send: (data) => request(app)
      .post('/api/admin/announcements')
      .set('Cookie', cookie)
      .send(data),
    history: () => request(app)
      .get('/api/admin/announcements')
      .set('Cookie', cookie),
  };
}

describe('Admin: announcements (#131)', () => {
  describe('access control', () => {
    test('requires login', async () => {
      await request(app)
        .get('/api/admin/announcements')
        .expect(401);

      await request(app)
        .post('/api/admin/announcements')
        .send({ title: 'Test', message: 'Hello everyone' })
        .expect(401);
    });

    test('refuses an ordinary user', async () => {
      const user = await createUser('user@test.com');
      const cookie = await loginAs(user);

      await request(app)
        .get('/api/admin/announcements')
        .set('Cookie', cookie)
        .expect(403);

      await request(app)
        .post('/api/admin/announcements')
        .set('Cookie', cookie)
        .send({ title: 'Test', message: 'Hello everyone' })
        .expect(403);
    });
  });

  describe('sending announcements', () => {
    test('sends a notification to every active user and saves history', async () => {
      const { admin, send } = await setupAdmin();

      const user1 = await createUser('user1@test.com', 'User One');
      const user2 = await createUser('user2@test.com', 'User Two');
      const disabledUser = await createUser('disabled@test.com', 'Disabled User');

      await query(
        'UPDATE users SET disabled_at = now() WHERE id = $1',
        [disabledUser.id],
      );

      const { body } = await send({
        title: 'Important Update',
        message: 'The application will be updated tomorrow.',
      }).expect(201);

      assert.equal(body.message, 'Announcement sent successfully');
      assert.equal(body.announcement.title, 'Important Update');
      assert.equal(
        body.announcement.message,
        'The application will be updated tomorrow.',
      );

      // The admin and two active users should receive the announcement.
      assert.equal(body.announcement.recipient_count, 3);

      const { rows: notifications } = await query(
        `SELECT user_id, type, message
         FROM notifications
         WHERE type = 'announcement'
         ORDER BY user_id`,
      );

      assert.equal(notifications.length, 3);

      const recipientIds = notifications.map((row) => row.user_id);

      assert.ok(recipientIds.includes(admin.id));
      assert.ok(recipientIds.includes(user1.id));
      assert.ok(recipientIds.includes(user2.id));
      assert.ok(!recipientIds.includes(disabledUser.id));

      for (const notification of notifications) {
        assert.equal(notification.type, 'announcement');
        assert.equal(
          notification.message,
          'The application will be updated tomorrow.',
        );
      }

      const { rows: history } = await query(
        'SELECT * FROM announcements WHERE id = $1',
        [body.announcement.id],
      );

      assert.equal(history.length, 1);
      assert.equal(history[0].admin_id, admin.id);
      assert.equal(history[0].recipient_count, 3);
    });

    test('records the announcement action in the audit log without message content', async () => {
      const { admin, send } = await setupAdmin();

      await send({
        title: 'Private title',
        message: 'Private announcement content',
      }).expect(201);

      const { rows } = await query(
        `SELECT action, details
         FROM admin_audit_log
         WHERE admin_id = $1
           AND action = 'send_announcement'`,
        [admin.id],
      );

      assert.equal(rows.length, 1);
      assert.ok(rows[0].details.announcement_id);
      assert.equal(rows[0].details.recipient_count, 1);
      assert.equal(
        JSON.stringify(rows[0].details).includes('Private announcement content'),
        false,
      );
    });

    test('rejects an empty title or message', async () => {
      const { send } = await setupAdmin();

      await send({
        title: '   ',
        message: 'Hello everyone',
      }).expect(400);

      await send({
        title: 'Important',
        message: '   ',
      }).expect(400);
    });

    test('rejects a title or message exceeding database limits', async () => {
      const { send } = await setupAdmin();

      await send({
        title: 'T'.repeat(101),
        message: 'Valid message',
      }).expect(400);

      await send({
        title: 'Valid title',
        message: 'M'.repeat(256),
      }).expect(400);
    });
  });

  describe('announcement history', () => {
    test('shows previously sent announcements newest first', async () => {
      const { send, history } = await setupAdmin();

      await send({
        title: 'First Announcement',
        message: 'First message',
      }).expect(201);

      await send({
        title: 'Second Announcement',
        message: 'Second message',
      }).expect(201);

      const { body } = await history().expect(200);

      assert.equal(body.announcements.length, 2);
      assert.equal(body.announcements[0].title, 'Second Announcement');
      assert.equal(body.announcements[1].title, 'First Announcement');
      assert.equal(body.announcements[0].admin_name, 'Admin User');
    });

    test('records when an admin views announcement history', async () => {
      const { admin, history } = await setupAdmin();

      await history().expect(200);

      const { rows } = await query(
        `SELECT action
         FROM admin_audit_log
         WHERE admin_id = $1 AND action = 'view_announcements'`,
        [admin.id],
      );

      assert.equal(rows.length, 1);
    });
  });
});