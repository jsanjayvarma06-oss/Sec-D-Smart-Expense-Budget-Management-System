
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { useTestDatabase } from './helpers.js';
import { verifyPassword } from '../src/services/passwordService.js';

useTestDatabase();

const app = createApp();

describe('Authentication integration tests', () => {
  const validUser = () => ({
    name: 'Test User',
    email: `test-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
    password: 'StrongPass123!',
  });

  test('registration stores a bcrypt hash instead of plaintext', async () => {
    const user = validUser();

    const response = await request(app)
      .post('/api/auth/register')
      .send(user)
      .expect(201);

    assert.equal(response.body.user.email, user.email);
    assert.equal(response.body.user.name, user.name);
    assert.equal(response.body.user.password, undefined);
    assert.equal(response.body.user.password_hash, undefined);

    const { rows } = await query(
      'SELECT password_hash FROM users WHERE email = $1',
      [user.email],
    );

    assert.equal(rows.length, 1);
    assert.notEqual(rows[0].password_hash, user.password);
    assert.match(rows[0].password_hash, /^\$2[aby]\$/);
    assert.equal(
      await verifyPassword(user.password, rows[0].password_hash),
      true,
    );
  });

  test('login succeeds with the correct password and sets a session cookie', async () => {
    const user = validUser();

    await request(app)
      .post('/api/auth/register')
      .send(user)
      .expect(201);

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: user.email,
        password: user.password,
      })
      .expect(200);

    assert.equal(response.body.user.email, user.email);
    assert.equal(response.body.user.name, user.name);
    assert.ok(response.headers['set-cookie']);
    assert.match(response.headers['set-cookie'].join(';'), /sid=/);

    await request(app)
      .get('/api/auth/me')
      .set('Cookie', response.headers['set-cookie'])
      .expect(200);
  });

  test('login rejects an incorrect password', async () => {
    const user = validUser();

    await request(app)
      .post('/api/auth/register')
      .send(user)
      .expect(201);

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: user.email,
        password: 'WrongPassword123!',
      })
      .expect(401);

    assert.equal(response.body.code, 'INVALID_CREDENTIALS');
  });

  test('registration rejects an already registered email', async () => {
    const user = validUser();

    await request(app)
      .post('/api/auth/register')
      .send(user)
      .expect(201);

    const response = await request(app)
      .post('/api/auth/register')
      .send(user)
      .expect(409);

    assert.equal(response.body.code, 'EMAIL_EXISTS');
  });
});
