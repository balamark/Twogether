-- 金幣商店：讓使用者移除／修改內建的預設禮品。
--
-- The default gift catalog (massage, dinner, …) lives in the frontend, so a
-- couple can't edit those rows directly. Removing a default records its key
-- here; editing a default creates a custom_gifts row and hides the original
-- the same way. Scope mirrors custom_gifts: shared by the couple when paired,
-- personal (couple_id NULL, keyed by user) before pairing.

CREATE TABLE IF NOT EXISTS hidden_default_gifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    couple_id UUID REFERENCES couples(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gift_key VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hidden_default_gifts_couple
  ON hidden_default_gifts (couple_id, gift_key) WHERE couple_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hidden_default_gifts_personal
  ON hidden_default_gifts (user_id, gift_key) WHERE couple_id IS NULL;
