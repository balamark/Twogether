// Recent activity feed for the couple — the latest content/interaction events
// from both partners, shown in the profile (最近動態).
//
// No dedicated activity table exists, so we UNION the couple-scoped content
// tables (each normalized to actor_id / type / description / date) and take the
// newest 20 — modeled on the smaller `recent_activity` UNION in routes/stats.js.
// Per-partner attribution comes from the standard couples user1/user2 lookup.

const express = require('express');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { logError, logInfo } = require('../lib/logger');

const router = express.Router();
router.use(authenticateToken);

const FEED_LIMIT = 20;

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    const coupleResult = await db.query(
      'SELECT id, user1_id, user2_id FROM couples WHERE user1_id = $1 OR user2_id = $1',
      [userId]
    );
    if (coupleResult.rows.length === 0) {
      return res.json({ success: true, activities: [] });
    }
    const couple = coupleResult.rows[0];
    const coupleId = couple.id;

    // Map actor id → nickname so the feed can label "你 / partner".
    const usersResult = await db.query(
      'SELECT id, nickname FROM users WHERE id = $1 OR id = $2',
      [couple.user1_id, couple.user2_id]
    );
    const nameById = {};
    for (const u of usersResult.rows) nameById[u.id] = u.nickname;

    // $1 = coupleId, $2 = userId (used by the custom_scripts branch to include
    // the requester's personal scripts that predate pairing).
    const activityResult = await db.query(`
      SELECT * FROM (
        SELECT 'love_moment'  AS type, lm.recorded_by AS actor_id,
               '記錄了一段親密時光' AS description, lm.moment_date AS date
          FROM love_moments lm WHERE lm.couple_id = $1

        UNION ALL
        SELECT 'custom_script', cs.created_by,
               '上傳了劇本「' || cs.title || '」', cs.created_at
          FROM custom_scripts cs
         WHERE cs.couple_id = $1 OR (cs.couple_id IS NULL AND cs.created_by = $2)

        UNION ALL
        SELECT 'wall_post', wp.author_id, '在留言板留言', wp.created_at
          FROM wall_posts wp WHERE wp.couple_id = $1

        UNION ALL
        SELECT 'event', e.created_by, '建立了事件「' || e.title || '」', e.created_at
          FROM events e WHERE e.couple_id = $1

        UNION ALL
        SELECT 'achievement', NULL, '解鎖成就：' || a.badge_type, a.earned_date
          FROM achievements a WHERE a.couple_id = $1

        UNION ALL
        SELECT 'coins', NULL,
               CASE WHEN ct.transaction_type = 'earn'
                    THEN '獲得 ' || ct.amount || ' 金幣'
                    ELSE '使用了 ' || ct.amount || ' 金幣' END,
               ct.transaction_date
          FROM coin_transactions ct WHERE ct.couple_id = $1

        UNION ALL
        SELECT 'checkin', rc.user_id, '完成了一次關係檢查', rc.created_at
          FROM relationship_checkins rc WHERE rc.couple_id = $1
      ) feed
      ORDER BY date DESC
      LIMIT ${FEED_LIMIT}
    `, [coupleId, userId]);

    const activities = activityResult.rows.map((row, i) => ({
      id: `${row.type}-${i}-${new Date(row.date).getTime()}`,
      type: row.type,
      actorNickname: row.actor_id ? (nameById[row.actor_id] || null) : null,
      isSelf: row.actor_id === userId,
      description: row.description,
      date: row.date,
    }));

    logInfo('activity.list', { userId, coupleId, count: activities.length });

    res.json({ success: true, activities });
  } catch (error) {
    logError('Get activity feed failed', { err: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '無法獲取最近動態' });
  }
});

module.exports = router;
