# 0016. Curated content catalogs

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: `lib/aiCompanions.js`, `lib/intimacyNudgeTones.js`, `lib/therapyTopicLibrary.js`, `lib/therapyCards.js`, `lib/playbooks/*`

See also [0018](0018-marketplace-scripts.md) for marketplace scripts.

## AI 諮商師 companions

- `lib/aiCompanions.js` is the single backend source of truth: the display copy for
  `GET /api/ai-companions`, the persona prompt extensions, and id validation.
  Unknown or unset falls back to Luma.
- **Personas change STYLE only.** The therapeutic core (neutrality, validating both
  partners, no blame) is in the base counselor prompt and is never overridden.
- Prompt text is never sent to the frontend; it's an implementation detail.

## 溫柔提醒 nudge tones

- The reminder is voiced **by the platform** ("a caring friend, not a monitor"),
  never as the partner's words. The copy is about reconnecting, not sex, and
  stays low-pressure.
- A random draw from the pool keeps it fresh, and the recommended tone (鼓勵連結)
  is always included first.
- The catalog is admin-managed (`intimacy_nudge_tones`, migration 110), with a
  60s cache invalidated on write. The in-code list is the seed and the fallback,
  so the card is never empty. Admin-authored `text_en`/`label_en` override the
  dictionary translation.

## Therapy topics & cards

- The 話題庫 is static: no AI and no quota. It's shared by the couple card and the
  therapist's read-only view.
- **Therapy cards:** a real therapist picks the next best *exercise* rather than
  inventing advice. The facilitator LLM picks one card per turn.
  - Evaluable cards are graded accurate (1), partial (0.5: the couple is trying)
    or off (0), and rolled into 關係技巧分數 (0–100).
  - The score is `null`, shown as 尚未開始, until something has been graded, so
    the UI never shows a misleading 0%.
  - 慢下來 is reactive and excluded from the deliberate rotation. Cards already
    done this session are de-prioritized.

## Relationship Playbooks (關係解方手冊)

- Public, read-only content in one schema (PCS v1.0 §5), one file per language,
  rendered by one UI component. Adding a Playbook is a content change only.
  Only `published` entries are served. Personal reflections live in the DB
  (migration 115), never in the content.
- zh-TW and en list the same slugs with the same array lengths
  (`tests/playbooks-content.spec.ts`).
- Content principles (PCS §7): no blame; both perspectives fair; consent first;
  alternatives are invitations, not compensation; no diagnoses; safety before
  negotiation; "Partner A / B", never assume gender. The zh-TW copy uses no
  dashes (UX_PLAYBOOK R2).
- **Server-rendered shell** for `/playbooks` and `/playbooks/:slug`: search
  engines and the LINE, Facebook and Threads scrapers don't run JS. Each page gets
  its own title, description, canonical, hreflang, OG and JSON-LD, plus the full
  text inside `#root`. `createRoot` replaces it on boot.
