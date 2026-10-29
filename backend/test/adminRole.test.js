import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { promoteToAdmin } from '../src/services/adminService.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();

const app = createApp();
const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function createAdmin(email = 'admin@test.com') {
  const user = await createUser(email, 'Admin User');
  await promoteToAdmin(email);
  return user;
}

// Runs the create-admin command the way npm run admin:create does.
function runCreateAdmin(...args) {
  return promisify(execFile)(process.execPath, ['scripts/createAdmin.js', ...args], {
    cwd: backendDir,
    env: process.env,
  }).then(
    (result) => ({ code: 0, ...result }),
    (err) => ({ code: err.code, stdout: err.stdout, stderr: err.stderr }),
  );
}

describe('Admin role (#110)', () => {
  test('everyone who registers is a user', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'New Person', email: 'new@test.com', password: 'Str0ng!Pass' })
      .expect(201);

    const { rows } = await query(`SELECT role FROM users WHERE email = 'new@test.com'`);
    assert.equal(rows[0].role, 'user');
  });

  test('the role must be user or admin', async () => {
    const user = await createUser();
    await assert.rejects(query(`UPDATE users SET role = 'owner' WHERE id = $1`, [user.id]));
  });

  test('promoteToAdmin makes an existing account an admin, ignoring case', async () => {
    await createUser('person@test.com');
    const admin = await promoteToAdmin('  PERSON@test.com ');
    assert.equal(admin.role, 'admin');
    assert.equal(admin.email, 'person@test.com');
  });

  test('promoteToAdmin refuses an unknown email and creates nothing', async () => {
    assert.equal(await promoteToAdmin('nobody@test.com'), null);
    const { rows } = await query('SELECT count(*)::int AS n FROM users');
    assert.equal(rows[0].n, 0);
  });

  test('the create-admin command promotes a registered account', async () => {
    await createUser('cli@test.com');
    const result = await runCreateAdmin('cli@test.com');

    assert.equal(result.code, 0);
    assert.match(result.stdout, /cli@test\.com is now an admin/);
    const { rows } = await query(`SELECT role FROM users WHERE email = 'cli@test.com'`);
    assert.equal(rows[0].role, 'admin');
  });

  test('the create-admin command refuses an unknown email', async () => {
    const result = await runCreateAdmin('ghost@test.com');
    assert.equal(result.code, 1);
    assert.match(result.stderr, /No account uses that email/);
  });

  test('/api/auth/me includes the role', async () => {
    const user = await createUser();
    const admin = await createAdmin();

    const asUser = await request(app).get('/api/auth/me').set('Cookie', await loginAs(user)).expect(200);
    const asAdmin = await request(app).get('/api/auth/me').set('Cookie', await loginAs(admin)).expect(200);

    assert.equal(asUser.body.user.role, 'user');
    assert.equal(asAdmin.body.user.role, 'admin');
  });
});

describe('requireAdmin on /api/admin (#111)', () => {
  test('a logged-out request is refused', async () => {
    await request(app).get('/api/admin/overview').expect(401);
  });

  test('a user who is not an admin gets 403, also for paths that do not exist', async () => {
    const cookie = await loginAs(await createUser());

    const res = await request(app).get('/api/admin/overview').set('Cookie', cookie).expect(403);
    assert.equal(res.body.code, 'FORBIDDEN');
    await request(app).get('/api/admin/no-such-page').set('Cookie', cookie).expect(403);
    await request(app).post('/api/admin/overview').set('Cookie', cookie).expect(403);
  });

  test('an admin is allowed and sees counts only', async () => {
    await createUser('a@test.com');
    await createUser('b@test.com');
    const admin = await createAdmin();

    const res = await request(app).get('/api/admin/overview').set('Cookie', await loginAs(admin)).expect(200);
    assert.deepEqual(res.body.overview, { user_count: 3, admin_count: 1, locked_count: 0 });
    assert.doesNotMatch(JSON.stringify(res.body), /@test\.com/);
  });

  test('losing the admin role takes effect on the next request', async () => {
    const admin = await createAdmin();
    const cookie = await loginAs(admin);
    await request(app).get('/api/admin/overview').set('Cookie', cookie).expect(200);

    await query(`UPDATE users SET role = 'user' WHERE id = $1`, [admin.id]);
    await request(app).get('/api/admin/overview').set('Cookie', cookie).expect(403);
  });

  test('a refused attempt is logged without personal data', async () => {
    const user = await createUser('private.person@test.com', 'Private Person');
    const cookie = await loginAs(user);
    const lines = [];
    const original = { log: console.log, env: process.env.NODE_ENV };
    // The logger stays quiet in tests, so switch it on and capture what it writes.
    process.env.NODE_ENV = 'development';
    console.log = (line) => lines.push(String(line));
    try {
      await request(app).get('/api/admin/overview').set('Cookie', cookie).expect(403);
    } finally {
      console.log = original.log;
      process.env.NODE_ENV = original.env;
    }

    const entry = lines.map((line) => JSON.parse(line)).find((e) => e.message === 'Admin access refused');
    assert.ok(entry, 'the refusal is logged');
    assert.equal(entry.user_id, user.id);
    assert.equal(entry.path, '/api/admin/overview');
    const logged = lines.join('\n');
    assert.doesNotMatch(logged, /private\.person|Private Person/);
    assert.doesNotMatch(logged, new RegExp(cookie.slice(4)));
  });
});
