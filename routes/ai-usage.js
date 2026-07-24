const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { countTodayAiUsageByKind, resolveAiLimit } = require('../lib/aiUsage');
const { logInfo, logError } = require('../lib/logger');

const router = express.Router();

// Today's shared AI budget for the signed-in user (icebreaker, rewrite,
// acceptance, counselor all draw from the same pool). Powers the「今日剩 N 次」
// hint next to AI buttons (docs/UX_PLAYBOOK.md P1-2 / §6 Q4).
router.get('/today', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { tier, limit, coupleId } = await resolveAiLimit(userId);
    const { total: used, byKind } = await countTodayAiUsageByKind(userId);
    // Diagnostic: surfaces tier + per-feature breakdown so a "只剩 N 次" report can
    // be root-caused (被當 free vs 額度被哪個功能用掉) straight from Cloud Logging.
    logInfo('ai.quota.today', { userId, coupleId, tier, limit, used, byKind });
    res.json({
      success: true,
      usage: {
        tier,
        limit,
        used,
        remaining: Math.max(0, limit - used),
      },
    });
  } catch (err) {
    logError('AI usage lookup failed', { err: err.message });
    res.status(500).json({ success: false, message: '無法取得 AI 使用次數' });
  }
});

module.exports = router;
