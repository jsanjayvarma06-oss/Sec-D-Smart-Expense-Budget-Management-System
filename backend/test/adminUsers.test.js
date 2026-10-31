import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { recordFailedLogin } from '../src/services/loginProtection.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();

const app = createApp();

async function createAdmin(email = 'admin_user_test@test.com') {
  const user = await createUser(email, 'Admin Manager');
  await query(`UPDATE users SET role = 'admin' WHERE id = $1`, [user.id]);
  return user;
}

describe('Admin User Management (#113, #114, #115)', () => {
  test('requires an admin account', async () => {
    const user = await createUser('normal_user@test.com');
    const userCookie = await loginAs(user);

    await request(app).get('/api/admin/users').expect(401);
    await request(app).get('/api/admin/users').set('Cookie', userCookie).expect(403);
    await request(app).post(`/api/admin/users/${user.id}/unlock`).set('Cookie', userCookie).expect(403);
    await request(app).post(`/api/admin/users/${user.id}/logout`).set('Cookie', userCookie).expect(403);
    await request(app).post(`/api/admin/users/${user.id}/disable`).set('Cookie', userCookie).expect(403);
    await request(app).post(`/api/admin/users/${user.id}/enable`).set('Cookie', userCookie).expect(403);
  });

  test('lists and searches users with pagination (#114)', async () => {
    const admin = await createAdmin('admin_list@test.com');
    const adminCookie = await loginAs(admin);

    const user1 = await createUser('findme_first@test.com', 'Alice In Wonderland');
    await createUser('findme_second@test.com', 'Bob The Builder');

    const resAll = await request(app)
      .get('/api/admin/users?limit=10&page=1')
      .set('Cookie', adminCookie)
      .expect(200);

    assert.ok(Array.isArray(resAll.body.users));
    assert.ok(resAll.body.total >= 3);
    assert.equal(resAll.body.page, 1);
    assert.equal(resAll.body.limit, 10);

    const resSearch = await request(app)
      .get('/api/admin/users?search=findme_first')
      .set('Cookie', adminCookie)
      .expect(200);

    assert.equal(resSearch.body.users.length, 1);
    assert.equal(resSearch.body.users[0].email, user1.email);
    assert.equal(resSearch.body.users[0].name, user1.name);
    assert.equal(resSearch.body.users[0].status, 'active');
  });

  test('confirms no financial data is returned (#114)', async () => {
    const admin = await createAdmin('admin_privacy@test.com');
    const adminCookie = await loginAs(admin);
    const target = await createUser('target_privacy@test.com');

    // Insert an expense for target user
    await query(
      `INSERT INTO expenses (user_id, amount, date, merchant, note)
       VALUES ($1, 999.50, '2026-10-25', 'Secret Shop', 'Secret Note')`,
      [target.id],
    );

    const res = await request(app)
      .get(`/api/admin/users?search=${target.email}`)
      .set('Cookie', adminCookie)
      .expect(200);

    const userObj = res.body.users[0];
    assert.ok(userObj);
    assert.equal(userObj.expenses, undefined);
    assert.equal(userObj.income, undefined);
    assert.equal(userObj.budgets, undefined);
    assert.equal(userObj.notes, undefined);
    assert.equal(userObj.amount, undefined);
    assert.equal(JSON.stringify(userObj).includes('Secret Shop'), false);
    assert.equal(JSON.stringify(userObj).includes('999.50'), false);
  });

  test('unlocks a locked user account (#115)', async () => {
    const admin = await createAdmin('admin_unlocker@test.com');
    const adminCookie = await loginAs(admin);
    const target = await createUser('locked_target@test.com');

    // Trigger lockout
    for (let i = 0; i < 5; i++) {
      await recordFailedLogin(target.id);
    }

    const resLocked = await request(app)
      .get(`/api/admin/users?search=${target.email}`)
      .set('Cookie', adminCookie)
      .expect(200);
    assert.equal(resLocked.body.users[0].status, 'locked');

    await request(app)
      .post(`/api/admin/users/${target.id}/unlock`)
      .set('Cookie', adminCookie)
      .expect(200);

    const resUnlocked = await request(app)
      .get(`/api/admin/users?search=${target.email}`)
      .set('Cookie', adminCookie)
      .expect(200);
    assert.equal(resUnlocked.body.users[0].status, 'active');
  });

  test('logs out a user on all devices (#115)', async () => {
    const admin = await createAdmin('admin_logouter@test.com');
    const adminCookie = await loginAs(admin);
    const target = await createUser('multisession_target@test.com');

    const targetCookie1 = await loginAs(target);
    const targetCookie2 = await loginAs(target);

    // Both sessions work
    await request(app).get('/api/auth/me').set('Cookie', targetCookie1).expect(200);
    await request(app).get('/api/auth/me').set('Cookie', targetCookie2).expect(200);

    // Admin logs user out everywhere
    const logoutRes = await request(app)
      .post(`/api/admin/users/${target.id}/logout`)
      .set('Cookie', adminCookie)
      .expect(200);
    assert.ok(logoutRes.body.terminated_sessions >= 2);

    // Both sessions are now revoked
    await request(app).get('/api/auth/me').set('Cookie', targetCookie1).expect(401);
    await request(app).get('/api/auth/me').set('Cookie', targetCookie2).expect(401);
  });

  test('disables and enables an account, and admin cannot disable self (#115)', async () => {
    const admin = await createAdmin('admin_disabler@test.com');
    const adminCookie = await loginAs(admin);
    const target = await createUser('disable_target@test.com', 'Disable Target', 'SecurePassword123');

    // Admin cannot disable self
    const selfRes = await request(app)
      .post(`/api/admin/users/${admin.id}/disable`)
      .set('Cookie', adminCookie)
      .expect(400);
    assert.equal(selfRes.body.code, 'CANNOT_DISABLE_SELF');

    const targetCookie = await loginAs(target);
    await request(app).get('/api/auth/me').set('Cookie', targetCookie).expect(200);

    // Disable target
    await request(app)
      .post(`/api/admin/users/${target.id}/disable`)
      .set('Cookie', adminCookie)
      .expect(200);

    // Existing session revoked immediately
    await request(app).get('/api/auth/me').set('Cookie', targetCookie).expect(401);

    // Disabled user cannot log in
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: target.email, password: 'SecurePassword123' })
      .expect(403);
    assert.equal(loginRes.body.code, 'ACCOUNT_DISABLED');

    // Re-enable target
    await request(app)
      .post(`/api/admin/users/${target.id}/enable`)
      .set('Cookie', adminCookie)
      .expect(200);

    // Target can log in again
    await request(app)
      .post('/api/auth/login')
      .send({ email: target.email, password: 'SecurePassword123' })
      .expect(200);
  });
});
