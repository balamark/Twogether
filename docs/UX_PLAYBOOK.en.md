# Twogether UX Onboarding — Diagnosis, Improvement Backlog, and Long-term Conventions (English edition)

> **Audience: AI models (Claude Opus/Sonnet, Codex/GPT, etc.) and human maintainers.**
> This is the English mirror of `docs/UX_PLAYBOOK.md` (zh-TW). **The zh-TW file is
> canonical** because all product copy is Traditional Chinese; when the two files
> disagree, the zh-TW file wins. Update both in the same commit.
>
> The document has two parts:
> 1. **A one-time improvement backlog** (§2–§3): implemented items are struck
>    through with `✅ done (date)`.
> 2. **Permanent conventions** (§4–§5): every future session touching UI must
>    follow them. If a rule conflicts with the current code, the rule wins —
>    fix the code (or argue for changing the rule).
>
> File references use `path:line`; line numbers drift, search semantically.

---

## §0 The product in one sentence, and the activation moment (read this first)

Twogether is a couples' relationship app: log intimate moments, use AI to talk
conflicts through, a shared message wall, roleplay scripts, human/AI counseling.
Entirely Traditional Chinese; primary audience is couples in Taiwan.

**The single most important fact: this is a two-player product, and "successfully
paired" IS activation.** An unpaired user hits dead ends in almost every core
feature (conflict events, the wall, intimacy invites all need a partner). But
pairing requires convincing the other half to sign up — the biggest funnel break
in the whole product. Every UX decision should answer: *"does this change get
users paired faster, or let them feel value before pairing?"*

Second most important: **the differentiating feature is the conflict-repair
flywheel** (write down the hurt → AI rewrites it into three versions → partner
catches the emotion → AI counselor steps in → mark resolved). Not the calendar.

---

## §1 State of the world (July 2026 snapshot)

### Navigation (post 2026-07-08)
Six main tabs (`src/App.tsx` `navItems`, at the R3 cap):
記錄時光 (moments) / 好好說話 (talk-it-through, merged) / 角色扮演 (roleplay) /
我們的牆 (our wall) / 真實故事 (real stories, the public community surface) /
心理諮商 (counseling, directory-only now). 真實故事 renders the real view when
logged out (therapists precedent) and absorbed 公開問答. Logged-out nav shows a
7th visitors-only Premium chip — an accepted exception.
Plus the user menu (top right): coin shop, activity feed, feedback, help,
settings, Premium upgrade.

### Existing onboarding machinery
- After sign-up: AI companion picker modal (`AiCompanionPicker.tsx`) → pairing
  invite modal → getting-started checklist card.
- Logged-out home: a showroom (`LoggedOutPreview.tsx`) with read-only samples
  per tab — **good quality**.
- Help system: `HelpView` + per-page `InfoHint` (?), copy in
  `src/content/featureIntros.ts`.

### The gap this playbook was written to close (historical, mostly fixed)
**The app assumed users already knew what to do.** No in-app help, no
"what's next" guidance, empty states without CTAs, and unpaired users saw a
wall instead of a path. §3 records what was done about it.

---

## §2 Diagnosis: where the new-user journey used to break

Ordered by the journey: sign-up → first felt value → pairing → habit.

### D1 | Two modals after sign-up, then dropped on an empty screen
Sign-up → companion picker → pairing modal → an empty calendar with no
"here's what to do now". *User's inner voice: "OK… and then?"*
→ fixed by P0-1.

### D2 | Abstract, overlapping tab names
和諧相處 vs 衝突事件: both deal with conflict/emotions; users couldn't predict
the difference from the names, and the negative framing of 衝突事件 ("conflict
events") repelled people who weren't fighting. → fixed by P1-1 (merged into
好好說話, "talk it through").

### D3 | Unpaired = dead ends with no exit
`EventsView` showed only "pair first". The things an unpaired user COULD do
(private events, love-language quiz, browse scripts, public Q&A) were never
surfaced. Invite status (did they install? did the link expire?) had weak
visibility. → largely fixed by P0-3; invite-status badge still open (P1-4).

### D4 | Empty states were full stops, not guides
"No events yet." with no button, no value line. Empty states are where every
new user lands; each must be a mini-onboarding. → fixed by P0-2.

### D5 | No help entry anywhere in the app
No FAQ, no way to re-read what a feature does; the only explanatory content
(the showroom) disappeared after login. → fixed by P0-4.

### D6 | The AI quota was a surprise popup, not an expectation
Free accounts have a daily AI budget (`lib/entitlements.js`) but users learned
about it only at the moment it ran out. A paywall should be a slope you can
climb, not a wall you slam into. → fixed by P1-2.

