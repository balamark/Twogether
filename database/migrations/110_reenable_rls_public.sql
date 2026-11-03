-- Re-lock the Supabase REST API (PostgREST) on every table in the public schema.
--
-- Why: migration 063 enabled RLS on every public table that existed at the
-- time, but ~35 tables created afterwards (070…109: relationship_stories,
-- deep_dive_letters, dedicated_messages, therapy_summaries, line_link_codes, …)
-- never got `ENABLE ROW LEVEL SECURITY`, so anyone holding the project's anon
-- key could read/write/delete them via https://<ref>.supabase.co/rest/v1/.
-- Supabase flagged this as rls_disabled_in_public + sensitive_columns_exposed.
--
-- Same reasoning as 063: the app never uses PostgREST. The backend connects as
-- `postgres` (rolbypassrls = true) and Supabase is only used for Storage with
-- the service-role key, so RLS with NO policies blocks the REST API while the
-- app keeps working.
--
-- Defence in depth (so a future table that forgets RLS isn't exposed again):
--   1. Enable RLS on every public table still missing it.
--   2. Revoke all privileges on public tables/views/sequences/functions from
--      the API roles `anon` and `authenticated`. Views ignore RLS (they run as
--      their owner, `postgres`), so the revoke is what protects them; we also
--      flip them to security_invoker.
--   3. Default privileges: objects `postgres` creates later in public start
--      with no grants to `anon` / `authenticated`.
-- The CI check `scripts/check-rls.js` fails the build if any public table
-- ever has RLS disabled again.
--
-- Idempotent. The anon/authenticated steps are skipped when those roles don't
-- exist (plain Postgres in CI / local dev).
DO $$
DECLARE
  r RECORD;
  api_role TEXT;
BEGIN
  -- 1. RLS on every ordinary / partitioned table in public that lacks it.
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity = false
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.relname);
      RAISE NOTICE 'RLS enabled on public.%', r.relname;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not enable RLS on public.% : %', r.relname, SQLERRM;
    END;
  END LOOP;

  -- Views: make them respect the caller's privileges/RLS (PG15+).
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
  LOOP
    BEGIN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on);', r.relname);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not set security_invoker on view public.% : %', r.relname, SQLERRM;
    END;
  END LOOP;

  -- 2 + 3. Strip API-role access (Supabase only).
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      BEGIN
        EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I;', api_role);
        EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I;', api_role);
        EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I;', api_role);
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I;', api_role);
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I;', api_role);
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I;', api_role);
        RAISE NOTICE 'Revoked public-schema privileges from %', api_role;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not revoke privileges from % : %', api_role, SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;
