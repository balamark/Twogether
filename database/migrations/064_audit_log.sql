-- Append-only audit trail for critical tables.
--
-- Motivation: a custom_scripts row (and its coin_transactions reward) were
-- committed yet later vanished, while Postgres only had log_statement='ddl'
-- (DML not logged) — so there was no record of who/what removed them. This adds
-- a row-level audit so any future INSERT/UPDATE/DELETE (and TRUNCATE) on the
-- high-value tables is recorded with the actor, source IP, app name, and any
-- PostgREST JWT claims. Crucially this reveals the *vector*: an app delete shows
-- actor='postgres', whereas a delete through the public REST API would show
-- actor='anon'/'authenticated' + a client IP. And it distinguishes a real DELETE
-- (audit rows exist) from a restore/instance swap (no audit rows, data just gone).

CREATE TABLE IF NOT EXISTS audit_log (
  id           BIGSERIAL PRIMARY KEY,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  table_name   TEXT NOT NULL,
  operation    TEXT NOT NULL,          -- INSERT | UPDATE | DELETE | TRUNCATE
  row_id       TEXT,                   -- the affected row's id (when present)
  actor        TEXT,                   -- current_user (postgres / anon / authenticated / …)
  client_addr  INET,                   -- inet_client_addr() of the connection
  app_name     TEXT,                   -- application_name, if set
  jwt_claims   JSONB,                  -- PostgREST request.jwt.claims, if present
  old_data     JSONB,
  new_data     JSONB
);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_time ON audit_log(table_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_row ON audit_log(row_id);

-- Lock the audit table to the bypass role only (no REST exposure).
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Keys never copied into the audit (avoid storing secrets/PII in old/new_data).
CREATE OR REPLACE FUNCTION audit_redact(j JSONB) RETURNS JSONB AS $$
  SELECT CASE WHEN j IS NULL THEN NULL
              ELSE j - 'password' - 'password_hash' - 'reset_token'
                     - 'reset_password_token' - 'verification_token'
                     - 'email_change_token'
         END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION audit_row_change() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_old JSONB := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END;
  v_new JSONB := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END;
  v_claims JSONB;
BEGIN
  BEGIN
    v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_claims := NULL;
  END;

  INSERT INTO audit_log
    (table_name, operation, row_id, actor, client_addr, app_name, jwt_claims, old_data, new_data)
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    COALESCE(v_new->>'id', v_old->>'id'),
    current_user,
    inet_client_addr(),
    NULLIF(current_setting('application_name', true), ''),
    v_claims,
    audit_redact(v_old),
    audit_redact(v_new)
  );
  RETURN NULL; -- AFTER trigger; return value ignored
END;
$$;

-- Statement-level TRUNCATE auditing (row triggers don't fire on TRUNCATE).
CREATE OR REPLACE FUNCTION audit_truncate() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO audit_log (table_name, operation, actor, client_addr, app_name)
  VALUES (TG_TABLE_NAME, 'TRUNCATE', current_user, inet_client_addr(),
          NULLIF(current_setting('application_name', true), ''));
  RETURN NULL;
END;
$$;

-- Attach to the high-value tables. Idempotent: drop-then-create.
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['custom_scripts','users'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS zz_audit_row ON public.%I;', t);
      EXECUTE format(
        'CREATE TRIGGER zz_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.%I
           FOR EACH ROW EXECUTE FUNCTION audit_row_change();', t);
      EXECUTE format('DROP TRIGGER IF EXISTS zz_audit_truncate ON public.%I;', t);
      EXECUTE format(
        'CREATE TRIGGER zz_audit_truncate AFTER TRUNCATE ON public.%I
           FOR EACH STATEMENT EXECUTE FUNCTION audit_truncate();', t);
    END IF;
  END LOOP;
END $$;
