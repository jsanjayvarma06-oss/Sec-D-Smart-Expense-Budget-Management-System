
 // Session management (SR03, SR07), API protection (SR01, SR08) and the
// Application Controller. Test plan IDs are noted where a case matches one.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { sessionCookieOptions } from '../src/middleware/requireAuth.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();

const app = createApp();

describe('sessions', () => {
  test('a valid session reaches protected routes and identifies the user', async () => {
    const user = await createUser();
    const cookie = await loginAs(user);
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200);

    assert.deepEqual(res.body.user, { ...user, role: 'user', two_factor_enabled: false });
  });

  test('the session cookie is HttpOnly and SameSite=Strict', () => {
    const options = sessionCookieOptions();
    assert.equal(options.httpOnly, true);
    assert.equal(options.sameSite, 'strict');
    assert.equal(options.path, '/');
  });

  test('only a hash of the session token is stored', async () => {
    const cookie = await loginAs(await createUser());
    const token = cookie.split('=')[1];
    const { rows } = await query('SELECT token_hash FROM sessions');

    assert.equal(rows.length, 1);
    assert.notEqual(rows[0].token_hash, token);
    assert.match(rows[0].token_hash, /^[0-9a-f]{64}$/);
  });

  test('SR03 logout revokes the token on the server and clears the cookie', async () => {
    const cookie = await loginAs(await createUser());
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .expect(204);

    assert.match(res.headers['set-cookie'][0], /^sid=;/);

    await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);
    const { rows } = await query('SELECT count(*)::int AS n FROM sessions');
    assert.equal(rows[0].n, 0);
  });

  test('logging out one device leaves the user’s other sessions working', async () => {
    const user = await createUser();
    const laptop = await loginAs(user);
    const phone = await loginAs(user);

    await request(app).post('/api/auth/logout').set('Cookie', laptop).expect(204);
    await request(app).get('/api/auth/me').set('Cookie', phone).expect(200);
  });

  test('IT_02 / SR07 a session idle past the timeout expires and is removed', async () => {
    const cookie = await loginAs(await createUser());
    await query(`UPDATE sessions SET last_seen_at = now() - interval '16 minutes'`);

    await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);
    const { rows } = await query('SELECT count(*)::int AS n FROM sessions');
    assert.equal(rows[0].n, 0);
  });

  test('activity resets the idle timer', async () => {
    const cookie = await loginAs(await createUser());
    await query(`UPDATE sessions SET last_seen_at = now() - interval '10 minutes'`);

    await request(app).get('/api/auth/me').set('Cookie', cookie).expect(200);
    await query(`UPDATE sessions SET last_seen_at = last_seen_at - interval '10 minutes'`);
    await request(app).get('/api/auth/me').set('Cookie', cookie).expect(200);
  });

  test('a session ends at its absolute lifetime even when active', async () => {
    const cookie = await loginAs(await createUser());
    await query(`UPDATE sessions SET expires_at = now() - interval '1 second'`);

    await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);
  });

  test('starting a session clears the user’s expired ones', async () => {
    const user = await createUser();
    await loginAs(user);
    await query(`UPDATE sessions SET expires_at = now() - interval '1 second'`);

    await loginAs(user);
    const { rows } = await query('SELECT count(*)::int AS n FROM sessions');
    assert.equal(rows[0].n, 1);
  });
});

describe('API protection (SR01, SR08)', () => {
  test('ST_01 a request with no session is refused', async () => {
    const res = await request(app).get('/api/auth/me').expect(401);

    assert.equal(res.body.code, 'UNAUTHENTICATED');
    assert.equal(res.body.user, undefined);
  });

  test('a forged token is refused', async () => {
    await request(app)
      .get('/api/auth/me')
      .set('Cookie', 'sid=forged-token')
      .expect(401);
  });

  test('every API route is protected by default, including ones added later', async () => {
    await request(app).get('/api/expenses').expect(401);
    await request(app).post('/api/expenses').send({}).expect(401);
    await request(app).delete('/api/budgets/123').expect(401);
  });

  test('only the health check, registration and login are public', async () => {
    await request(app).get('/api/health').expect(200);

    const register = await request(app)
      .post('/api/auth/register')
      .send({})
      .expect(400);

    assert.equal(register.body.code, 'VALIDATION');

    const login = await request(app)
      .post('/api/auth/login')
      .send({})
      .expect(400);

    assert.equal(login.body.code, 'VALIDATION');
  });

  test('unknown routes return 404 once logged in', async () => {
    const cookie = await loginAs(await createUser());

    await request(app)
      .get('/api/does-not-exist')
      .set('Cookie', cookie)
      .expect(404);
  });
});

describe('application controller', () => {
  test('rejects malformed JSON without leaking parser details', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Content-Type', 'application/json')
      .send('{"oops":')
      .expect(400);

    assert.equal(res.body.error, 'Request body is not valid JSON');
    assert.equal(res.body.stack, undefined);
  });

  test('rejects oversized request bodies', async () => {
    await request(app)
      .post('/api/anything')
      .send({ note: 'x'.repeat(20_000) })
      .expect(413);
  });

  test('sets security headers on every response', async () => {
    const res = await request(app).get('/api/health').expect(200);

    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.ok(res.headers['strict-transport-security']);
    assert.equal(res.headers['x-powered-by'], undefined);
  });
});
