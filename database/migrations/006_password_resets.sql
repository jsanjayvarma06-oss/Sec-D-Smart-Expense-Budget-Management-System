-- Password recovery (UC-01 alternate flow 8b, card #29).
--
-- Like sessions, reset tokens are only handled by the Authentication Service,
-- before the user is logged in, so they are not behind row-level security.
-- Only a SHA-256 hash of each token is stored.

CREATE TABLE password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens (user_id);

-- Emails waiting to be read when no SMTP server is configured (development and
-- tests). Production sets SMTP_URL and nothing is written here.
CREATE TABLE mail_outbox (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_address VARCHAR(254) NOT NULL,
  subject    VARCHAR(200) NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
