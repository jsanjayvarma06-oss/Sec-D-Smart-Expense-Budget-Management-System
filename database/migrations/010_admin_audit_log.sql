-- Admin audit log (story #122): every admin action is recorded here and can
-- never be changed afterwards.
--
-- Rows hold account IDs only, not names or emails, and have no foreign keys:
-- deleting an account must not delete or rewrite its history, and the log
-- should not keep personal details of an account that no longer exists. The
-- screen looks the names up at read time.
--
-- The triggers block UPDATE, DELETE and TRUNCATE for every role, including the
-- table owner the API connects as. Only a database superuser dropping the
-- triggers or the table could remove entries.

CREATE TABLE admin_audit_log (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id       UUID NOT NULL,
  action         VARCHAR(50) NOT NULL CHECK (action ~ '^[a-z][a-z_]*$'),
  target_user_id UUID,
  details        JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_log_created_at_idx ON admin_audit_log (created_at DESC);
CREATE INDEX admin_audit_log_admin_id_idx ON admin_audit_log (admin_id, created_at DESC);

CREATE OR REPLACE FUNCTION admin_audit_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER admin_audit_log_no_update_or_delete
  BEFORE UPDATE OR DELETE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION admin_audit_log_append_only();

CREATE TRIGGER admin_audit_log_no_truncate
  BEFORE TRUNCATE ON admin_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION admin_audit_log_append_only();
