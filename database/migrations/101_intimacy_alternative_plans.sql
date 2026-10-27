-- 替代方案協商 (Alternative Intimacy Options negotiation).
--
-- A new intimacy-request type, 'negotiation', invites the partner to talk about
-- what else both of you would enjoy when the originally hoped-for intimacy
-- can't happen right now. The talk produces co-authored plans stored here.
--
-- A plan is only on the couple's shared list once BOTH partners approved its
-- current wording. `approved_by` holds the user ids that approved the current
-- version; any edit resets it to just the editor, so the other partner must
-- re-approve what actually changed. Either partner can disable a plan at any
-- time (disabled_at). Status is derived:
--   disabled_at IS NOT NULL            → 'disabled' (已停用)
--   both partners in approved_by       → 'approved' (雙方已認可)
--   otherwise                          → 'pending'  (待確認)
-- Approval never obliges anyone to act on a plan — consent is re-checked every
-- time; the UI says so.

CREATE TABLE IF NOT EXISTS intimacy_alternative_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  -- The negotiation invitation this plan came out of (optional; plans can be
  -- added later straight from the shared list).
  request_id UUID REFERENCES intimacy_requests(id) ON DELETE SET NULL,
  title VARCHAR(100) NOT NULL,
  interaction TEXT NOT NULL,        -- 具體的互動方式
  boundaries TEXT,                  -- 各自的偏好與界線
  time_prep TEXT,                   -- 預期投入的時間與準備
  conditions TEXT,                  -- 哪些條件需要先確認
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by UUID[] NOT NULL DEFAULT '{}',
  -- Bumped on every content edit. Approve sends the revision it was shown, so
  -- an approval can never land on wording the partner changed in the meantime.
  revision INTEGER NOT NULL DEFAULT 1,
  disabled_at TIMESTAMP WITH TIME ZONE,
  disabled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intimacy_alt_plans_couple
  ON intimacy_alternative_plans(couple_id, updated_at DESC);
