// 訪客模式 AI 試用 — public (no account) endpoint behind the guest preview.
//
// A visitor browsing the sample couple (src/guest/) gets GUEST_AI_LIMIT real
// LLM calls for the four core AI actions. Everything else in guest mode is
// answered on-device. Privacy contract (shown in the UI): the text is sent to
// the AI to produce the answer and is NOT stored — guest_ai_usage keeps only
// the anonymous guest id, a salted IP hash, kind, and cost.
//
// Limits:
// - GUEST_AI_LIMIT per guest id (an anonymous random id the browser keeps).
// - GUEST_AI_IP_DAILY per IP per 24h, so clearing storage can't farm credits.
// - GUEST_AI_GLOBAL_DAILY across all guests per 24h (cost ceiling).
// Both answer 429 GUEST_AI_LIMIT with a sign-up next step.

const express = require('express');
const crypto = require('crypto');
const { body, param, validationResult } = require('express-validator');
const db = require('../database/db');
const llmService = require('../services/llmService');
const { logInfo, logWarn, logError } = require('../lib/logger');

const router = express.Router();

const GUEST_AI_LIMIT = 5;
const GUEST_AI_IP_DAILY = Number(process.env.GUEST_AI_IP_DAILY || 15);
// Spend ceiling across ALL guests per 24h (bots rotating IPs can't run up the LLM bill).
const GUEST_AI_GLOBAL_DAILY = Number(process.env.GUEST_AI_GLOBAL_DAILY || 2000);
const KINDS = ['icebreaker', 'draft_analysis', 'reply_rewrite', 'emotion_acceptance'];
const IP_SALT = process.env.GUEST_AI_IP_SALT || process.env.JWT_SECRET || 'twogether-guest';

const hashIp = (ip) => crypto.createHash('sha256').update(`${IP_SALT}:${ip || 'unknown'}`).digest('hex').slice(0, 32);
const validGuestId = (v) => typeof v === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(v);

