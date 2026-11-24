# 0006. One shared, fail-open daily AI budget

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: `lib/aiUsage.js`

## Decisions

- **Every paid LLM feature counts against one daily cap per user**
  (`BILLABLE_KINDS`, audited in `event_ai_usage`). The cap is 5 on the free
  tier and 50 on premium. Add a new paid feature to `BILLABLE_KINDS` rather than
  inventing its own budget.
- **一起收尾 (`closure_assist`, `closure_insight`) shares this budget on purpose.**
  A separate cap would need its own `LIMIT_ERROR_CODE`, message and frontend
  branch, with no product benefit. *Entering* 收尾 is never metered, so a
  mandatory step can't be blocked by an empty budget.
- **Counting fails open.** If the count query fails, usage counts as 0: we would
  rather serve the user than block them.
- **Diagnostics:** `countTodayAiUsageByKind` and the tier-resolution log show which
  feature drained the budget, and whether a "premium" user actually resolved to
  `free`. The usual reason is an unpaired user (no couple id) or an expired
  entitlement.
