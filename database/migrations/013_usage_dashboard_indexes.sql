-- Activity timestamp for privacy-safe weekly active user aggregates.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_last_active_at_idx
  ON users (last_active_at)
  WHERE last_active_at IS NOT NULL;

-- Indexes for the 30-day aggregate activity queries.
CREATE INDEX IF NOT EXISTS users_created_at_idx
  ON users (created_at);

CREATE INDEX IF NOT EXISTS expenses_created_at_idx
  ON expenses (created_at);
