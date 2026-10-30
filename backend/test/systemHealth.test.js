import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { promoteToAdmin } from '../src/services/adminService.js';
import {
  findLastBackup,
  getSystemHealth,
  rateBackup,
  rateDatabaseSize,
  rateErrors,
} from '../src/services/systemHealthService.js';
import { errorsInLastDay, logger } from '../src/utils/logger.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();

const app = createApp();
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const HOUR = 60 * 60 * 1000;

// A backups folder holding the given file names.
async function backupFolder(...names) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'health-backups-'));
  for (const name of names) await fs.writeFile(path.join(dir, name), '');
  return dir;
}

// The file name scripts/backup.js would write at `date`.
function backupName(date) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `smart_expense-${stamp}.dump`;
}

describe('Health states (#121)', () => {
  test('a backup is green within 26 hours, amber within 7 days, red after or when missing', () => {
    const now = new Date('2026-10-30T12:00:00Z');
    assert.equal(rateBackup(new Date(now - 2 * HOUR), now), 'green');
    assert.equal(rateBackup(new Date(now - 26 * HOUR), now), 'green');
    assert.equal(rateBackup(new Date(now - 27 * HOUR), now), 'amber');
    assert.equal(rateBackup(new Date(now - 7 * 24 * HOUR), now), 'amber');
    assert.equal(rateBackup(new Date(now - 8 * 24 * HOUR), now), 'red');
    assert.equal(rateBackup(null, now), 'red');
  });

  test('database size turns amber at 1 GB and red at 5 GB', () => {
    assert.equal(rateDatabaseSize(50 * 1024 ** 2), 'green');
    assert.equal(rateDatabaseSize(1024 ** 3), 'amber');
    assert.equal(rateDatabaseSize(5 * 1024 ** 3), 'red');
  });

  test('errors are green at none, amber from 1 and red from 10', () => {
    assert.equal(rateErrors(0), 'green');
    assert.equal(rateErrors(1), 'amber');
    assert.equal(rateErrors(9), 'amber');
    assert.equal(rateErrors(10), 'red');
  });

  test('logged errors are counted for 24 hours', () => {
    const before = errorsInLastDay();
    const original = console.error;
    console.error = () => {};
    try {
      logger.error('Test error for the health count');
    } finally {
      console.error = original;
    }

    assert.equal(errorsInLastDay(), before + 1);
    assert.equal(errorsInLastDay(Date.now() + 25 * HOUR), 0);
  });
});

describe('Last backup time (#121)', () => {
  test('reads the newest backup file and skips partial or unrelated files', async () => {
    const dir = await backupFolder(
      'smart_expense-20261022-062521.dump',
      'smart_expense-20261029-010203.dump',
      'smart_expense-20261030-000000.dump.partial',
      'notes.txt',
    );

    assert.deepEqual(await findLastBackup(dir), {
      file: 'smart_expense-20261029-010203.dump',
      at: '2026-10-29T01:02:03.000Z',
    });
  });

  test('no folder or no backup files means no backup', async () => {
    assert.equal(await findLastBackup(path.join(os.tmpdir(), 'no-such-backups-folder')), null);
    assert.equal(await findLastBackup(await backupFolder('notes.txt')), null);
  });

  test('a fresh backup is green and an old one red', async () => {
    const now = new Date();
    const fresh = await getSystemHealth({ now, backupDir: await backupFolder(backupName(new Date(now - HOUR))) });
    const old = await getSystemHealth({ now, backupDir: await backupFolder(backupName(new Date(now - 10 * 24 * HOUR))) });

    assert.equal(fresh.items.last_backup.state, 'green');
    assert.equal(old.items.last_backup.state, 'red');
    assert.equal(old.overall, 'red');
  });
});

describe('GET /api/admin/health (#121)', () => {
  test('only admins can see it', async () => {
    await request(app).get('/api/admin/health').expect(401);
    await request(app).get('/api/admin/health').set('Cookie', await loginAs(await createUser())).expect(403);
  });

  test('shows every item with a green, amber or red state', async () => {
    const admin = await createUser('admin@test.com', 'Admin User');
    await promoteToAdmin('admin@test.com');

    const { body: { health } } = await request(app)
      .get('/api/admin/health')
      .set('Cookie', await loginAs(admin))
      .expect(200);

    assert.deepEqual(Object.keys(health.items), [
      'api', 'database', 'migrations', 'database_size', 'last_backup', 'errors',
    ]);
    for (const item of Object.values(health.items)) {
      assert.ok(['green', 'amber', 'red'].includes(item.state));
    }
    assert.ok(['green', 'amber', 'red'].includes(health.overall));

    assert.equal(health.items.api.version, version);
    assert.equal(health.items.database.state, 'green');
    assert.equal(health.items.migrations.state, 'green');
    assert.deepEqual(health.items.migrations.pending, []);
    assert.ok(health.items.migrations.applied >= 10);
    assert.ok(health.items.database_size.bytes > 0);
    assert.equal(typeof health.items.errors.count, 'number');
  });
});
