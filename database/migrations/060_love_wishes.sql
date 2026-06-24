-- 愛的行動 wishlist: a user proposes concrete things that make THEM feel loved
-- (coin-store style — on top of the per-love-language default suggestions). The
-- partner sees these so they know exactly how to make their other half feel
-- loved. Scoped by user_id; the partner is resolved via the couples table.

CREATE TABLE IF NOT EXISTS love_wishes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     VARCHAR(200) NOT NULL CHECK (char_length(content) BETWEEN 1 AND 200),
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_love_wishes_user ON love_wishes(user_id, created_at DESC);
