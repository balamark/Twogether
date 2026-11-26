# 0019. LLM provider: model, caching, token budgets & truncation

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: `services/llmService.js`, `services/llm/claudeProvider.js`, `services/llm/mockProvider.js`
- Related: [0006](0006-shared-ai-budget.md) budget, [0007](0007-ai-output-shaping-contracts.md) shaping, [0008](0008-reflection-judge.md) judge, [0020](0020-ai-feature-principles.md) what each prompt is for

## Provider selection

- `LLM_PROVIDER` picks `services/llm/<name>Provider.js`, and the default is
  `mock`. Every provider exports the same function set (see `llmService.js`).
- **The Claude provider never falls back to the mock on failure.** A provider
  error is thrown, and the route returns its error, because a silent mock
  answer would hide an outage. (Note: an *unknown* `LLM_PROVIDER` name still
  falls back to the mock in `llmService.js`, with only a warning.)
- **The mock is deterministic:** the same input always gives the same output,
  with no randomness or timestamps. It is persona-agnostic and accepts the
  gender/companion arguments only so its signatures match the real provider's,
  which keeps e2e assertions independent of the companion picked. Wherever the
  real provider has a rule, the mock follows it in miniature: the long-draft
  `detail` panel, event-anchored reconciliation openers, the one-sided counselor
  thread, and never-empty therapy topics.

## Model & output format

- The default model is Claude Haiku 4.5 (`ANTHROPIC_MODEL` overrides it): cheap and
  fast, and the prompts are short rewrites. Output is forced through a tool-use
  JSON schema, for determinism.
- **The judge model** (`ANTHROPIC_JUDGE_MODEL`) defaults to the primary model, and
  can be pinned to a stronger one when perspective accuracy matters more than
  cost. `REFLECTION_JUDGE_ENABLED` turns the whole judge off without a rollback.
  Each judge call is bounded at 20s (`REFLECTION_JUDGE_TIMEOUT_MS`), so a slow
  judge degrades to returning the primary output. Judge and regeneration usage
  is folded into the run's `_meta`, so the route still bills one unit.
- `PRICING` holds per-million-token USD prices for cost logging (cache write =
  1.25× input, cache read = 0.10× input). It's copied by hand from Anthropic's
  pricing page.

## Prompt-cache discipline

The system prompt carries `cache_control: ephemeral` (5-minute cache), so
consecutive calls from the same couple reuse it. **The cached prefix must stay
byte-identical across users**, so anything that varies goes *after* it:

- the English directive (when `X-Locale: en` is set via ADR 0004) is appended as
  the **last** system block. Fixed labels, enum values and JSON keys stay as
  specified, so parsers keep working;
- the companion persona, curated judge examples and the long-draft suffix are
  separate, later system blocks;
- gender hints, journey context and judge critiques go in the **user** turn.
  Only the fields the user actually provided are included.

The zh-TW punctuation rule (colons and parentheses, no em dashes;
UX_PLAYBOOK §R2) is appended to every user-facing generation.

## Token budgets & truncation

Generation cut off at `max_tokens` in the middle of a tool_use makes the whole JSON
unparseable. This has caused several "blank result" bugs, so:

- **Truncation is reported, not hidden.** Parsers return `truncated`, and a blank
  version is an error, never `''`. A truncated rewrite raises a specific,
  recoverable error that says whether it was truncation or a blank version.
- **Icebreaker rewrite:** `REWRITE_MAX_TOKENS = 8192`. The prompt forbids shortening,
  so a 2,000-char draft needs room for three full zh-TW versions; 4096
  produced three blank cards. Drafts of ≥400 chars (`LONG_DRAFT_CHARS`) also get
  the `detail` 完整經過 panel, with headroom proportional to the draft. Shorter
  drafts don't, because a rewrite would only restate the summary. A `detail`
  panel cut off by `max_tokens` is dropped: a truncated account of the
  couple's own argument is worse than none.
- **情緒翻譯 batching:**
  - Targets go in chunks of 6 within 4096 output tokens (~200 tokens each).
  - Each rewrite has a schema `maxLength: 120`; without it the model mirrors
    the source length and overruns.
  - Context-only messages are clipped to 300 chars; targets go in whole.
  - Up to 3 chunks run at once, to stay inside the 45s client timeout.
  - A truncated chunk is retried once at half size, and the attempt with more
    results wins. A regeneration never lowers the count.
  - Messages are relabelled `#1, #2…` with a ref→id map, because models echo
    small integers reliably but not UUIDs (UUIDs once silently dropped every
    translation).
- **Script role parsing** sends only the first 6,000 chars. Speaker names repeat
  every line, so that's enough to infer gender.
- **Therapy topics must never be empty.** If cleaning strips every topic, the
  provider throws a retryable error instead of caching (and charging for) an
  empty set under that input hash.

## Perspective & gender

- **Roleplay invitations:** the schema declares `senderRole` *first*, so the model
  commits to the sender's perspective before writing. The user turn opens with
  an imperative sender→role directive. Both fix a regression where a male
  sender got messages in the female protagonist's voice; a single
  「傳送者性別：男性」 line was too weak. The chosen role is logged, so
  "wrong voice" reports can be diagnosed. Output is re-keyed into the canonical
  five levels, so the UI always gets five ordered messages.
- **Gender hints** give a 他/她 pronoun only for male/female. Unknown or
  non-binary gets no hint, and the model avoids gendered pronouns.
- **One-sided threads:** when only one partner has spoken, the counselor gets an
  explicit instruction to empathize only with that person and never invent the
  silent partner's feelings. Callers that hold user ids decide this; a
  name-based count is the fallback.
- Prompt builders and the truncation parsers are exported only so contract
  tests can run them without a live API call (`src/tests/*`).
