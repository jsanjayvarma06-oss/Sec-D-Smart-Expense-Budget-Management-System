import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { adminRoutes } from '../src/routes/adminRoutes.js';
import { promoteToAdmin } from '../src/services/adminService.js';
import { listAdminActions, recordAdminAction } from '../src/services/auditLogService.js';
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
  'GET /users': { action: 'view_users', call: (cookie) => request(app).get('/api/admin/users').set('Cookie', cookie) },
  'POST /users/:id/unlock': {
    action: 'unlock_user',
    call: async (cookie) => request(app)
      .post(`/api/admin/users/${(await createUser('target_unlock@test.com')).id}/unlock`)
      .set('Cookie', cookie),
  },
  'POST /users/:id/logout': {
    action: 'logout_user_all',
    call: async (cookie) => request(app)
      .post(`/api/admin/users/${(await createUser('target_logout@test.com')).id}/logout`)
      .set('Cookie', cookie),
  },
  'POST /users/:id/disable': {
    action: 'disable_user',
    call: async (cookie) => request(app)
      .post(`/api/admin/users/${(await createUser('target_disable@test.com')).id}/disable`)
      .set('Cookie', cookie),
  },
  'POST /users/:id/enable': {
    action: 'enable_user',
    call: async (cookie) => request(app)
      .post(`/api/admin/users/${(await createUser('target_enable@test.com')).id}/enable`)
      .set('Cookie', cookie),
  },
  'GET /health': { action: 'view_system_health', call: (cookie) => request(app).get('/api/admin/health').set('Cookie', cookie) },
  'GET /usage': { action: 'view_usage_dashboard', call: (cookie) => request(app).get('/api/admin/usage').set('Cookie', cookie) },
  'GET /audit-log': { action: 'view_audit_log', call: (cookie) => request(app).get('/api/admin/audit-log').set('Cookie', cookie) },
  'GET /categories': { action: 'view_default_categories', call: (cookie) => request(app).get('/api/admin/categories').set('Cookie', cookie) },
  'POST /categories': {
    action: 'create_default_category',
    status: 201,
    call: (cookie) => request(app).post('/api/admin/categories').set('Cookie', cookie).send({ name: 'Audit probe added' }),
  },
  'PUT /categories/:id': {
    action: 'rename_default_category',
    call: async (cookie) => request(app)
      .put(`/api/admin/categories/${await probeCategory()}`)
      .set('Cookie', cookie)
      .send({ name: 'Audit probe renamed' }),
  },
  'POST /categories/:id/retire': {
    action: 'retire_default_category',
    call: async (cookie) => request(app)
      .post(`/api/admin/categories/${await probeCategory()}/retire`)
      .set('Cookie', cookie),
  },
  'POST /categories/:id/restore': {
    action: 'restore_default_category',
    call: async (cookie) => {
      const id = await probeCategory();
      await query('UPDATE categories SET retired_at = now() WHERE id = $1', [id]);
      return request(app).post(`/api/admin/categories/${id}/restore`).set('Cookie', cookie);
    },
  },
  'DELETE /categories/:id': {
    action: 'delete_default_category',
    status: 204,
    call: async (cookie) => request(app)
      .delete(`/api/admin/categories/${await probeCategory()}`)
      .set('Cookie', cookie),
  },
};

// A built-in category made just for these tests, so the real ones are never
// renamed or removed.
async function probeCategory() {
  const { rows } = await query(
    `INSERT INTO categories (user_id, name) VALUES (NULL, 'Audit probe') RETURNING id`,
  );
  return rows[0].id;
}

describe('recordAdminAction is used by every admin route (#123)', () => {
  test('the list above covers every admin route', () => {
    const routes = adminRoutes().stack
      .filter((layer) => layer.route)
      .flatMap((layer) => Object.keys(layer.route.methods)
        .map((method) => `${method.toUpperCase()} ${layer.route.path}`));

    assert.deepEqual(routes.sort(), Object.keys(ADMIN_ROUTE_CALLS).sort());
  });

  afterEach(() => query(
    `DELETE FROM categories WHERE user_id IS NULL AND name LIKE 'Audit probe%'`,
  ));

  for (const [route, { action, call, status = 200 }] of Object.entries(ADMIN_ROUTE_CALLS)) {
    test(`${route} records "${action}"`, async () => {
      const admin = await createAdmin();
      const response = await call(await loginAs(admin));
      assert.equal(response.status, status);

      assert.deepEqual((await entriesBy(admin.id)).map((e) => e.action), [action]);
    });
  }

  test('a refused request from someone who is not an admin records nothing', async () => {
    const user = await createUser();
    await ADMIN_ROUTE_CALLS['GET /overview'].call(await loginAs(user)).expect(403);
    assert.equal((await entriesBy(user.id)).length, 0);
  });
});

// An entry at a chosen time, the way recordAdminAction would write it.
async function addEntry(adminId, action, createdAt, targetUserId = null) {
  await query(
    `INSERT INTO admin_audit_log (admin_id, action, target_user_id, created_at)
     VALUES ($1, $2, $3, $4)`,
    [adminId, action, targetUserId, createdAt],
  );
}

function auditLog(cookie, filters = {}) {
  return request(app).get('/api/admin/audit-log').query(filters).set('Cookie', cookie);
}

