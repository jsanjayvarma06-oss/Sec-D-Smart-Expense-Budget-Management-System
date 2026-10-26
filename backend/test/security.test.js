// Security requirements checked end to end through the real routes:
// SR06 HTTPS in production (#27), SR10 nothing sensitive in logs (#28) and
// SR09 lockout and rate limits on the real login route (#30).

import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { query } from '../src/db/pool.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { useTestDatabase } from './helpers.js';

useTestDatabase();

const PASSWORD = 'StrongPass123!';
let counter = 0;
const newEmail = () => `sec-${Date.now()}-${(counter += 1)}@example.com`;

async function register(app, email, extra = (r) => r) {
  await extra(request(app).post('/api/auth/register'))
    .send({ name: 'Security Test', email, password: PASSWORD })
    .expect(201);
}

describe('SR06 HTTPS in production (#27)', () => {
  const saved = { isProduction: config.isProduction, secureCookie: config.session.secureCookie };
  after(() => {
    config.isProduction = saved.isProduction;
    config.session.secureCookie = saved.secureCookie;
  });

  test('plain HTTP is refused; HTTPS through the proxy works and the cookie is Secure', async () => {
    config.isProduction = true;
    config.session.secureCookie = true;
    const app = createApp();
    const https = (r) => r.set('X-Forwarded-Proto', 'https');

    const plain = await request(app).get('/api/health').expect(403);
    assert.equal(plain.body.error, 'HTTPS is required');
    await https(request(app).get('/api/health')).expect(200);

    const email = newEmail();
    await register(app, email, https);
    const login = await https(request(app).post('/api/auth/login'))
      .send({ email, password: PASSWORD })
      .expect(200);
    const cookie = login.headers['set-cookie'].find((c) => c.startsWith('sid='));
    assert.match(cookie, /;\s*Secure/i);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
  });

  test('every response asks browsers to use HTTPS from now on (HSTS)', async () => {
    const res = await request(createApp()).get('/api/health');
    assert.match(res.headers['strict-transport-security'], /max-age=\d+/);
  });
});

describe('SR09 lockout and rate limits on the real login route (#30)', () => {
  test('5 wrong passwords lock the account, even against the right password, until the lock ends', async () => {
    const app = createApp({ loginRateLimit: 1000 });
    const email = newEmail();
    await register(app, email);
    const attempt = (password) => request(app).post('/api/auth/login').send({ email, password });

    for (let i = 0; i < 5; i += 1) await attempt('Wrong@999').expect(401);
    const locked = await attempt(PASSWORD).expect(429);
    assert.equal(locked.body.code, 'ACCOUNT_LOCKED');

    await query(`UPDATE users SET locked_until = now() - interval '1 second' WHERE email = $1`, [email]);
    await attempt(PASSWORD).expect(200);
    const { rows } = await query('SELECT failed_login_count FROM users WHERE email = $1', [email]);
    assert.equal(rows[0].failed_login_count, 0);
  });

  test('every API route is rate limited per source', async () => {
    const app = createApp({ apiRateLimit: 3 });
    for (let i = 0; i < 3; i += 1) await request(app).get('/api/health').expect(200);
    const res = await request(app).get('/api/health').expect(429);
    assert.equal(res.body.code, 'RATE_LIMITED');
  });
});

describe('SR10 nothing sensitive in logs or errors (#28)', () => {
  test('a realistic session writes no amounts, notes, emails, passwords or tokens to the log', async () => {
    const app = createApp({ loginRateLimit: 1000 });
    const email = newEmail();
    const lines = [];
    const original = { log: console.log, error: console.error, env: process.env.NODE_ENV };
    // The logger stays quiet in tests, so switch it on and capture what it writes.
    process.env.NODE_ENV = 'development';
    console.log = (line) => lines.push(String(line));
    console.error = (line) => lines.push(String(line));

    let cookieToken;
    try {
      await register(app, email);
      await request(app).post('/api/auth/login').send({ email, password: 'Wrong@999' }).expect(401);
      const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
      const cookie = login.headers['set-cookie'].find((c) => c.startsWith('sid=')).split(';')[0];
      cookieToken = cookie.slice(4);

      const { rows } = await query(`SELECT id FROM categories WHERE user_id IS NULL ORDER BY name LIMIT 1`);
      await request(app).post('/api/expenses').set('Cookie', cookie)
        .send({ amount: 98765.43, category_id: rows[0].id, spent_on: new Date().toISOString().slice(0, 10), merchant: 'Secret Merchant', note: 'my-private-note' })
        .expect(201);
      await request(app).post('/api/expenses').set('Cookie', cookie).send({ amount: -5 }).expect(400);
      await request(app).get('/api/expenses').set('Cookie', 'sid=forged-token').expect(401);
      await request(app).post('/api/expenses').set('Cookie', cookie)
        .set('Content-Type', 'application/json').send('{"amount": 98765.43,').expect(400);

      // An unexpected failure carrying row data in its detail, as PostgreSQL errors do.
      const res = { status() { return this; }, json() {} };
      const err = Object.assign(new Error('boom'), { detail: 'Failing row contains (98765.43, my-private-note)' });
      errorHandler(err, { method: 'POST', originalUrl: '/api/expenses' }, res);
    } finally {
      console.log = original.log;
      console.error = original.error;
      process.env.NODE_ENV = original.env;
    }

    const log = lines.join('\n');
    // The events that should be logged were: a failed login, a refused session
    // and the unexpected error.
    for (const message of ['Failed login attempt', 'Unauthorized request', 'Unhandled error']) {
      assert.ok(log.includes(message), `expected a "${message}" log line`);
    }
    for (const secret of ['98765.43', 'my-private-note', 'Secret Merchant', email, PASSWORD, 'Wrong@999', cookieToken, 'forged-token']) {
      assert.ok(!log.includes(secret), `log must not contain ${secret}`);
    }
  });

  test('error responses carry no stack trace or database detail', async () => {
    const captured = {};
    const res = { status(code) { captured.status = code; return this; }, json(body) { captured.body = body; } };
    const original = console.error;
    console.error = () => {};
    try {
      errorHandler(Object.assign(new Error('relation "x" does not exist'), { detail: 'secret' }), { method: 'GET', originalUrl: '/api/x' }, res);
    } finally {
      console.error = original;
    }
    assert.equal(captured.status, 500);
    assert.deepEqual(captured.body, { error: 'Something went wrong. Please try again.' });
  });
});
