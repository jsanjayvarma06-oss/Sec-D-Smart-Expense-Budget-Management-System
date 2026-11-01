import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { recordSecurityEvent, getSecurityOverview } from '../src/services/securityMonitorService.js';
import {
  createUser,
  loginAs,
  useTestDatabase,
} from './helpers.js';

const app = createApp();

async function createAdmin(email = 'admin_sec@test.com') {
  const user = await createUser(email, 'Security Admin');
  await query(`UPDATE users SET role = 'admin' WHERE id = $1`, [user.id]);
  return user;
}

describe('Admin Security Monitor (#117, #118)', () => {
  useTestDatabase();
  beforeEach(async () => {
    await query('DELETE FROM security_events');
  });

  test('requires an admin account', async () => {
    // Logged out
    await request(app).get('/api/admin/security').expect(401);

    // Regular user gets 403
    const user = await createUser('user@test.com');
    await request(app)
      .get('/api/admin/security')
      .set('Cookie', await loginAs(user))
      .expect(403);

    // Admin succeeds
    const admin = await createAdmin('admin_sec@test.com');
    const res = await request(app)
      .get('/api/admin/security')
      .set('Cookie', await loginAs(admin))
      .expect(200);

    assert.ok(res.body.security);
    assert.ok(Array.isArray(res.body.security.timeline));
    assert.equal(res.body.security.timeline.length, 7);
    assert.ok(Array.isArray(res.body.security.top_targeted_accounts));
  });

  test('records login_failed and account_locked events and provides 7-day summary', async () => {
    const admin = await createAdmin('admin_view@test.com');
    const targetEmail = 'victim@test.com';

    // Record some mock security events
    await recordSecurityEvent({
      eventType: 'login_failed',
      email: targetEmail,
      ipAddress: '192.168.1.100',
      details: { attempt: 1 },
    });
    await recordSecurityEvent({
      eventType: 'login_failed',
      email: targetEmail,
      ipAddress: '192.168.1.100',
      details: { attempt: 2 },
    });
    await recordSecurityEvent({
      eventType: 'account_locked',
      email: targetEmail,
      ipAddress: '192.168.1.100',
      details: { durationMinutes: 15 },
    });
    await recordSecurityEvent({
      eventType: 'password_reset_requested',
      email: targetEmail,
      ipAddress: '192.168.1.100',
    });

    const overview = await getSecurityOverview();

    assert.equal(overview.totals.login_failed, 2);
    assert.equal(overview.totals.account_locked, 1);
    assert.equal(overview.totals.password_reset_requested, 1);
    assert.ok(overview.totals.total_events >= 4);

    const targetAccount = overview.top_targeted_accounts.find(
      (a) => a.email === targetEmail,
    );
    assert.ok(targetAccount, 'Targeted email should appear in top accounts');
    assert.equal(targetAccount.failed_count, 3); // 2 login_failed + 1 account_locked

    // Fetch via API
    const res = await request(app)
      .get('/api/admin/security')
      .set('Cookie', await loginAs(admin))
      .expect(200);

    assert.equal(res.body.security.totals.login_failed, 2);
    assert.equal(res.body.security.totals.account_locked, 1);
  });

  test('sanitizes sensitive data and never records passwords, tokens or secrets', async () => {
    await recordSecurityEvent({
      eventType: 'login_failed',
      email: 'leak_test@test.com',
      ipAddress: '10.0.0.1',
      details: {
        password: 'SuperSecretPassword123!',
        token: 'secret-token-abc',
        secret: 'totp-secret-key',
        code: '123456',
        amount: 5000,
        otherSafeInfo: 'visible',
      },
    });

    const { rows } = await query(
      `SELECT details FROM security_events WHERE email = 'leak_test@test.com'`,
    );
    assert.equal(rows.length, 1);
    const details = rows[0].details;

    assert.equal(details.password, undefined);
    assert.equal(details.token, undefined);
    assert.equal(details.secret, undefined);
    assert.equal(details.code, undefined);
    assert.equal(details.amount, undefined);
    assert.equal(details.otherSafeInfo, 'visible');
  });

  test('records security events on actual failed login requests', async () => {
    // Wrong password login attempt
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'nonexistent@test.com', password: 'WrongPassword123' })
      .expect(401);

    const { rows } = await query(
      `SELECT event_type, email FROM security_events WHERE email = 'nonexistent@test.com'`,
    );
    assert.ok(rows.length >= 1);
    assert.equal(rows[0].event_type, 'login_failed');
  });

  test('records password_reset_requested on forgot-password requests', async () => {
    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'forgot@test.com' })
      .expect(202);

    const { rows } = await query(
      `SELECT event_type, email FROM security_events WHERE email = 'forgot@test.com'`,
    );
    assert.ok(rows.length >= 1);
    assert.equal(rows[0].event_type, 'password_reset_requested');
  });
});
