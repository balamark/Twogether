-- 感情存款：自動存入的金額設定。
--
-- Each person decides, per kind of positive interaction, how much they
-- automatically deposit into their partner's 感情存款 when the PARTNER does
-- it (今天你還喜歡他什麼, 我看見你, 他不知道的事, 留言, 記錄美好時光,
-- 化解衝突). No row = the default (1); 0 turns that category off. Money still
-- only ever comes from the partner: the setter is the depositor (created_by)
-- of every automatic row.

CREATE TABLE IF NOT EXISTS love_bank_rates (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(32) NOT NULL,
    amount INTEGER NOT NULL CHECK (amount >= 0 AND amount <= 10000),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, category)
);

-- Automatic deposits are a fourth kind of coin_transactions row. The
-- category key is kept in earned_from.
ALTER TABLE coin_transactions DROP CONSTRAINT IF EXISTS coin_transactions_kind_valid;
ALTER TABLE coin_transactions ADD CONSTRAINT coin_transactions_kind_valid
  CHECK (kind IN ('thanks', 'request', 'redeem', 'auto'));
