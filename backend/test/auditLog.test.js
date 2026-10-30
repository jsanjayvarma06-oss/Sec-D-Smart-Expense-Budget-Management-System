import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { adminRoutes } from '../src/routes/adminRoutes.js';
import { promoteToAdmin } from '../src/services/adminService.js';
import { recordAdminAction } from '../src/services/auditLogService.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();

const app = createApp();

// The audit log has no foreign keys and can't be emptied, so entries from
// earlier tests stay. Every test looks only at its own admin's entries.
async function entriesBy(adminId) {
  const { rows } = await query(
    'SELECT action, target_user_id, details FROM admin_audit_log WHERE admin_id = $1 ORDER BY id',
    [adminId],
  );
  return rows;
}

async function createAdmin(email = 'admin@test.com') {
  const user = await createUser(email, 'Admin User');
  await promoteToAdmin(email);
  return user;
}

describe('Audit log table (#123)', () => {
  test('records who did what, to which account and when', async () => {
    const admin = await createAdmin();
    const target = await createUser('target@test.com');

    const entry = await recordAdminAction({
      adminId: admin.id,
      action: 'unlock_account',
      targetUserId: target.id,
      details: { reason: 'asked by phone' },
    });

    assert.equal(entry.admin_id, admin.id);
    assert.equal(entry.action, 'unlock_account');
    assert.equal(entry.target_user_id, target.id);
    assert.deepEqual(entry.details, { reason: 'asked by phone' });
    assert.ok(Date.now() - entry.created_at.getTime() < 60_000);
  });

  test('refuses a missing admin or a badly formed action name', async () => {
    const admin = await createAdmin();
    await assert.rejects(recordAdminAction({ action: 'view_overview' }), /admin ID/);
    await assert.rejects(recordAdminAction({ adminId: admin.id, action: 'Drop table' }), /Invalid admin action/);
    await assert.rejects(query(
      `INSERT INTO admin_audit_log (admin_id, action) VALUES ($1, 'Bad Name')`, [admin.id],
    ));
  });

  test('details never keep emails, amounts or notes', async () => {
    const admin = await createAdmin();
    await recordAdminAction({
      adminId: admin.id,
      action: 'test_action',
      details: { email: 'someone@test.com', amount: '500.00', note: 'rent', section: 'users' },
    });

    const [entry] = await entriesBy(admin.id);
    assert.deepEqual(entry.details, {
      email: '[REDACTED]', amount: '[REDACTED]', note: '[REDACTED]', section: 'users',
    });
  });

  test('entries cannot be edited, deleted or truncated, even directly in the database', async () => {
    const admin = await createAdmin();
    const entry = await recordAdminAction({ adminId: admin.id, action: 'view_overview' });

    await assert.rejects(
      query(`UPDATE admin_audit_log SET action = 'something_else' WHERE id = $1`, [entry.id]),
      /append-only: UPDATE/,
    );
    await assert.rejects(query('DELETE FROM admin_audit_log WHERE id = $1', [entry.id]), /append-only: DELETE/);
    await assert.rejects(query('TRUNCATE admin_audit_log'), /append-only: TRUNCATE/);

    assert.deepEqual((await entriesBy(admin.id)).map((e) => e.action), ['view_overview']);
  });

  test("deleting an admin's account keeps their entries", async () => {
    const admin = await createAdmin();
    await recordAdminAction({ adminId: admin.id, action: 'view_overview' });

    await query('DELETE FROM users WHERE id = $1', [admin.id]);
    assert.equal((await entriesBy(admin.id)).length, 1);
  });
});

// One request per admin route. A new route must be added here, which makes
// whoever adds it record an audit entry for it.
const ADMIN_ROUTE_CALLS = {
  'GET /overview': { action: 'view_overview', call: (cookie) => request(app).get('/api/admin/overview').set('Cookie', cookie) },
};

describe('recordAdminAction is used by every admin route (#123)', () => {
  test('the list above covers every admin route', () => {
    const routes = adminRoutes().stack
      .filter((layer) => layer.route)
      .flatMap((layer) => Object.keys(layer.route.methods)
        .map((method) => `${method.toUpperCase()} ${layer.route.path}`));

    assert.deepEqual(routes.sort(), Object.keys(ADMIN_ROUTE_CALLS).sort());
  });

  for (const [route, { action, call }] of Object.entries(ADMIN_ROUTE_CALLS)) {
    test(`${route} records "${action}"`, async () => {
      const admin = await createAdmin();
      await call(await loginAs(admin)).expect(200);

      assert.deepEqual((await entriesBy(admin.id)).map((e) => e.action), [action]);
    });
  }

  test('a refused request from someone who is not an admin records nothing', async () => {
    const user = await createUser();
    await ADMIN_ROUTE_CALLS['GET /overview'].call(await loginAs(user)).expect(403);
    assert.equal((await entriesBy(user.id)).length, 0);
  });
});