async function usage(guestId, ipHash) {
  const r = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE guest_id = $1)::int AS guest_used,
       COUNT(*) FILTER (WHERE ip_hash = $2 AND created_at >= NOW() - INTERVAL '24 hours')::int AS ip_used
     FROM guest_ai_usage
     WHERE guest_id = $1 OR (ip_hash = $2 AND created_at >= NOW() - INTERVAL '24 hours')`,
    [guestId, ipHash]
  );
  const guestUsed = r.rows[0]?.guest_used || 0;
  const ipUsed = r.rows[0]?.ip_used || 0;
  // The per-IP backstop can shrink what's left, never grow it.
  const remaining = Math.max(0, Math.min(GUEST_AI_LIMIT - guestUsed, GUEST_AI_IP_DAILY - ipUsed));
  return { used: GUEST_AI_LIMIT - remaining, remaining, guestUsed, ipUsed };
}

const limitBody = () => ({
  success: false,
  error_code: 'GUEST_AI_LIMIT',
  message: `試玩的 ${GUEST_AI_LIMIT} 次 AI 已經用完了。免費註冊後每天都有 AI 額度，還能邀請另一半一起用。`,
  limit: GUEST_AI_LIMIT,
  remaining: 0,
});

// GET /api/guest-ai/quota?guest_id=… — powers the「AI 試用剩 N 次」hint.
router.get('/quota', async (req, res) => {
  const guestId = req.query.guest_id;
  if (!validGuestId(guestId)) return res.status(400).json({ success: false, message: '訪客編號格式不正確，請重新整理頁面再試', error_code: 'GUEST_ID_INVALID' });
  try {
    const u = await usage(guestId, hashIp(req.ip));
    res.json({ success: true, usage: { tier: 'guest', limit: GUEST_AI_LIMIT, used: u.used, remaining: u.remaining } });
  } catch (err) {
    logError('guest_ai.quota failed', { err: err.message });
    res.status(500).json({ success: false, message: '暫時讀不到試用額度，請稍後再試' });
  }
});

const strArr = (v, max) => (Array.isArray(v) ? v : []).slice(-max);

// POST /api/guest-ai/:kind  { guest_id, ...input }
router.post(
  '/:kind',
  [
    param('kind').isIn(KINDS),
    body('guest_id').custom(validGuestId).withMessage('訪客編號格式不正確，請重新整理頁面再試'),
    body('rawText').optional().isString().isLength({ min: 1, max: 4000 }).withMessage('文字需在 1–4000 字之間'),
    body('draft').optional().isString().isLength({ min: 1, max: 2000 }).withMessage('草稿需在 1–2000 字之間'),
    body('rawReply').optional().isString().isLength({ min: 1, max: 2000 }).withMessage('回覆需在 1–2000 字之間'),
    body('eventSummary').optional().isString().isLength({ max: 1000 }),
    body('recentMessages').optional().isArray({ max: 10 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg, error_code: 'VALIDATION_ERROR' });
    }
    const { kind } = req.params;
    const guestId = req.body.guest_id;
    const ipHash = hashIp(req.ip);
    const input = req.body;

    try {
      const before = await usage(guestId, ipHash);
      if (before.remaining <= 0) {
        logInfo('guest_ai.limit', { guestId, kind, guestUsed: before.guestUsed, ipUsed: before.ipUsed, blocked: true });
        return res.status(429).json(limitBody());
      }
      const global = await db.query(
        `SELECT COUNT(*)::int AS c FROM guest_ai_usage WHERE created_at >= NOW() - INTERVAL '24 hours'`
      );
      if ((global.rows[0]?.c || 0) >= GUEST_AI_GLOBAL_DAILY) {
        logWarn('guest_ai.global_cap', { kind, cap: GUEST_AI_GLOBAL_DAILY });
        return res.status(429).json(limitBody());
      }

      // The sample couple: the visitor is 小安 (female), the partner 阿哲 (male).
      const genders = { userGender: 'female', partnerGender: 'male' };
      const eventSummary = String(input.eventSummary || '').slice(0, 1000);
      const recentMessages = strArr(input.recentMessages, 10)
        .filter((m) => m && typeof m.content === 'string')
        .map((m) => ({ fromSelf: m.fromSelf === true, content: String(m.content).slice(0, 1000) }));

      let result;
      if (kind === 'icebreaker') {
        if (!input.rawText) return res.status(400).json({ success: false, message: '請先寫下想說的事', error_code: 'VALIDATION_ERROR' });
        result = await llmService.generateIcebreaker(input.rawText, genders);
      } else if (kind === 'draft_analysis') {
        if (!input.draft) return res.status(400).json({ success: false, message: '請先寫下想送出的話', error_code: 'VALIDATION_ERROR' });
        result = await llmService.analyzeDraft({ draft: input.draft, eventSummary, recentMessages, ...genders });
      } else if (kind === 'reply_rewrite') {
        if (!input.rawReply) return res.status(400).json({ success: false, message: '請先寫下想回覆的話', error_code: 'VALIDATION_ERROR' });
        result = await llmService.rewriteReply({ rawReply: input.rawReply, eventSummary, recentMessages, createdBySelf: input.createdBySelf === true, ...genders });
      } else {
        result = await llmService.generateEmotionAcceptance({ eventSummary, recentMessages, createdBySelf: input.createdBySelf === true, ...genders });
      }

      const meta = result?._meta || {};
      if (result) delete result._meta;
      await db.query(
        `INSERT INTO guest_ai_usage (guest_id, ip_hash, kind, provider, model, duration_ms, cost_usd)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [guestId, ipHash, kind, meta.provider || null, meta.model || null, meta.durationMs ?? null, meta.costUsd ?? null]
      );
      const remaining = Math.max(0, before.remaining - 1);
      // Lengths only — a guest's words are never logged or stored.
      logInfo('guest_ai.call', { guestId, kind, provider: meta.provider, model: meta.model, costUsd: meta.costUsd, durationMs: meta.durationMs, remaining });
      res.json({ success: true, result, usage: { tier: 'guest', limit: GUEST_AI_LIMIT, used: GUEST_AI_LIMIT - remaining, remaining } });
    } catch (err) {
      logError('guest_ai.call failed', { kind, err: err.message });
      res.status(500).json({ success: false, message: 'AI 暫時沒有回應，這次不扣試用次數。請稍後再試。', error_code: 'GUEST_AI_FAILED' });
    }
  }
);

module.exports = router;
module.exports._internals = { GUEST_AI_LIMIT, KINDS, hashIp };
