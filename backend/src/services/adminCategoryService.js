// Admin management of the built-in categories (cards #128, #129). Admins can
// add, rename and remove the categories every user sees. Nothing here reads or
// writes anyone's expenses, income, budgets or notes: the statements run as the
// app_admin database role (migration 011), which can only touch categories with
// no owner. Every action is recorded in the audit log in the same transaction.

import { pool } from '../db/pool.js';
import { recordAdminAction } from './auditLogService.js';
import { SUGGESTED_CATEGORY_NAMES } from './merchantCategoryService.js';

// Runs fn(db, audit) in one transaction. Statements on categories run as
// app_admin; audit(...) switches back to write the log entry, so the change
// and its record are saved together or not at all.
async function asAdmin(adminId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE app_admin');
    const audit = async (action, details = {}) => {
      await client.query('RESET ROLE');
      await recordAdminAction({ adminId, action, details }, client);
      await client.query('SET LOCAL ROLE app_admin');
    };
    const result = await fn(client, audit);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// The built-in categories, and the names the merchant suggestion looks for, so
// the screen can warn before one of those is renamed or removed.
export async function listDefaultCategories(adminId) {
  return asAdmin(adminId, async (db, audit) => {
    const { rows } = await db.query(
      `SELECT id, name, created_at, retired_at
       FROM categories
       WHERE user_id IS NULL
       ORDER BY lower(name)`,
    );
    await audit('view_default_categories');
    return { categories: rows, suggestion_names: SUGGESTED_CATEGORY_NAMES };
  });
}

// A duplicate name (ignoring case) throws a 23505 unique violation.
export async function createDefaultCategory(adminId, name) {
  return asAdmin(adminId, async (db, audit) => {
    const { rows } = await db.query(
      `INSERT INTO categories (user_id, name)
       VALUES (NULL, $1)
       RETURNING id, name, created_at, retired_at`,
      [name],
    );
    await audit('create_default_category', { category: rows[0].name });
    return rows[0];
  });
}

// Returns null when there is no built-in category with this ID.
export async function renameDefaultCategory(adminId, categoryId, name) {
  return asAdmin(adminId, async (db, audit) => {
    const { rows: current } = await db.query(
      'SELECT name FROM categories WHERE id = $1 AND user_id IS NULL FOR UPDATE',
      [categoryId],
    );
    if (!current[0]) return null;

    const { rows } = await db.query(
      `UPDATE categories SET name = $1
       WHERE id = $2 AND user_id IS NULL
       RETURNING id, name, created_at, retired_at`,
      [name, categoryId],
    );
    await audit('rename_default_category', {
      renamed_from: current[0].name,
      renamed_to: rows[0].name,
    });
    return rows[0];
  });
}

 
// Retire a built-in category without changing historical records. Returns
// null for an unknown/non-built-in ID and false if it is already retired.
export async function retireDefaultCategory(adminId, categoryId) {
  return asAdmin(adminId, async (db, audit) => {
    const { rows } = await db.query(
      `UPDATE categories
       SET retired_at = now()
       WHERE id = $1 AND user_id IS NULL AND retired_at IS NULL
       RETURNING id, name, created_at, retired_at`,
      [categoryId],
    );
    if (!rows[0]) {
      const { rows: existing } = await db.query(
        'SELECT id, name, retired_at FROM categories WHERE id = $1 AND user_id IS NULL',
        [categoryId],
      );
      if (!existing[0]) return null;
      return { already_retired: true, ...existing[0] };
    }
    await audit('retire_default_category', { category: rows[0].name, category_id: categoryId });
    return rows[0];
  });
}

// Restore a retired built-in category to new-entry selection.
export async function restoreDefaultCategory(adminId, categoryId) {
  return asAdmin(adminId, async (db, audit) => {
    const { rows } = await db.query(
      `UPDATE categories
       SET retired_at = NULL
       WHERE id = $1 AND user_id IS NULL AND retired_at IS NOT NULL
       RETURNING id, name, created_at, retired_at`,
      [categoryId],
    );
    if (!rows[0]) {
      const { rows: existing } = await db.query(
        'SELECT id, name, retired_at FROM categories WHERE id = $1 AND user_id IS NULL',
        [categoryId],
      );
      return existing[0] ? { already_active: true, ...existing[0] } : null;
    }
    await audit('restore_default_category', { category: rows[0].name, category_id: categoryId });
    return rows[0];
  });
}

// Returns false when there is no built-in category with this ID. Throws a
// 23503 foreign key violation while expenses, budgets or recurring payments
// still use it.
export async function deleteDefaultCategory(adminId, categoryId) {
  return asAdmin(adminId, async (db, audit) => {
    const { rows } = await db.query(
      'DELETE FROM categories WHERE id = $1 AND user_id IS NULL RETURNING name',
      [categoryId],
    );
    if (!rows[0]) return false;
    await audit('delete_default_category', { category: rows[0].name });
    return true;
  });
}
