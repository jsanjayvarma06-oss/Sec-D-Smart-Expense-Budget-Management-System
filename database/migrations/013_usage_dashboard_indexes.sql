-- Indexes for the privacy-safe admin usage dashboard (#125, #126).
CREATE INDEX IF NOT EXISTS users_created_at_idx
  ON users (created_at);

CREATE INDEX IF NOT EXISTS expenses_created_at_idx
  ON expenses (created_at);

CREATE INDEX IF NOT EXISTS sessions_last_seen_at_idx
  ON sessions (last_seen_at);
