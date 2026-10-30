-- Admin management of the built-in categories (cards #128, #129).
--
-- The built-in categories are the rows with a NULL user_id. Migration 002 lets
-- users read them but never change them, and gives nobody the right to create
-- one. The admin panel needs to add, rename and remove them, and nothing else.
--
-- app_admin is a role the admin service switches to for those statements, the
-- same way withUser switches to app_user. It can touch built-in categories and
-- nothing else: it has no access to expenses, income, budgets, notes or any
-- other personal data, so the panel cannot read personal finances even if a
-- query is written wrongly. Removing a category that records still point at is
-- refused by the database's own foreign keys.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_admin') THEN
    CREATE ROLE app_admin NOLOGIN;
  END IF;
END
$$;

-- Lets the connecting role switch to app_admin (a no-op for superusers).
DO $$
BEGIN
  EXECUTE format('GRANT app_admin TO %I', current_user);
END
$$;

GRANT USAGE ON SCHEMA public TO app_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON categories TO app_admin;

CREATE POLICY admin_manage_defaults ON categories FOR ALL TO app_admin
  USING (user_id IS NULL)
  WITH CHECK (user_id IS NULL);
