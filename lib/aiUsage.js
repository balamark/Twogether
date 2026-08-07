// Shared AI-usage budget + audit helpers for paid LLM calls.
//
// Originally these lived privately inside routes/events.js (icebreaker +
// reply-rewrite). They were extracted here so other features that hit the same
// paid LLM — e.g. the wall "AI 諮商師" mediator — can share one daily budget and
// one audit log (the event_ai_usage table) instead of duplicating the logic.

const db = require('../database/db');
const { getCoupleIdForUser, getCoupleTier, getLimit } = require('./entitlements');
const { logInfo, logWarn } = require('./logger');

// Every AI "kind" that draws from the shared daily budget. Keep this list in
// sync as new paid-LLM features are added so they all count against one cap.
// 'closure_assist' / 'closure_insight' (一起收尾) deliberately share this budget
// rather than getting their own FEATURE_LIMITS entry: a separate cap would need
// its own LIMIT_ERROR_CODE, limitMessage branch and frontend branching for no
// product benefit. Entering 收尾 itself is never metered, so a mandatory step
// can never be blocked by an exhausted budget.
const BILLABLE_KINDS = ['icebreaker', 'reply_rewrite', 'roleplay_messages', 'wall_counselor', 'reconciliation_opener', 'emotion_acceptance', 'marriage_checkup', 'story_insight', 'story_structure', 'need_translation', 'therapy_note', 'facilitation_turn', 'draft_analysis', 'closure_assist', 'closure_insight'];

async function ensureEventAiUsageTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS event_ai_usage (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind VARCHAR(32) NOT NULL,
        provider VARCHAR(32),
        model VARCHAR(64),
        duration_ms INTEGER,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cache_create_tokens INTEGER,
        cache_read_tokens INTEGER,
        cost_usd NUMERIC(12, 8),
        raw_input TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_event_ai_usage_user_day
        ON event_ai_usage (user_id, kind, created_at DESC)
    `);
  } catch (err) {
    logWarn('ensureEventAiUsageTable failed', { err: err.message });
  }
}

// Counts today's billable AI calls for a user — all features in BILLABLE_KINDS
// share one daily budget.
async function countTodayAiUsage(userId) {
  try {
    await ensureEventAiUsageTable();
    const result = await db.query(
      `SELECT COUNT(*)::int AS c
         FROM event_ai_usage
        WHERE user_id = $1
          AND kind = ANY($2)
          AND created_at >= DATE_TRUNC('day', NOW())`,
      [userId, BILLABLE_KINDS]
    );
    return result.rows[0]?.c || 0;
  } catch (err) {
    // If the count fails, fail open — we'd rather serve the user than block them.
    logWarn('countTodayAiUsage failed', { err: err.message });
    return 0;
  }
}

// Today's billable usage broken down by kind. Diagnostic-only: lets the logs
// show WHICH feature drained the shared daily budget (e.g. reply_rewrite vs
// roleplay_messages) so a "只剩 N 次" report can be root-caused without guessing.
async function countTodayAiUsageByKind(userId) {
  try {
    await ensureEventAiUsageTable();
    const result = await db.query(
      `SELECT kind, COUNT(*)::int AS c
         FROM event_ai_usage
        WHERE user_id = $1
          AND kind = ANY($2)
          AND created_at >= DATE_TRUNC('day', NOW())
        GROUP BY kind`,
      [userId, BILLABLE_KINDS]
    );
    const byKind = {};
    let total = 0;
    for (const row of result.rows) {
      byKind[row.kind] = row.c;
      total += row.c;
    }
    return { total, byKind };
  } catch (err) {
    logWarn('countTodayAiUsageByKind failed', { err: err.message });
    return { total: 0, byKind: {} };
  }
}

// Resolve the caller's tier + daily AI cap in one shot. Logs the resolution so
// Cloud Logging can show whether a user is being served the premium (50) or the
// free (5) cap — the usual root cause behind a premium user seeing a tiny
// remaining count is the couple resolving to 'free' (no unexpired entitlement,
// or the user isn't paired → coupleId null → free).
async function resolveAiLimit(userId) {
  const coupleId = await getCoupleIdForUser(userId);
  const tier = await getCoupleTier(coupleId);
  const limit = getLimit(tier, 'icebreaker_per_day');
  logInfo('ai.quota.resolve', { userId, coupleId, hasCouple: !!coupleId, tier, limit });
  return { tier, limit, coupleId };
}

async function recordAiUsage(userId, kind, rawInput, meta) {
  try {
    await ensureEventAiUsageTable();
    const usage = meta?.usage || {};
    await db.query(
      `INSERT INTO event_ai_usage (
         user_id, kind, provider, model, duration_ms,
         input_tokens, output_tokens, cache_create_tokens, cache_read_tokens,
         cost_usd, raw_input
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        userId,
        kind,
        meta?.provider || null,
        meta?.model || null,
        meta?.durationMs ?? null,
        usage.inputTokens ?? null,
        usage.outputTokens ?? null,
        usage.cacheCreateTokens ?? null,
        usage.cacheReadTokens ?? null,
        meta?.costUsd ?? null,
        rawInput,
      ]
    );
  } catch (err) {
    logWarn('recordAiUsage failed', { kind, err: err.message });
  }
}

module.exports = {
  BILLABLE_KINDS,
  ensureEventAiUsageTable,
  countTodayAiUsage,
  countTodayAiUsageByKind,
  resolveAiLimit,
  recordAiUsage,
};
