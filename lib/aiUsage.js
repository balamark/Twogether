// Shared AI-usage budget + audit helpers for paid LLM calls.
//
// Originally these lived privately inside routes/events.js (icebreaker +
// reply-rewrite). They were extracted here so other features that hit the same
// paid LLM — e.g. the wall "AI 諮商師" mediator — can share one daily budget and
// one audit log (the event_ai_usage table) instead of duplicating the logic.

const db = require('../database/db');
const { getCoupleIdForUser, getCoupleTier, getLimit } = require('./entitlements');
const { logWarn } = require('./logger');

// Every AI "kind" that draws from the shared daily budget. Keep this list in
// sync as new paid-LLM features are added so they all count against one cap.
const BILLABLE_KINDS = ['icebreaker', 'reply_rewrite', 'roleplay_messages', 'wall_counselor', 'reconciliation_opener'];

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

// Resolve the caller's tier + daily AI cap in one shot.
async function resolveAiLimit(userId) {
  const coupleId = await getCoupleIdForUser(userId);
  const tier = await getCoupleTier(coupleId);
  return { tier, limit: getLimit(tier, 'icebreaker_per_day') };
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
  resolveAiLimit,
  recordAiUsage,
};
