const db = require('../database/db');
const { getCoupleIdForUser, getCoupleTier, getLimit } = require('./entitlements');
const { logInfo, logWarn } = require('./logger');

const BILLABLE_KINDS = ['icebreaker', 'reply_rewrite', 'roleplay_messages', 'wall_counselor', 'reconciliation_opener', 'emotion_acceptance', 'marriage_checkup', 'story_insight', 'story_structure', 'need_translation', 'therapy_note', 'facilitation_turn', 'draft_analysis', 'closure_assist', 'closure_insight', 'deep_dive', 'therapy_topics', 'appreciation_questions'];

async function countTodayAiUsage(userId) {
  try {
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
    logWarn('countTodayAiUsage failed', { err: err.message });
    return 0;
  }
}

async function countTodayAiUsageByKind(userId) {
  try {
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

async function resolveAiLimit(userId) {
  const coupleId = await getCoupleIdForUser(userId);
  const tier = await getCoupleTier(coupleId);
  const limit = getLimit(tier, 'icebreaker_per_day');
  logInfo('ai.quota.resolve', { userId, coupleId, hasCouple: !!coupleId, tier, limit });
  return { tier, limit, coupleId };
}

async function recordAiUsage(userId, kind, rawInput, meta) {
  try {
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
  countTodayAiUsage,
  countTodayAiUsageByKind,
  resolveAiLimit,
  recordAiUsage,
};
