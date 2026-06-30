-- Enable Row Level Security on every table in the public schema.
--
-- Why: Supabase exposes a PostgREST API (https://<ref>.supabase.co/rest/v1/...)
-- for the public schema using the project's anon key. With RLS *disabled*, that
-- key — which ships in client bundles — can read/insert/update/DELETE any row
-- in any public table. This app does NOT use the PostgREST/anon path at all: the
-- backend talks to Postgres directly as role `postgres` (rolbypassrls = true),
-- and Supabase is only used for Storage (service-role). So enabling RLS with NO
-- policies fully locks the REST API to outsiders while the app keeps working
-- (the backend bypasses RLS). This closes the "RLS Disabled in Public" findings.
--
-- Idempotent: re-running is a no-op. Each ALTER is guarded so an unexpected
-- non-alterable relation (e.g. an extension table) can't abort the migration.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'          -- ordinary tables only (not views/matviews)
      AND c.relrowsecurity = false -- skip tables that already have RLS on
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.relname);
      RAISE NOTICE 'RLS enabled on public.%', r.relname;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not enable RLS on public.% : %', r.relname, SQLERRM;
    END;
  END LOOP;
END $$;
