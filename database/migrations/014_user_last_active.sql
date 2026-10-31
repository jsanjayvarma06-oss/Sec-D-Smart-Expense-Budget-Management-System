-- Durable last-active timestamp for weekly active user metrics (#125).
-- Kept in its own migration so environments that already ran migration 013
-- still receive the column and index.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_last_active_at_idx
  ON users (last_active_at)
  WHERE last_active_at IS NOT NULL;
