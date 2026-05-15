-- Drop the coin_balances view.
--
-- Flagged by Supabase Security Advisor for SECURITY DEFINER semantics — when
-- exposed through PostgREST or queried by a low-privilege role, the view
-- bypasses RLS on the underlying coin_transactions / couples tables.
--
-- It is also unused: no backend code reads from it. Balances are computed
-- directly from users.coins and coin_transactions in routes/coins.js.
DROP VIEW IF EXISTS public.coin_balances;
