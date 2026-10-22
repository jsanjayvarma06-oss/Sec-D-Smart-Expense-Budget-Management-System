// Runs a function with database access limited to one user's rows (SR04).
//
// Every service that reads or writes income, expenses, budgets, goals, recurring
// expenses, categories or notifications must go through withUser. Inside it the
// row-level security policies from migration 002 apply, so even a query that
// forgets "WHERE user_id = $1" cannot see or change another user's data.
//
//   const expense = await withUser(req.user.id, async (db) => {
//     const { rows } = await db.query('SELECT * FROM expenses WHERE id = $1', [id]);
//     return rows[0];   // undefined if the expense belongs to someone else
//   });
//
// Keep the user_id filter in queries anyway: it documents intent and lets the
// database use the (user_id, ...) indexes.

import { pool } from './pool.js';

export async function withUser(userId, fn) {
  if (!userId) throw new Error('withUser needs the logged-in user ID');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE app_user');
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
