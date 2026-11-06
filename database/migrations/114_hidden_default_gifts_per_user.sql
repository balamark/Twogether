-- 感情存款 gift shop splits into 我的禮品 / TA 的禮品: each partner keeps their
-- own list (custom_gifts already carries created_by), so removing or editing a
-- built-in gift now hides it only on the caller's own list instead of for the
-- whole couple.
--
-- Existing couple-wide hides are copied to the other partner so neither list
-- suddenly shows a gift the couple had removed. Idempotent: copies that
-- already exist are skipped, and duplicates are collapsed before the index.

DROP INDEX IF EXISTS uq_hidden_default_gifts_couple;
DROP INDEX IF EXISTS uq_hidden_default_gifts_personal;

INSERT INTO hidden_default_gifts (couple_id, user_id, gift_key, created_at)
SELECT p.couple_id, p.partner_id, p.gift_key, p.created_at
FROM (
  SELECT h.couple_id,
         CASE WHEN c.user1_id = h.user_id THEN c.user2_id ELSE c.user1_id END AS partner_id,
         h.gift_key,
         h.created_at
  FROM hidden_default_gifts h
  JOIN couples c ON c.id = h.couple_id
  WHERE c.user1_id IS NOT NULL AND c.user2_id IS NOT NULL
) p
WHERE NOT EXISTS (
  SELECT 1 FROM hidden_default_gifts x
  WHERE x.user_id = p.partner_id AND x.gift_key = p.gift_key
);

DELETE FROM hidden_default_gifts a
USING hidden_default_gifts b
WHERE a.user_id = b.user_id
  AND a.gift_key = b.gift_key
  AND (a.created_at, a.id::text) > (b.created_at, b.id::text);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hidden_default_gifts_user
  ON hidden_default_gifts (user_id, gift_key);
