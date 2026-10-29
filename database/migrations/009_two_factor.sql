-- Two-factor login with an authenticator app (story #103).
--
-- Both secrets are stored encrypted with AES-256-GCM (TWO_FACTOR_KEY), never
-- as plain text. The pending secret belongs to a setup that hasn't been
-- confirmed with a code yet; confirming moves it to two_factor_secret.

ALTER TABLE users
  ADD COLUMN two_factor_secret TEXT,
  ADD COLUMN two_factor_pending_secret TEXT,
  ADD COLUMN two_factor_enabled_at TIMESTAMPTZ;
