-- Initial schema for the Smart Expense & Budget Management System.
--
-- Every table holding financial data carries user_id, and the application filters
-- every query by the logged-in user's ID (SR04). Amounts are NUMERIC so totals are
-- exact (NFR04); floating point is never used for money.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Users and sessions (FR01, SR02, SR03, SR07, SR09)
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               VARCHAR(100) NOT NULL,
  email              VARCHAR(254) NOT NULL,
  password_hash      TEXT NOT NULL,           -- secure hash, never the password (SR02)
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until       TIMESTAMPTZ,             -- set after repeated failed logins (SR09)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Server-side sessions so a token can be revoked on logout (SR03) and expired
-- after inactivity (SR07). Only a SHA-256 hash of the token is stored, so a
-- leaked database does not hand out working sessions.
CREATE TABLE sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash   CHAR(64) NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);

-- ---------------------------------------------------------------------------
-- Categories (FR04). user_id NULL marks a built-in default category.
-- ---------------------------------------------------------------------------

CREATE TABLE categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users (id) ON DELETE CASCADE,
  name       VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX categories_name_unique
  ON categories (user_id, lower(name)) NULLS NOT DISTINCT;

-- ---------------------------------------------------------------------------
-- Income (FR02)
-- ---------------------------------------------------------------------------

CREATE TABLE income (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  amount       NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  source       VARCHAR(100) NOT NULL,
  received_on  DATE NOT NULL,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  note         VARCHAR(255),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX income_user_date_idx ON income (user_id, received_on);

CREATE TRIGGER income_updated_at BEFORE UPDATE ON income
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Recurring expenses (FR16, FR17)
-- ---------------------------------------------------------------------------

CREATE TABLE recurring_expenses (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category_id        UUID NOT NULL REFERENCES categories (id),
  amount             NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  cycle              VARCHAR(10) NOT NULL CHECK (cycle IN ('weekly', 'monthly')),
  start_date         DATE NOT NULL,
  next_due_date      DATE NOT NULL,
  last_paid_due_date DATE,                    -- reminders stop once this cycle is paid
  note               VARCHAR(255),
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX recurring_user_due_idx ON recurring_expenses (user_id, next_due_date);

CREATE TRIGGER recurring_expenses_updated_at BEFORE UPDATE ON recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Expenses (FR03, FR04, FR11)
-- ---------------------------------------------------------------------------

CREATE TABLE expenses (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category_id          UUID NOT NULL REFERENCES categories (id),
  amount               NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  spent_on             DATE NOT NULL,
  note                 VARCHAR(255),
  recurring_expense_id UUID REFERENCES recurring_expenses (id) ON DELETE SET NULL,
  is_flagged           BOOLEAN NOT NULL DEFAULT false,  -- unusual spending, awaiting review
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX expenses_user_date_idx ON expenses (user_id, spent_on);
CREATE INDEX expenses_user_category_idx ON expenses (user_id, category_id);

-- A recurring expense generates at most one entry per due date (FR16).
CREATE UNIQUE INDEX expenses_recurring_cycle_unique
  ON expenses (recurring_expense_id, spent_on)
  WHERE recurring_expense_id IS NOT NULL;

CREATE TRIGGER expenses_updated_at BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Budgets (FR06, FR07). category_id NULL is the overall monthly budget.
-- ---------------------------------------------------------------------------

CREATE TABLE budgets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  month       DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  category_id UUID REFERENCES categories (id),
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX budgets_user_month_category_unique
  ON budgets (user_id, month, category_id) NULLS NOT DISTINCT;

CREATE TRIGGER budgets_updated_at BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Savings goals (FR14, FR15)
-- ---------------------------------------------------------------------------

CREATE TABLE savings_goals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  target_amount NUMERIC(12, 2) NOT NULL CHECK (target_amount > 0),
  saved_amount  NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (saved_amount >= 0),
  target_date   DATE,
  status        VARCHAR(10) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'completed', 'archived')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX savings_goals_user_idx ON savings_goals (user_id);

CREATE TRIGGER savings_goals_updated_at BEFORE UPDATE ON savings_goals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Notifications (FR09, FR17). dedupe_key stops the same alert being sent
-- twice, e.g. 'budget:<id>:80' for one threshold crossing (test IT_07).
-- ---------------------------------------------------------------------------

CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       VARCHAR(30) NOT NULL
             CHECK (type IN ('budget_warning', 'budget_exceeded', 'payment_reminder',
                             'payment_overdue', 'goal_reached', 'unusual_spending')),
  message    VARCHAR(255) NOT NULL,
  dedupe_key VARCHAR(100) NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);

CREATE INDEX notifications_user_unread_idx ON notifications (user_id, is_read);
