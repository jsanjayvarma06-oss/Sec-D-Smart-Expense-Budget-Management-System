-- Retiring a built-in category removes it from new-entry choices without
-- deleting or rewriting historical expenses, budgets or recurring payments.
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS categories_active_defaults_idx
  ON categories (lower(name))
  WHERE user_id IS NULL AND retired_at IS NULL;
