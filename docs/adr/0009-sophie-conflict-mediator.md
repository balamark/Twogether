# 0009. Sophie conflict mediator: heuristic detection & copy rules

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: `lib/conflictMediator.js`

## Decisions

- **Detection is a regex heuristic, not an LLM.** It has to be instant, free and
  predictable: model variance must never wrongly hold or release a message, and
  detection runs before any AI budget is spent. The paid LLM is used only
  afterwards, for the emotional translation.
- **Named signals** (`global_blame`, `contempt_insult`, …) are recorded on the
  intervention row as `detected_signals`, which shows *why* a message was held.
  This feeds threshold tuning and the couple's conflict history.
- **The hold threshold is env-tunable** (`CONFLICT_HOLD_FROM_LEVEL`, clamped to 1–3, default 2), so prod
  can tune it without a deploy.
- **Safety signals bypass the ladder.** Threats, violence and self-harm are never
  treated as an ordinary spat. They get supportive safety copy instead of
  mediation (§25).
- **Product principles behind the copy (PRD):**
  - *Never silence*: detection decides **when** a message is delivered, never
    **if**. A held message is saved and never edited.
  - *Pause, don't punish*: never say "calm down first". Anger is named as
    allowed.
  - *Agency, not surrender*: at the retaliation moment, Sophie doesn't ask for
    forgiveness or mutual understanding. She hands control back: "you can be
    furious and still not let the anger pick your next line". The "want to hurt"
    branch gets no moralizing.
  - The Level-1 nudge is a hint only and must never gate or delay delivery.