### D7 | Nothing happens after the first success
First event, first record: just a success toast. Habit needs a
success → next-action chain. → fixed by P1-3.

---

## §3 Improvement backlog (P0 → P2, each with acceptance criteria)

### P0-1 "Getting started" checklist card ✅ done 2026-07-07
Collapsible card at the top of 記錄時光: three steps (pick AI companion /
invite partner / first record or event), auto-checked from real state,
dismissible, disappears permanently when complete.
Files: `src/components/GettingStartedCard.tsx`, wired in `src/App.tsx`.

### P0-2 Empty states become mini-onboarding ✅ done 2026-07-07
(events list, calendar records, intimacy invites; the script library ships with
default content and is never empty.)
Spec: every list view's empty state carries ① one line about the value **for
the relationship** (not a feature description) ② a primary CTA ③ a sample or
preview. Playwright case per view: "empty-state CTA is clickable and lands on
the right screen".

### P0-3 Unpaired gates become "solo mode" ✅ done 2026-07-07
(events gate rebuilt; "private events without a couple" needs a backend schema
change and the "invite pending" badge moved to P1-4 — both still open.)
Spec: gated views show ① what the feature does for the two of you ② an
"invite your partner" CTA ③ a list of things you can do solo right now
(love-language quiz, public Q&A, browse scripts).
Component: `src/components/SoloModeGate.tsx`.

### P0-4 Help entry: manual page + per-page (?) hints ✅ done 2026-07-07
(`src/content/featureIntros.ts` + `HelpView` + `InfoHint`; consolidating the
showroom copy into featureIntros is still TODO.)
Spec: user menu gains 使用說明 (help) — per-tab FAQs, 3–5 questions each;
a small (?) beside page titles opens a 2–3 sentence intro. Copy lives in
exactly one place.

### P1-1 Tab merge ✅ done 2026-07-07
和諧相處 + 衝突事件 → one main tab 好好說話 with sub-tabs 說開一件事 (events)
and 接住情緒・檢查 (harmony). View ids `events` / `conflict` remain valid
(deep links and reload persistence unaffected); the nav highlights
`communicate` for both. Main tabs went 6 → 5.

### P1-2 AI quota transparency ✅ done 2026-07-07
`GET /api/ai-usage/today` + `AiQuotaHint` (「今日剩 N 次」) on the compose
input, the event reply row, and the wall invite button. An exhausted quota is
a warning with options (refills tomorrow / upgrade Premium), never a greyed-out
dead button: buttons stay clickable and explain themselves.

### P1-3 First-success next-step nudges ✅ done 2026-07-07
One-time (localStorage-flagged) tips: first event sent → "while waiting, try
如何接住TA的情緒"; first record → pairing nudge (unpaired) or wall suggestion
(paired).

### P1-4 (open) Pairing-invite status visibility
A "invite pending" badge (header or dashboard) with resend; and allow private
events without a couple row (backend schema change). Carried over from P0-3.

### P2 (recorded, deliberately not doing)
- Interactive replay tour (decided against in §6 Q3 — high maintenance).
- iOS app onboarding parity.
- i18n.

---

## §4 Permanent conventions (binding for all future AI sessions)

### R1 Shipping checklist for every user-facing feature (extends CLAUDE.md)
On top of the existing changelog/promo/showroom/error-copy rules:
- [ ] **Empty state**: new lists/views need the three-part empty state (P0-2).
- [ ] **First-use hint**: if a feature isn't self-evident from its name, add a
      (?) hint or a one-time nudge.
- [ ] **Three-part gates**: any "can't use this" state (unpaired / free limit /
      unverified email) must include: why + what you CAN do + a primary CTA.
      A bare "please do X first" is forbidden.
- [ ] **Copy self-check**: against R2.

### R2 Copy standards (zh-TW)
- Address the user as 你; refer to the partner as 另一半 or 對方 (use the
  gender-neutral TA in feature names).
- Button labels = concrete verb-first actions (「邀請另一半」✓, 「配對功能」✗).
- Empty-state and gate copy leads with the value **for the relationship**, then
  the mechanics (「把委屈說成對方聽得進的話」✓; "AI three-version rewrite" ✗).
- Every error message includes a next step (CLAUDE.md rule; applies to empty
  states too).
- Emotional safety: conflict copy never judges who's right, never says 你應該
  ("you should").
- **Punctuation in AI-generated text: no em dashes（——、—、–）**; use colons,
  parentheses, or split the sentence. Implemented as `PUNCTUATION_RULE`
  appended to every system prompt in `services/llm/claudeProvider.js`.

### R3 Navigation rules
- Hard cap of 6 main tabs (currently 5). A seventh feature goes inside an
  existing tab as a sub-tab, or into the user menu.
