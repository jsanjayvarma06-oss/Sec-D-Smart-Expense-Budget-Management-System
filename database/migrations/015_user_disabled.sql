-- User management: ability to disable and re-enable user accounts (story #113, card #115).
-- A disabled user cannot log in and any existing sessions are revoked immediately.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_disabled_at_idx
  ON users (disabled_at)
  WHERE disabled_at IS NOT NULL;
