-- 訪客模式：5 次真的 AI 試用額度。
--
-- (Was numbered 110 on its feature branch; renumbered to 111 because main's
-- 110 is the RLS re-lock. Everything here is idempotent, so a database that
-- already ran the old 110 just re-applies it as a no-op.)
--
-- Visitors without an account browse the real app on a sample couple
-- (src/guest/). Their four core AI actions (icebreaker, draft analysis, reply
-- rewrite, emotion acceptance) hit the real LLM through the public
-- /api/guest-ai endpoint, capped at 5 per anonymous guest id with a per-IP
-- daily backstop. Unlike event_ai_usage, the guest's text is NEVER stored —
-- only who/when/cost, so the quota and spend can be enforced and audited.

CREATE TABLE IF NOT EXISTS guest_ai_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id VARCHAR(64) NOT NULL,
    ip_hash VARCHAR(64) NOT NULL,
    kind VARCHAR(32) NOT NULL,
    provider VARCHAR(32),
    model VARCHAR(64),
    duration_ms INTEGER,
    cost_usd NUMERIC(12, 8),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guest_ai_usage_guest
    ON guest_ai_usage (guest_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guest_ai_usage_ip_day
    ON guest_ai_usage (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guest_ai_usage_created
    ON guest_ai_usage (created_at DESC);

-- Supabase exposes public tables via its REST API with the anon key; RLS with
-- no policies blocks that (the backend connects as postgres and bypasses RLS).
ALTER TABLE public.guest_ai_usage ENABLE ROW LEVEL SECURITY;

-- A database that recorded this file's old number (110) skipped main's 110
-- RLS re-lock. Re-lock any public table still missing RLS (idempotent; a no-op
-- where 110_reenable_rls_public already ran).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity = false
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;
