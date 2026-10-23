
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { query } from '../src/db/pool.js';
import {
  createUser,
  useTestDatabase,
} from './helpers.js';
import {
  generateDueRecurringExpenses,
} from '../src/services/recurringExpenseService.js';

useTestDatabase();

async function createRecurringExpense(userId, {
  cycle = 'weekly',
  startDate = '2026-10-01',
  nextDueDate = '2026-10-01',
} = {}) {
  const { rows: categories } = await query(
    `INSERT INTO categories (user_id, name)
     VALUES ($1, $2)
     RETURNING id`,
    [userId, `Recurring ${Math.random()}`],
  );

  const { rows } = await query(
    `INSERT INTO recurring_expenses
       (user_id, category_id, amount, cycle, start_date, next_due_date, note)
     VALUES ($1, $2, 250, $3, $4::date, $5::date, 'Test recurring payment')
     RETURNING id`,
    [userId, categories[0].id, cycle, startDate, nextDueDate],
  );

  return rows[0];
}

describe('Recurring expense generation', () => {
  test('rejects an invalid date', async () => {
    await assert.rejects(
      generateDueRecurringExpenses('user-id', '2026-02-30'),
      /valid YYYY-MM-DD date/,
    );
  });

  test('generates due weekly expenses and advances the next date', async () => {
    const user = await createUser();
    await createRecurringExpense(user.id);

    const generated = await generateDueRecurringExpenses(
      user.id,
      '2026-10-15',
    );

    assert.equal(generated.length, 3);
    assert.deepEqual(
      generated.map((expense) => expense.spent_on),
      ['2026-10-01', '2026-10-08', '2026-10-15'],
    );

    const { rows } = await query(
      `SELECT next_due_date::text AS next_due_date
       FROM recurring_expenses WHERE user_id = $1`,
      [user.id],
    );

    assert.equal(rows[0].next_due_date, '2026-10-22');
  });

  test('does not generate expenses before their due date', async () => {
    const user = await createUser();
    await createRecurringExpense(user.id, {
      nextDueDate: '2026-10-10',
    });

    const generated = await generateDueRecurringExpenses(
      user.id,
      '2026-10-09',
    );

    assert.equal(generated.length, 0);
  });

  test('generates monthly expenses without duplicates on repeated runs', async () => {
    const user = await createUser();
    await createRecurringExpense(user.id, {
      cycle: 'monthly',
      startDate: '2026-08-31',
      nextDueDate: '2026-08-31',
    });

    const first = await generateDueRecurringExpenses(user.id, '2026-10-31');
    const second = await generateDueRecurringExpenses(user.id, '2026-10-31');

    assert.equal(first.length, 3);
    assert.equal(second.length, 0);

    const { rows } = await query(
      `SELECT COUNT(*)::integer AS count
       FROM expenses WHERE user_id = $1 AND recurring_expense_id IS NOT NULL`,
      [user.id],
    );

    assert.equal(rows[0].count, 3);
  });
});
