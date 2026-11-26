# 0017. 感情存款 auto-deposits & the Q&A revenue pool

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: `lib/loveBankAuto.js`, `lib/qaPool.js`

## 感情存款 automatic deposits

- When someone does a positive interaction, **their partner** deposits into their
  account at the rate the *partner* chose (`love_bank_rates`, default 1, 0 = off).
  Money still only comes from the partner.
- A resolved conflict credits both partners, each one at the other's rate.
- **Idempotent key** `auto:<category>:<sourceId>:<ownerId>`: a retried request or
  a re-resolved conflict never credits twice.
- **Deleting the source withdraws the deposit**, so posting and then deleting
  can't farm 感情存款. Without a category, any category that source earned is
  withdrawn (a wall post's category depends on its tag).
- **Best-effort:** failures are logged and swallowed, and never fail the post,
  moment or closure that triggered them.

## Monthly Q&A revenue pool

- A TWD pool is split among therapists active in free chats and public Q&A that
  month. The strategy can be swapped without changing the data model:
  - `even`: every active therapist gets an equal share;
  - `volume`: by message count;
  - `engagement`: messages, plus 5 per published thread, plus 2 per helpful vote.
- All amounts are integers. The floor remainder goes to the largest-weight share
  (ties broken by therapist_id), so the shares always sum exactly to the pool.
