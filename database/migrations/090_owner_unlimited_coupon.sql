-- Repo-owner coupon: grants Premium PLUS an uncapped AI daily quota.
--
-- Existing coupons (see 043_coupons.sql) only ever grant 'premium', whose AI
-- cap is still 50/day (see lib/entitlements.js FEATURE_LIMITS.premium). This
-- adds an `unlimited_ai` flag that a coupon can carry through to the
-- couple_entitlements row it grants; lib/entitlements.hasUnlimitedAI() reads
-- it back to bypass the icebreaker_per_day cap entirely (see routes/billing.js
-- redeem-coupon and lib/aiUsage.js resolveAiLimit). custom_scripts_total and
-- photo_uploads_total are already UNLIMITED on premium, so this one flag is
-- the only gap between 'premium' and "truly unlimited".

ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS unlimited_ai BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE couple_entitlements
  ADD COLUMN IF NOT EXISTS unlimited_ai BOOLEAN NOT NULL DEFAULT FALSE;

-- One-off grant for the repo owner: 100 years of Premium + unlimited AI,
-- capped to a single redemption. Rotate/deactivate via
-- `UPDATE coupons SET active = FALSE WHERE code = '...'` if it ever leaks.
INSERT INTO coupons (code, days, max_redemptions, unlimited_ai, note)
VALUES ('TG-OWNER-KQVAFCWWDP', 36500, 1, TRUE, 'Repo owner grant: unlimited AI usage + all premium features')
ON CONFLICT (code) DO NOTHING;
