-- Per-user data isolation enforced by the database itself (SR04).
--
-- Services still filter every query by user_id. These policies are the second
-- layer: if a query forgets that filter, or an ID in a URL is changed to point at
-- someone else's record, PostgreSQL returns nothing instead of the other user's
-- data. This is the defense-in-depth goal from the Secure Architecture Design.
--
-- How it works: data queries run inside db/userScope.js, which switches to the
-- app_user role and sets app.user_id for the transaction. app_user is not a
-- superuser or table owner, so the policies below always apply to it. When
-- app.user_id is missing the policies match no rows, so a mistake fails closed.
--
-- users and sessions are left out on purpose: only the Authentication Service
-- reads them, and login has to look a user up before anyone is authenticated.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END
$$;

-- Lets the connecting role switch to app_user (a no-op for superusers).
DO $$
BEGIN
  EXECUTE format('GRANT app_user TO %I', current_user);
END
$$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON categories, income, expenses, budgets, savings_goals, recurring_expenses, notifications
  TO app_user;

-- The logged-in user's ID for the current transaction, or NULL when unset.
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

GRANT EXECUTE ON FUNCTION app_current_user_id() TO app_user;

-- Tables where every row belongs to exactly one user.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'income', 'expenses', 'budgets', 'savings_goals', 'recurring_expenses', 'notifications'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY owner_only ON %I
         USING (user_id = app_current_user_id())
         WITH CHECK (user_id = app_current_user_id())',
      table_name
    );
  END LOOP;
END
$$;

-- Categories: everyone can read the built-in defaults (user_id NULL), but users
-- can only create, change or delete their own.
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories FORCE ROW LEVEL SECURITY;

CREATE POLICY read_defaults_and_own ON categories FOR SELECT
  USING (user_id IS NULL OR user_id = app_current_user_id());

CREATE POLICY insert_own ON categories FOR INSERT
  WITH CHECK (user_id = app_current_user_id());

CREATE POLICY update_own ON categories FOR UPDATE
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());

CREATE POLICY delete_own ON categories FOR DELETE
  USING (user_id = app_current_user_id());