describe('GET /api/admin/audit-log (#124)', () => {
  test('lists entries newest first with the admin and the account they acted on', async () => {
    const admin = await createAdmin();
    const target = await createUser('target@test.com', 'Target Person');
    await addEntry(admin.id, 'unlock_account', '2026-10-01T10:00:00Z', target.id);
    await addEntry(admin.id, 'view_overview', '2026-10-02T10:00:00Z');

    const { body } = await auditLog(await loginAs(admin), { admin_id: admin.id }).expect(200);

    assert.deepEqual(body.entries.map((e) => e.action), ['view_overview', 'unlock_account']);
    const [, unlock] = body.entries;
    assert.equal(unlock.admin_name, 'Admin User');
    assert.equal(unlock.target_user_id, target.id);
    assert.equal(unlock.target_name, 'Target Person');
    assert.equal(unlock.target_email, 'target@test.com');
    assert.equal(unlock.created_at, '2026-10-01T10:00:00.000Z');
  });

  test('filters by admin', async () => {
    const first = await createAdmin('first@test.com');
    const second = await createAdmin('second@test.com');
    await addEntry(first.id, 'view_overview', '2026-10-01T10:00:00Z');
    await addEntry(second.id, 'view_overview', '2026-10-01T11:00:00Z');

    const { body } = await auditLog(await loginAs(first), { admin_id: second.id }).expect(200);
    assert.deepEqual(body.entries.map((e) => e.admin_id), [second.id]);
  });

  test('filters by action', async () => {
    const admin = await createAdmin();
    await addEntry(admin.id, 'view_overview', '2026-10-01T10:00:00Z');
    await addEntry(admin.id, 'view_system_health', '2026-10-01T11:00:00Z');

    const { body } = await auditLog(await loginAs(admin), {
      admin_id: admin.id, action: 'view_system_health',
    }).expect(200);
    assert.deepEqual(body.entries.map((e) => e.action), ['view_system_health']);
  });

  test('filters by date: from is included, to is not', async () => {
    const admin = await createAdmin();
    await addEntry(admin.id, 'day_before', '2026-10-09T23:59:59Z');
    await addEntry(admin.id, 'first_moment', '2026-10-10T00:00:00Z');
    await addEntry(admin.id, 'last_moment', '2026-10-10T23:59:59Z');
    await addEntry(admin.id, 'day_after', '2026-10-11T00:00:00Z');

    const { body } = await auditLog(await loginAs(admin), {
      admin_id: admin.id, from: '2026-10-10T00:00:00.000Z', to: '2026-10-11T00:00:00.000Z',
    }).expect(200);
    assert.deepEqual(body.entries.map((e) => e.action), ['last_moment', 'first_moment']);
  });

  test('empty filters mean any', async () => {
    const admin = await createAdmin();
    // Dated now, so it is among the newest 100 however many entries earlier
    // tests (and earlier runs) have left in the append-only log.
    await addEntry(admin.id, 'view_overview', new Date().toISOString());

    const { body } = await auditLog(await loginAs(admin), {
      admin_id: '', action: '', from: '', to: '',
    }).expect(200);
    assert.ok(body.entries.some((e) => e.admin_id === admin.id));
  });

  test('refuses filters that are not valid', async () => {
    const cookie = await loginAs(await createAdmin());
    await auditLog(cookie, { admin_id: 'not-an-id' }).expect(400);
    await auditLog(cookie, { action: 'DROP TABLE' }).expect(400);
    await auditLog(cookie, { from: 'yesterday' }).expect(400);
    const res = await auditLog(cookie, {
      from: '2026-10-11T00:00:00.000Z', to: '2026-10-10T00:00:00.000Z',
    }).expect(400);
    assert.match(res.body.error, /start date must be before the end date/);
  });

  test('lists the admins and actions in the log for the filters', async () => {
    const admin = await createAdmin();
    const gone = await createAdmin('gone@test.com');
    await addEntry(admin.id, 'view_overview', '2026-10-01T10:00:00Z');
    await addEntry(gone.id, 'view_system_health', '2026-10-01T10:00:00Z');
    await query('DELETE FROM users WHERE id = $1', [gone.id]);

    const { body } = await auditLog(await loginAs(admin)).expect(200);
    assert.ok(body.admins.some((a) => a.id === admin.id && a.name === 'Admin User'));
    assert.ok(!body.admins.some((a) => a.id === gone.id));
    assert.ok(body.actions.includes('view_overview'));
    assert.ok(body.actions.includes('view_system_health'));

    // The deleted admin's entry stays, without a name.
    const { body: goneLog } = await auditLog(await loginAs(admin), { admin_id: gone.id }).expect(200);
    assert.equal(goneLog.entries.length, 1);
    assert.equal(goneLog.entries[0].admin_name, null);
  });

  test('says when there are more entries than it returns', async () => {
    const admin = await createAdmin();
    for (const day of ['01', '02', '03']) await addEntry(admin.id, 'view_overview', `2026-10-${day}T10:00:00Z`);

    const two = await listAdminActions({ adminId: admin.id, limit: 2 });
    assert.equal(two.entries.length, 2);
    assert.equal(two.has_more, true);
    assert.equal((await listAdminActions({ adminId: admin.id, limit: 3 })).has_more, false);
  });

  test('viewing the log is recorded with the filters used', async () => {
    const admin = await createAdmin();
    await auditLog(await loginAs(admin), { action: 'view_overview' }).expect(200);

    const [entry] = await entriesBy(admin.id);
    assert.equal(entry.action, 'view_audit_log');
    assert.deepEqual(entry.details, { action: 'view_overview' });
  });
});
