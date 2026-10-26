// Password recovery flow (#29, UC-01 alternate flow 8b).

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { useTestDatabase } from './helpers.js';

useTestDatabase();

const app = createApp({ loginRateLimit: 1000, passwordResetRateLimit: 1000 });
const OLD_PASSWORD = 'OldPass123!';
const NEW_PASSWORD = 'NewPass456!';
let counter = 0;

async function registeredUser() {
  const email = `reset-${Date.now()}-${(counter += 1)}@example.com`;
  await request(app).post('/api/auth/register')
    .send({ name: 'Reset User', email, password: OLD_PASSWORD })
    .expect(201);
  return email;
}

async function login(email, password) {
  return request(app).post('/api/auth/login').send({ email, password });
}

// The forgot-password reply is sent before the email is written, so wait for it.
async function latestResetToken(email) {
  for (let i = 0; i < 50; i += 1) {
    const { rows } = await query(
      `SELECT body FROM mail_outbox WHERE to_address = $1 ORDER BY created_at DESC LIMIT 1`,
      [email],
    );
    const match = rows[0]?.body.match(/reset-password\?token=([A-Za-z0-9_-]+)/);
    if (match) return match[1];
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`no reset email for ${email}`);
}

async function requestReset(email) {
  return request(app).post('/api/auth/forgot-password').send({ email }).expect(202);
}

describe('password recovery (#29)', () => {
  test('known and unknown emails get exactly the same reply; only the known one gets an email', async () => {
    const email = await registeredUser();
    const known = await requestReset(email);
    const unknown = await requestReset('nobody-here@example.com');
    assert.deepEqual(known.body, unknown.body);

    assert.ok(await latestResetToken(email));
    await new Promise((resolve) => setTimeout(resolve, 200));
    const { rows } = await query(`SELECT count(*)::int AS n FROM mail_outbox WHERE to_address = 'nobody-here@example.com'`);
    assert.equal(rows[0].n, 0);
  });

  test('the link sets a new password, then works only once', async () => {
    const email = await registeredUser();
    await requestReset(email);
    const token = await latestResetToken(email);

    await request(app).post('/api/auth/reset-password').send({ token, password: NEW_PASSWORD }).expect(200);
    await login(email, OLD_PASSWORD).then((res) => assert.equal(res.status, 401));
    await login(email, NEW_PASSWORD).then((res) => assert.equal(res.status, 200));

    const again = await request(app).post('/api/auth/reset-password')
      .send({ token, password: 'Another789!' }).expect(400);
    assert.equal(again.body.code, 'INVALID_RESET_TOKEN');
  });

  test('resetting logs the account out everywhere and clears a lockout', async () => {
    const email = await registeredUser();
    const session = (await login(email, OLD_PASSWORD)).headers['set-cookie'][0].split(';')[0];
    for (let i = 0; i < 5; i += 1) await login(email, 'Wrong@999');
    assert.equal((await login(email, OLD_PASSWORD)).status, 429);

    await requestReset(email);
    await request(app).post('/api/auth/reset-password')
      .send({ token: await latestResetToken(email), password: NEW_PASSWORD }).expect(200);

    await request(app).get('/api/auth/me').set('Cookie', session).expect(401);
    assert.equal((await login(email, NEW_PASSWORD)).status, 200);
  });

  test('an expired link, an old link after a newer one, or a made-up link is refused', async () => {
    const email = await registeredUser();
    await requestReset(email);
    const first = await latestResetToken(email);
    await query(`DELETE FROM mail_outbox WHERE to_address = $1`, [email]);
    await requestReset(email);
    const second = await latestResetToken(email);

    await request(app).post('/api/auth/reset-password').send({ token: first, password: NEW_PASSWORD }).expect(400);
    await query(`UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute'`);
    await request(app).post('/api/auth/reset-password').send({ token: second, password: NEW_PASSWORD }).expect(400);
    await request(app).post('/api/auth/reset-password')
      .send({ token: 'x'.repeat(43), password: NEW_PASSWORD }).expect(400);
    assert.equal((await login(email, OLD_PASSWORD)).status, 200, 'old password still works');
  });

  test('only a hash of the token is stored', async () => {
    const email = await registeredUser();
    await requestReset(email);
    const token = await latestResetToken(email);
    const { rows } = await query(`SELECT token_hash FROM password_reset_tokens`);
    assert.equal(rows.length, 1);
    assert.notEqual(rows[0].token_hash, token);
    assert.match(rows[0].token_hash, /^[0-9a-f]{64}$/);
  });

  test('the new password must meet the registration rule', async () => {
    const email = await registeredUser();
    await requestReset(email);
    const res = await request(app).post('/api/auth/reset-password')
      .send({ token: await latestResetToken(email), password: 'short' }).expect(400);
    assert.ok(res.body.fields.password);
  });

  test('both recovery routes work without a session and are rate limited', async () => {
    const limited = createApp({ passwordResetRateLimit: 2 });
    for (let i = 0; i < 2; i += 1) {
      await request(limited).post('/api/auth/forgot-password').send({ email: 'a@example.com' }).expect(202);
    }
    const res = await request(limited).post('/api/auth/forgot-password').send({ email: 'a@example.com' }).expect(429);
    assert.equal(res.body.code, 'RATE_LIMITED');
  });
});
