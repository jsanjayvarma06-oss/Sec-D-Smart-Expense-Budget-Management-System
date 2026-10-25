import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { detectUnusualSpending } from '../src/services/anomalyDetectionService.js';
import { createUser, useTestDatabase } from './helpers.js';
import { query } from '../src/db/pool.js';

useTestDatabase();

async function createCategory(userId) {
  const { rows } = await query(
    `INSERT INTO categories (user_id, name)
     VALUES ($1, $2)
     RETURNING id`,
    [userId, 'Anomaly Test Category'],
  );
  return rows[0].id;
}

async function addExpense(userId, categoryId, amount, day) {
  await query(
    `INSERT INTO expenses (user_id, category_id, amount, spent_on)
     VALUES ($1, $2, $3, $4::date)`,
    [userId, categoryId, amount, `2026-09-${String(day).padStart(2, '0')}`],
  );
}

describe('Unusual spending detection', () => {
  test('does not flag when there is insufficient history', async () => {
    const user = await createUser();
    const categoryId = await createCategory(user.id);

    for (let day = 1; day <= 4; day += 1) {
      await addExpense(user.id, categoryId, 100, day);
    }

    const result = await detectUnusualSpending(user.id, 1000, categoryId);

    assert.equal(result.isUnusual, false);
    assert.equal(result.historyCount, 4);
  });

  test('flags an amount more than three times the historical average', async () => {
    const user = await createUser();
    const categoryId = await createCategory(user.id);

    for (let day = 1; day <= 5; day += 1) {
      await addExpense(user.id, categoryId, 100, day);
    }

    const result = await detectUnusualSpending(user.id, 301, categoryId);

    assert.equal(result.isUnusual, true);
    assert.equal(result.averageAmount, 100);
    assert.equal(result.thresholdAmount, 300);
    assert.equal(result.historyCount, 5);
  });

  test('does not flag an amount at the threshold', async () => {
    const user = await createUser();
    const categoryId = await createCategory(user.id);

    for (let day = 1; day <= 5; day += 1) {
      await addExpense(user.id, categoryId, 100, day);
    }

    const result = await detectUnusualSpending(user.id, 300, categoryId);

    assert.equal(result.isUnusual, false);
  });
});
