
import { withUser } from '../db/userScope.js';

export async function listCategories(userId) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `SELECT id, user_id, name, created_at
       FROM categories
       WHERE user_id IS NULL OR user_id = $1
       ORDER BY
         CASE WHEN user_id IS NULL THEN 0 ELSE 1 END,
         lower(name) ASC`,
      [userId],
    );

    return rows;
  });
}

export async function createCategory(userId, category) {
  return withUser(userId, async (db) => {
    // Check for a duplicate name, ignoring letter case.
    const existing = await db.query(
      `SELECT id
       FROM categories
       WHERE lower(name) = lower($1)
         AND (user_id IS NULL OR user_id = $2)
       LIMIT 1`,
      [category.name, userId],
    );

    if (existing.rows.length > 0) {
      return null;
    }

    const { rows } = await db.query(
      `INSERT INTO categories (user_id, name)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING id, user_id, name, created_at`,
      [userId, category.name],
    );

    return rows[0] ?? null;
  });
}

export async function updateCategory(userId, categoryId, category) {
  return withUser(userId, async (db) => {
    // Do not allow a custom category to duplicate another visible category.
    const existing = await db.query(
      `SELECT id
       FROM categories
       WHERE lower(name) = lower($1)
         AND (user_id IS NULL OR user_id = $2)
         AND id <> $3
       LIMIT 1`,
      [category.name, userId, categoryId],
    );

    if (existing.rows.length > 0) {
      return null;
    }

    const { rows } = await db.query(
      `UPDATE categories
       SET name = $1
       WHERE id = $2 AND user_id = $3
       RETURNING id, user_id, name, created_at`,
      [category.name, categoryId, userId],
    );

    return rows[0] ?? null;
  });
}

export async function deleteCategory(userId, categoryId) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `DELETE FROM categories
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [categoryId, userId],
    );

    return rows.length > 0;
  });
}
