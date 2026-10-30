
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { query } from '../src/db/pool.js';
import {
  createUser,
  useTestDatabase,
} from './helpers.js';
import {
  generateDueRecurringExpenses,
  markRecurringExpensePaid,
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

  test('marks a generated recurring expense cycle as paid', async () => {
    const user = await createUser();
    const recurring = await createRecurringExpense(user.id, {
      cycle: 'weekly',
      startDate: '2026-10-01',
      nextDueDate: '2026-10-01',
    });

    await generateDueRecurringExpenses(user.id, '2026-10-01');

    const result = await markRecurringExpensePaid(
      user.id,
      recurring.id,
      '2026-10-01',
    );

    assert.ok(result);
    assert.equal(result.last_paid_due_date, '2026-10-01');
  });

  test('does not mark a date paid when no generated expense exists for that date', async () => {
    const user = await createUser();
    const recurring = await createRecurringExpense(user.id, {
      cycle: 'weekly',
      startDate: '2026-10-01',
      nextDueDate: '2026-10-01',
    });

    const result = await markRecurringExpensePaid(
      user.id,
      recurring.id,
      '2026-10-01',
    );

    assert.equal(result, null);
  });

  test('rejects an invalid payment date', async () => {
    await assert.rejects(
      markRecurringExpensePaid('user-id', 'recurring-id', '2026-02-30'),
      /valid YYYY-MM-DD date/,
    );
  });


  describe('monthly payments that start at the end of a month (#53)', () => {
    async function dueDates(userId, id) {
      const { rows } = await query(
        `SELECT spent_on::text AS spent_on FROM expenses
         WHERE recurring_expense_id = $1 ORDER BY spent_on`,
        [id],
      );
      return rows.map((row) => row.spent_on);
    }

    test('31 Jan, 28 Feb, 31 Mar: the day comes back after a short month', async () => {
      const user = await createUser();
      const recurring = await createRecurringExpense(user.id, {
        cycle: 'monthly', startDate: '2026-01-31', nextDueDate: '2026-01-31',
      });

      await generateDueRecurringExpenses(user.id, '2026-05-31');

      assert.deepEqual(await dueDates(user.id, recurring.id), [
        '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31',
      ]);
      const { rows } = await query(
        'SELECT next_due_date::text AS next FROM recurring_expenses WHERE id = $1',
        [recurring.id],
      );
      assert.equal(rows[0].next, '2026-06-30');
    });

    test('a payment on the 30th is only moved in February', async () => {
      const user = await createUser();
      const recurring = await createRecurringExpense(user.id, {
        cycle: 'monthly', startDate: '2026-01-30', nextDueDate: '2026-01-30',
      });

      await generateDueRecurringExpenses(user.id, '2026-04-30');

      assert.deepEqual(await dueDates(user.id, recurring.id), [
        '2026-01-30', '2026-02-28', '2026-03-30', '2026-04-30',
      ]);
    });

    test('a leap year keeps 29 February, then returns to the 29th', async () => {
      const user = await createUser();
      const recurring = await createRecurringExpense(user.id, {
        cycle: 'monthly', startDate: '2028-01-29', nextDueDate: '2028-01-29',
      });

      await generateDueRecurringExpenses(user.id, '2028-03-29');

      assert.deepEqual(await dueDates(user.id, recurring.id), [
        '2028-01-29', '2028-02-29', '2028-03-29',
      ]);
    });

    test('the day survives a change of year', async () => {
      const user = await createUser();
      const recurring = await createRecurringExpense(user.id, {
        cycle: 'monthly', startDate: '2026-11-30', nextDueDate: '2026-11-30',
      });

      await generateDueRecurringExpenses(user.id, '2027-03-30');

      assert.deepEqual(await dueDates(user.id, recurring.id), [
        '2026-11-30', '2026-12-30', '2027-01-30', '2027-02-28', '2027-03-30',
      ]);
    });

    test('a later run carries on from the saved date and still returns to the 31st', async () => {
      const user = await createUser();
      const recurring = await createRecurringExpense(user.id, {
        cycle: 'monthly', startDate: '2026-01-31', nextDueDate: '2026-01-31',
      });

      await generateDueRecurringExpenses(user.id, '2026-02-28');
      await generateDueRecurringExpenses(user.id, '2026-04-30');

      assert.deepEqual(await dueDates(user.id, recurring.id), [
        '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
      ]);
    });

    test('a payment that started mid-month is unchanged', async () => {
      const user = await createUser();
      const recurring = await createRecurringExpense(user.id, {
        cycle: 'monthly', startDate: '2026-01-15', nextDueDate: '2026-01-15',
      });

      await generateDueRecurringExpenses(user.id, '2026-03-15');

      assert.deepEqual(await dueDates(user.id, recurring.id), [
        '2026-01-15', '2026-02-15', '2026-03-15',
      ]);
    });

    test('weekly payments still move seven days at a time', async () => {
      const user = await createUser();
      const recurring = await createRecurringExpense(user.id, {
        cycle: 'weekly', startDate: '2026-01-31', nextDueDate: '2026-01-31',
      });

      await generateDueRecurringExpenses(user.id, '2026-02-14');

      assert.deepEqual(await dueDates(user.id, recurring.id), [
        '2026-01-31', '2026-02-07', '2026-02-14',
      ]);
    });
  });
});