- New tab names must pass the elevator test: someone who never used the app can
  guess the content from the name. Names that fail need a permanent (?) hint.

### R4 Blocking-modal rules
- At most one blocking modal at a time. Current priority order:
  **AI companion picker > pairing invite > everything else** (see
  `needsCompanionPick` suppressing the pairing prompt in `App.tsx`).
  Register any new modal's priority here.
- Every blocking modal needs an explicit 稍後再說 (later) escape hatch, and
  must not re-fire in the same session after escape.

### R5 Measurement rules
Guidance UI (checklists, empty-state CTAs, help pages) ships with
exposure/click logging through the existing `usePageTracking`/activity
mechanisms, event names `onboarding.<surface>.<action>`. Guidance without
measurement counts as unfinished.

### R6 How an AI agent verifies UX changes
- **Look before you touch**: screenshot the current state at 390px width with
  the browse daemon (`~/.claude/skills/gstack/browse/dist/browse`), screenshot
  again after, deliver the comparison.
- **e2e pattern**: mock-style specs follow `tests/events-reply.spec.ts`
  (seed localStorage authState + catch-all route). **Seeded users must include
  `selected_therapist`** or the companion modal misbehaves. Click targets use
  `data-testid` only. Navigation to the merged tab uses
  `getByTestId('nav-tab-communicate')` (the old `has-text("事件")` no longer
  matches anything).
- **Real flows**: sign-up/pairing changes run `tests/user-journey.spec.ts`.
- Known flake: `roleplay-invitation.spec.ts`'s pairing fixture fails
  intermittently; unrelated to UI changes.
- **Deploy trap**: a docs-only push skips deploy but still cancels an
  in-progress deploy run. After any push that follows another within ~11
  minutes, verify the earlier run concluded `success`, not `cancelled`;
  if cancelled, `gh run rerun <id>`.

---

## §5 Single-source-of-truth map (check before touching UX)

| Topic | Location |
|---|---|
| Feature intro copy & FAQs | `src/content/featureIntros.ts` (showroom `LoggedOutPreview.tsx` not yet consolidated) |
| Error/message standards | root `CLAUDE.md` "User-facing messages & logging" |
| AI quotas / plans | `lib/entitlements.js`; quota endpoint `routes/ai-usage.js` |
| AI companion personas | `lib/aiCompanions.js` (backend prompts) + `src/utils/aiCompanions.ts` (display) |
| AI punctuation & style | `PUNCTUATION_RULE` in `services/llm/claudeProvider.js` |
| Design tokens | `tailwind.config.js` (petal palette); never crop images (CLAUDE.md) |
| Button convention | solid fill = clickable, 40% opacity = disabled (since 2026-07-06) |

---

## §6 Decisions on record (settled 2026-07-07 by the product owner)

> Final. Future sessions do not re-litigate these; overturning one requires
> human sign-off and an update to this section.

### Q1 和諧相處 × 衝突事件 → **merged into one tab** ✅ (shipped as P1-1)
One positively-named tab 好好說話 with sub-tabs. Main tabs 6 → 5.

### Q2 Unpaired users → **solo experience first** ✅ (shipped as P0-3)
Gated pages become solo mode (preview + invite CTA + things to do now);
nudge pairing after each solo success.

### Q3 Help system → **FAQ page + per-page (?) hints** ✅ (shipped as P0-4)
No interactive tour. Copy shares a single source with the logged-out showroom.

### Q4 AI quota → **show remaining count before it runs out** ✅ (shipped as P1-2)
Show 「今日剩 N 次」next to AI buttons; at zero the buttons stay clickable and
explain (refills tomorrow / upgrade), never grey dead buttons.

---

### Decision added 2026-07-08: 真實故事 (Relationship Wisdom Archive)
- Shipped this round: guided-template stories + search + cross-couple comments
  + three vote types (有幫助/有共鳴/修復有效) + read counts & author impact
  stats + instant AI insights at publish + 3 community badges + 本週精選.
  Community polls and the public API are the next batch.
- New main tab 真實故事 absorbed 公開問答 (last free tab slot); therapists tab
  is directory-only.
- Moderation: post-moderation + reports + publish-time LLM toxicity flags
  (admin dashboard 真實故事 panel).
- Stories are USER-scoped (unpaired users can publish — Q2 solo stance);
  anonymity is snapshotted at publish from public_share_show_nickname.
- New notification type `story_comment`; anonymous view counting is per-IP
  throttled (routes/stories.js).

---

*Created 2026-07-07 as the English mirror of `docs/UX_PLAYBOOK.md`. Keep both
files in sync in the same commit; zh-TW is canonical.*
