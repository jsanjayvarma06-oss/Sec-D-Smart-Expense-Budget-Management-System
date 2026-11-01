-- Security events (story #117): records security-relevant events such as
-- failed logins, account lockouts, rate-limiting triggers, and password reset requests.
--
-- Privacy & Security (SR10):
-- Events store NO passwords, tokens, or personal financial amounts.
-- Email and IP are captured to spot brute force, credential stuffing, and lockouts.

CREATE TABLE security_events (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type  VARCHAR(50) NOT NULL CHECK (event_type ~ '^[a-z][a-z_]*$'),
  email       VARCHAR(255),
  ip_address  VARCHAR(45),
  details     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX security_events_created_at_idx ON security_events (created_at DESC);
CREATE INDEX security_events_email_idx ON security_events (email);
CREATE INDEX security_events_event_type_idx ON security_events (event_type);
