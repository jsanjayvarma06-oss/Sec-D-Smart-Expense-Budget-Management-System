// Fills a load-test database for NFR01 and NFR05.
//
//   DATABASE_URL=postgres://…/smart_expense_load node scripts/load/seed.js --users 1000 --per-user 100
//
// Creates the given number of users, each with `--per-user` expenses spread
// over the last 12 months plus a year of monthly income and this month's
// budget, and one "heavy" user with a year of daily spending (5 a day) for the
// dashboard timing. Sessions are created directly and their cookies written to
// backend/test-results/load-sessions.json for the load runner.
//
// The database name must end in _load: this deletes every user in it.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import pg from 'pg';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) => (
  arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []));
const users = Number(args.users ?? 1000);
const perUser = Number(args['per-user'] ?? 100);
const url = process.env.DATABASE_URL;
const dbName = new URL(url).pathname.slice(1);
if (!dbName.endsWith('_load')) throw new Error(`Refusing to seed "${dbName}": use a database whose name ends in _load`);

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-results');
const db = new pg.Client({ connectionString: url });
await db.connect();

const started = Date.now();
const passwordHash = await bcrypt.hash('LoadTest@123', 12);

await db.query('DELETE FROM users');
await db.query(`
  INSERT INTO users (name, email, password_hash)
  SELECT 'Load User ' || n, 'load' || n || '@example.test', $1 FROM generate_series(1, $2) AS n`,
[passwordHash, users]);
await db.query(`INSERT INTO users (name, email, password_hash) VALUES ('Heavy User', 'heavy@example.test', $1)`, [passwordHash]);

// Expenses: random default category, amount 20–2500, a date in the last 12 months (never in the future).
await db.query(`
  INSERT INTO expenses (user_id, category_id, amount, spent_on, note)
  SELECT u.id,
         (SELECT id FROM categories WHERE user_id IS NULL ORDER BY md5(u.id::text || g::text || name) LIMIT 1),
         round((20 + random() * 2480)::numeric, 2),
         CURRENT_DATE - (random() * 364)::int,
         'load test'
  FROM users u CROSS JOIN generate_series(1, $1) AS g
  WHERE u.email LIKE 'load%'`, [perUser]);

// The heavy user: 5 expenses a day for a year.
await db.query(`
  INSERT INTO expenses (user_id, category_id, amount, spent_on, note)
  SELECT u.id,
         (SELECT id FROM categories WHERE user_id IS NULL ORDER BY md5(d::text || k::text || name) LIMIT 1),
         round((20 + random() * 980)::numeric, 2),
         CURRENT_DATE - d,
         'daily spending'
  FROM users u CROSS JOIN generate_series(0, 364) AS d CROSS JOIN generate_series(1, 5) AS k
  WHERE u.email = 'heavy@example.test'`);

await db.query(`
  INSERT INTO income (user_id, amount, source, received_on)
  SELECT u.id, 25000, 'Salary', (date_trunc('month', CURRENT_DATE) - make_interval(months => m))::date
  FROM users u CROSS JOIN generate_series(0, 11) AS m`);
await db.query(`
  INSERT INTO budgets (user_id, month, amount)
  SELECT id, date_trunc('month', CURRENT_DATE)::date, 30000 FROM users`);

// One session per user, so the load runner doesn't need 1000 bcrypt logins.
const { rows } = await db.query(`SELECT id, email FROM users ORDER BY email`);
const sessions = [];
const values = [];
for (const user of rows) {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.push({ email: user.email, cookie: `sid=${token}` });
  values.push(user.id, crypto.createHash('sha256').update(token).digest('hex'));
}
for (let i = 0; i < values.length; i += 1000) {
  const chunk = values.slice(i, i + 1000);
  const placeholders = [];
  for (let j = 0; j < chunk.length; j += 2) placeholders.push(`($${j + 1}, $${j + 2}, now() + interval '12 hours')`);
  await db.query(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ${placeholders.join(',')}`, chunk);
}
await db.query('ANALYZE');

const { rows: [counts] } = await db.query(
  `SELECT (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM expenses)::int AS expenses,
          (SELECT count(*) FROM income)::int AS income`,
);
await db.end();

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'load-sessions.json'), JSON.stringify(sessions));
console.log(`Seeded ${counts.users} users, ${counts.expenses} expenses, ${counts.income} income records in ${((Date.now() - started) / 1000).toFixed(1)} s`);
