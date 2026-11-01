-- Two-factor login: 10 single-use backup codes (story #103, card #105, #106).
-- Stored as SHA-256 hashes, marked used_at when consumed.
CREATE TABLE IF NOT EXISTS two_factor_backup_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash CHAR(64) NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS two_factor_backup_codes_user_idx
  ON two_factor_backup_codes (user_id);
