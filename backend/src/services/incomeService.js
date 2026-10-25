
import { withUser } from '../db/userScope.js';

export async function createIncome(userId, income) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO income
        (user_id, amount, source, received_on, is_recurring, note)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, amount, source, received_on, is_recurring, note,
                 created_at, updated_at`,
      [
        userId,
        income.amount,
        income.source,
        income.received_on,
        income.is_recurring,
        income.note ?? null,
      ],
    );

    return rows[0];
  });
}

export async function listIncome(userId) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `SELECT id, amount, source, received_on, is_recurring, note,
              created_at, updated_at
       FROM income
       WHERE user_id = $1
       ORDER BY received_on DESC, created_at DESC`,
      [userId],
    );

    return rows;
  });
}

export async function updateIncome(userId, incomeId, income) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `UPDATE income
       SET amount = $1,
           source = $2,
           received_on = $3,
           is_recurring = $4,
           note = $5
       WHERE id = $6 AND user_id = $7
       RETURNING id, amount, source, received_on, is_recurring, note,
                 created_at, updated_at`,
      [
        income.amount,
        income.source,
        income.received_on,
        income.is_recurring,
        income.note ?? null,
        incomeId,
        userId,
      ],
    );

    return rows[0] ?? null;
  });
}

export async function deleteIncome(userId, incomeId) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `DELETE FROM income
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [incomeId, userId],
    );

    return rows.length > 0;
  });
}
