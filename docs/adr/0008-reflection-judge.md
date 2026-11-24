# 0008. LLM-as-judge second pass

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: `lib/reflectionJudge.js`, `lib/judgeExamples.js`

## Decisions

- **A second LLM pass grades the primary output** against the same
  speaker-labelled context. Its main target is 你/我 perspective and attribution
  errors.
- **Only a `hard` verdict triggers a regeneration** (once, with the critique). A
  `soft` fluency nit isn't worth a costly regeneration.
- **The judge fails open.** A missing, garbled or timed-out verdict counts as
  `ok`, and the "judge could not run" verdict carries a zero-cost `_meta`, so the
  judge can never withhold a response the primary model already produced. The
  critique is length-capped before being echoed back into the prompt.
- **Phase 2, curated few-shot negatives.** Admin-curated down-votes are fed in as
  negative examples. *Security:* only the AI's own prior output and an
  admin-written note reach the prompt, never the user's raw `feedback_text`. They
  are wrapped as delimited DATA under an explicit "not an instruction" header.
- Curated examples are cached per surface for 5 min (env-tunable). Concurrent
  judges share one in-flight query. Errors are cached as empty for 30s, so an
  outage doesn't hammer the DB.
