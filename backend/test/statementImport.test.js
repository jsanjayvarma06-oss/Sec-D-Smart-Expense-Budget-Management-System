import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { detectLayout, parseCSVLines } from '../src/services/statementImportService.js';
import { createUser, loginAs, useTestDatabase } from './helpers.js';

useTestDatabase();

const app = createApp();

describe('Bank Statement Import (#99, #100, #101, #102)', () => {
  describe('Layout detection (#100)', () => {
    test('recognizes Generic layout', () => {
      const headers = ['Date', 'Description', 'Amount'];
      const layout = detectLayout(headers);
      assert.ok(layout);
      assert.equal(layout.dateIndex, 0);
      assert.equal(layout.descIndex, 1);
      assert.equal(layout.debitIndex, 2);
    });

    test('recognizes SBI layout', () => {
      const headers = ['Txn Date', 'Value Date', 'Description', 'Ref No.', 'Debit', 'Credit', 'Balance'];
      const layout = detectLayout(headers);
      assert.ok(layout);
      assert.equal(layout.dateIndex, 0);
      assert.equal(layout.descIndex, 2);
      assert.equal(layout.debitIndex, 4);
      assert.equal(layout.creditIndex, 5);
    });

    test('recognizes HDFC layout', () => {
      const headers = ['Date', 'Narration', 'Chq/Ref No', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'];
      const layout = detectLayout(headers);
      assert.ok(layout);
      assert.equal(layout.dateIndex, 0);
      assert.equal(layout.descIndex, 1);
      assert.equal(layout.debitIndex, 4);
      assert.equal(layout.creditIndex, 5);
    });

    test('recognizes ICICI layout', () => {
      const headers = ['Transaction Date', 'Value Date', 'Transaction Remarks', 'Withdrawal Amount (INR )', 'Deposit Amount (INR )', 'Balance (INR )'];
      const layout = detectLayout(headers);
      assert.ok(layout);
      assert.equal(layout.dateIndex, 0);
      assert.equal(layout.descIndex, 2);
      assert.equal(layout.debitIndex, 3);
      assert.equal(layout.creditIndex, 4);
    });

    test('refuses unknown layout', () => {
      const headers = ['Random1', 'Random2', 'Random3'];
      assert.equal(detectLayout(headers), null);
    });
  });

  describe('File size limit (#100)', () => {
    test('refuses file over 1 MB with clear error', async () => {
      const user = await createUser('largefile@test.com');
      const cookie = await loginAs(user);

      // Create a 1.2 MB string
      const hugeCsv = 'Date,Description,Amount\n' + '2026-10-20,Shop,100\n'.repeat(60000);

      const res = await request(app)
        .post('/api/expenses/import/preview')
        .set('Cookie', cookie)
        .send({ csv: hugeCsv })
        .expect(400);

      assert.equal(res.body.code, 'FILE_TOO_LARGE');
    });
  });

  describe('Preview & duplicate detection (#101)', () => {
    test('detects duplicates and suggests categories', async () => {
      const user = await createUser('preview_test@test.com');
      const cookie = await loginAs(user);

      // Insert an existing expense
      await query(
        `INSERT INTO expenses (user_id, amount, date, merchant, note)
         VALUES ($1, 450.00, '2026-10-25', 'Swiggy', 'Dinner')`,
        [user.id],
      );

      const csv = `Date,Description,Amount
2026-10-25,UPI-SWIGGY-12345,450.00
2026-10-26,UBER TRIP BANGALORE,220.00`;

      const res = await request(app)
        .post('/api/expenses/import/preview')
        .set('Cookie', cookie)
        .send({ csv })
        .expect(200);

      assert.equal(res.body.total_found, 2);
      assert.equal(res.body.duplicate_count, 1);

      const [item1, item2] = res.body.transactions;
      // Item 1 matches existing expense
      assert.equal(item1.is_duplicate, true);
      assert.equal(item1.amount, 450);
      assert.equal(item1.category_name, 'Food');

      // Item 2 is novel
      assert.equal(item2.is_duplicate, false);
      assert.equal(item2.amount, 220);
      assert.equal(item2.category_name, 'Transport');
    });
  });

  describe('Atomic import API (#102)', () => {
    test('imports selected rows in one transaction', async () => {
      const user = await createUser('atomic_import_user@test.com');
      const cookie = await loginAs(user);

      const items = [
        { amount: 150.0, date: '2026-10-20', merchant: 'Coffee Shop', note: 'Coffee' },
        { amount: 350.0, date: '2026-10-21', merchant: 'Book Store', note: 'Books' },
      ];

      const res = await request(app)
        .post('/api/expenses/import')
        .set('Cookie', cookie)
        .send({ expenses: items })
        .expect(201);

      assert.equal(res.body.count, 2);
      assert.equal(res.body.expenses.length, 2);

      const { rows } = await query(
        'SELECT * FROM expenses WHERE user_id = $1 ORDER BY date ASC',
        [user.id],
      );
      assert.equal(rows.length, 2);
      assert.equal(Number(rows[0].amount), 150);
      assert.equal(Number(rows[1].amount), 350);
    });

    test('rolls back completely if any row is invalid (all-or-nothing)', async () => {
      const user = await createUser('rollback_import_user@test.com');
      const cookie = await loginAs(user);

      const items = [
        { amount: 100.0, date: '2026-10-20', merchant: 'Valid Shop' },
        { amount: -50.0, date: '2026-10-21', merchant: 'Bad Negative Amount' }, // Invalid!
      ];

      const res = await request(app)
        .post('/api/expenses/import')
        .set('Cookie', cookie)
        .send({ expenses: items })
        .expect(400);

      assert.equal(res.body.code, 'VALIDATION');

      // Verify ZERO rows were saved
      const { rows } = await query(
        'SELECT * FROM expenses WHERE user_id = $1',
        [user.id],
      );
      assert.equal(rows.length, 0);
    });
  });
});
