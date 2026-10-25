
 // Brute-force protection (SR09): account lockout and the per-IP login limit.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import {
  isLocked,
  recordFailedLogin,
  resetFailedLogins,
} from '../src/services/loginProtection.js';
import { createUser, useTestDatabase } from './helpers.js';

useTestDatabase();

async function loadUser(id) {
  const { rows } = await query(
    'SELECT failed_login_count, locked_until FROM users WHERE id = $1',
    [id],
  );
  return rows[0];
}

describe('account lockout', () => {
  test('locks the account on the 5th consecutive failure', async () => {
    const user = await createUser();

    for (let i = 0; i < 4; i += 1) {
      assert.deepEqual(await recordFailedLogin(user.id), { locked: false });
    }

    assert.equal(isLocked(await loadUser(user.id)), false);
    assert.deepEqual(await recordFailedLogin(user.id), { locked: true });
    assert.equal(isLocked(await loadUser(user.id)), true);
  });

  test('an expired lock no longer counts as locked', async () => {
    const user = await createUser();

    await query(
      `UPDATE users SET locked_until = now() - interval '1 second' WHERE id = $1`,
      [user.id],
    );

    assert.equal(isLocked(await loadUser(user.id)), false);
  });

  test('a failure after an expired lock starts the count again', async () => {
    const user = await createUser();

    await query(
      `UPDATE users
       SET failed_login_count = 5, locked_until = now() - interval '1 second'
       WHERE id = $1`,
      [user.id],
    );

    await recordFailedLogin(user.id);

    const row = await loadUser(user.id);
    assert.equal(row.failed_login_count, 1);
    assert.equal(row.locked_until, null);
  });

  test('a successful login resets the count', async () => {
    const user = await createUser();

    await recordFailedLogin(user.id);
    await recordFailedLogin(user.id);
    await resetFailedLogins(user.id);

    const row = await loadUser(user.id);
    assert.equal(row.failed_login_count, 0);
    assert.equal(row.locked_until, null);
  });

  test('one user’s failures do not affect another user', async () => {
    const user1 = await createUser('user1@test.com');
    const user2 = await createUser('user2@test.com');

    for (let i = 0; i < 5; i += 1) {
      await recordFailedLogin(user1.id);
    }

    assert.equal((await loadUser(user2.id)).failed_login_count, 0);
  });
});

describe('login rate limit', () => {
  test('limits repeated requests to the login route from one source', async () => {
    const app = createApp({ loginRateLimit: 3 });

    // The first three requests reach login validation; the fourth is rate limited.
    for (let i = 0; i < 3; i += 1) {
      await request(app).post('/api/auth/login').send({}).expect(400);
    }

    const res = await request(app)
      .post('/api/auth/login')
      .send({})
      .expect(429);

    assert.equal(res.body.code, 'RATE_LIMITED');
  });
});
