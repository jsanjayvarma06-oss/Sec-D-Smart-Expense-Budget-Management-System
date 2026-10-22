import { after, before, beforeEach } from 'node:test';
import { pool, query } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { createSession } from '../src/services/sessionService.js';

const databaseName = new URL(process.env.DATABASE_URL).pathname.slice(1);
if (!databaseName.endsWith('_test')) {
  throw new Error(`Refusing to run tests against "${databaseName}": use a *_test database`);
}

// Migrates once per test file and starts every test with no users. Deleting
// users cascades to their sessions and records.
export function useTestDatabase() {
  before(() => migrate({ log: () => {} }));
  beforeEach(() => query('DELETE FROM users'));
  after(() => pool.end());
}

// Inserts a user directly, standing in for registration. The password hash is a
// placeholder because these tests never check a password.
export async function createUser(email = 'user1@test.com', name = 'Test User') {
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, 'placeholder-hash') RETURNING id, name, email`,
    [name, email],
  );
  return rows[0];
}

// Starts a session the way the login endpoint will, and returns a Cookie header
// value for requests made as this user.
export async function loginAs(user) {
  const token = await createSession(user.id);
  return `sid=${token}`;
}
