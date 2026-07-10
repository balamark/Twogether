// 真實故事 (Relationship Wisdom Archive): user-authored stories following a
// fixed guided template, publicly readable (optionalAuth), with cross-couple
// votes/comments, read counts, instant AI insights at publish, and
// post-moderation (LLM toxicity pre-check + reports + admin hide).

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const llmService = require('../services/llmService');
const { checkLimit } = require('../lib/entitlements');
const { logInfo, logWarn, logError } = require('../lib/logger');
const {
  countTodayAiUsage,
  resolveAiLimit,
  recordAiUsage,
} = require('../lib/aiUsage');

const router = express.Router();
const adminRouter = express.Router();

const VOTE_TYPES = ['helpful', 'resonate', 'repair_worked'];
const REPORT_REASONS = ['inappropriate', 'spam', 'privacy', 'other'];
const STORIES_PER_DAY = 3;

// Section metadata: DB column ↔ API key ↔ zh label (used in error messages).
const SECTIONS = [
  { key: 'context', column: 'section_context', label: '背景' },
  { key: 'happened', column: 'section_happened', label: '發生了什麼' },
  { key: 'impact', column: 'section_impact', label: '情緒衝擊' },
  { key: 'tried', column: 'section_tried', label: '我們試過什麼' },
  { key: 'repair', column: 'section_repair', label: '轉捩點與修復' },
  { key: 'now', column: 'section_now', label: '現在的我們' },
];

function sendValidationError(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, message: '驗證失敗', errors: errors.array() });
    return true;
  }
  return false;
}

function escapeLike(q) {
  return `%${q.replace(/[\\%_]/g, '\\$&')}%`;
}

// Anonymous-view throttle: plain per-IP sliding window so refresh-spam can't
// inflate view counts (logged-in views dedupe via story_views instead).
const anonViewLog = new Map(); // ip -> timestamps[]
const ANON_VIEW_WINDOW_MS = 10 * 60 * 1000;
const ANON_VIEW_MAX = 20;
function allowAnonView(ip) {
  const now = Date.now();
  const hits = (anonViewLog.get(ip) || []).filter((t) => now - t < ANON_VIEW_WINDOW_MS);
  if (hits.length >= ANON_VIEW_MAX) {
    anonViewLog.set(ip, hits);
    return false;
  }
  hits.push(now);
  anonViewLog.set(ip, hits);
  // Opportunistic cleanup so the map doesn't grow unbounded.
  if (anonViewLog.size > 5000) {
    for (const [k, v] of anonViewLog) {
      if (v.every((t) => now - t >= ANON_VIEW_WINDOW_MS)) anonViewLog.delete(k);
    }
  }
  return true;
}

const VOTE_COUNT_SELECT = `
  COALESCE(SUM(CASE WHEN v.vote_type = 'helpful' THEN 1 ELSE 0 END), 0)::int AS helpful_count,
  COALESCE(SUM(CASE WHEN v.vote_type = 'resonate' THEN 1 ELSE 0 END), 0)::int AS resonate_count,
  COALESCE(SUM(CASE WHEN v.vote_type = 'repair_worked' THEN 1 ELSE 0 END), 0)::int AS repair_count`;

function summaryFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    preview: (row.section_context || '').slice(0, 120),
    tags: row.tags || [],
    authorName: row.show_nickname ? (row.author_nickname || '匿名') : '匿名',
    votes: {
      helpful: row.helpful_count || 0,
      resonate: row.resonate_count || 0,
      repair_worked: row.repair_count || 0,
    },
    commentCount: row.comment_count || 0,
    viewCount: row.view_count || 0,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// List + search + 本週精選
// ---------------------------------------------------------------------------
router.get(
  '/',
  optionalAuth,
  [
    query('q').optional().isString().isLength({ max: 100 }),
    query('tag').optional().isString().isLength({ max: 16 }),
    query('sort').optional().isIn(['latest', 'helpful', 'most_read']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const { q, tag, sort = 'latest' } = req.query;
      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '12', 10);
      const offset = (page - 1) * limit;

      const conds = [`s.status = 'published'`];
      const params = [];
      if (q) {
        params.push(escapeLike(q.trim()));
        const p = `$${params.length}`;
        conds.push(
          `(s.title ILIKE ${p} OR s.section_context ILIKE ${p} OR s.section_happened ILIKE ${p}
            OR s.section_impact ILIKE ${p} OR s.section_tried ILIKE ${p}
            OR s.section_repair ILIKE ${p} OR s.section_now ILIKE ${p})`
        );
      }
      if (tag) {
        params.push(tag);
        conds.push(`$${params.length} = ANY(s.tags)`);
      }
      const where = conds.join(' AND ');

      const orderBy = {
        latest: 's.created_at DESC',
        helpful: '(helpful_count + resonate_count + repair_count) DESC, s.created_at DESC',
        most_read: 's.view_count DESC, s.created_at DESC',
      }[sort];

      const listResult = await db.query(
        `SELECT s.*, u.nickname AS author_nickname,
                ${VOTE_COUNT_SELECT},
                (SELECT COUNT(*) FROM story_comments c
                  WHERE c.story_id = s.id AND c.status = 'published')::int AS comment_count
           FROM relationship_stories s
           JOIN users u ON u.id = s.author_id
           LEFT JOIN story_votes v ON v.story_id = s.id
          WHERE ${where}
          GROUP BY s.id, u.nickname
          ORDER BY ${orderBy}
          LIMIT ${limit + 1} OFFSET ${offset}`,
        params
      );
      const hasMore = listResult.rows.length > limit;
      const stories = listResult.rows.slice(0, limit).map(summaryFromRow);

      // 本週精選: top 3 by votes over the trailing 7 days, computed at query
      // time (no cron). Only on the default first page so it stays a shelf,
      // not a duplicate of filtered results.
      let featured;
      if (page === 1 && !q && !tag) {
        const featuredResult = await db.query(
          `SELECT s.*, u.nickname AS author_nickname,
                  ${VOTE_COUNT_SELECT},
                  (SELECT COUNT(*) FROM story_comments c
                    WHERE c.story_id = s.id AND c.status = 'published')::int AS comment_count,
                  (SELECT COUNT(*) FROM story_votes wv
                    WHERE wv.story_id = s.id AND wv.created_at >= NOW() - INTERVAL '7 days')::int AS week_votes
             FROM relationship_stories s
             JOIN users u ON u.id = s.author_id
             LEFT JOIN story_votes v ON v.story_id = s.id
            WHERE s.status = 'published'
            GROUP BY s.id, u.nickname
           HAVING (SELECT COUNT(*) FROM story_votes wv
                    WHERE wv.story_id = s.id AND wv.created_at >= NOW() - INTERVAL '7 days') > 0
            ORDER BY week_votes DESC, s.created_at DESC
            LIMIT 3`
        );
        featured = featuredResult.rows.map(summaryFromRow);
      }

      res.json({ success: true, stories, hasMore, ...(featured ? { featured } : {}) });
    } catch (err) {
      logError('List stories failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: '無法載入故事，請稍後再試' });
    }
  }
);

// ---------------------------------------------------------------------------
// Author's own stories + impact stats
// ---------------------------------------------------------------------------
router.get('/mine', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT s.*, u.nickname AS author_nickname,
              ${VOTE_COUNT_SELECT},
              (SELECT COUNT(*) FROM story_comments c
                WHERE c.story_id = s.id AND c.status = 'published')::int AS comment_count
         FROM relationship_stories s
         JOIN users u ON u.id = s.author_id
         LEFT JOIN story_votes v ON v.story_id = s.id
        WHERE s.author_id = $1 AND s.status <> 'deleted'
        GROUP BY s.id, u.nickname
        ORDER BY s.created_at DESC`,
      [req.user.id]
    );
    const stories = result.rows.map((row) => ({
      ...summaryFromRow(row),
      status: row.status,
    }));
    const totals = stories.reduce(
      (acc, s) => ({
        reads: acc.reads + s.viewCount,
        votes: acc.votes + s.votes.helpful + s.votes.resonate + s.votes.repair_worked,
        comments: acc.comments + s.commentCount,
      }),
      { reads: 0, votes: 0, comments: 0 }
    );
    res.json({ success: true, stories, totals });
  } catch (err) {
    logError('List my stories failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '無法載入你的故事' });
  }
});

// ---------------------------------------------------------------------------
// Story detail (+ view counting)
// ---------------------------------------------------------------------------
router.get('/:id', optionalAuth, [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const result = await db.query(
      `SELECT s.*, u.nickname AS author_nickname,
              ${VOTE_COUNT_SELECT}
         FROM relationship_stories s
         JOIN users u ON u.id = s.author_id
         LEFT JOIN story_votes v ON v.story_id = s.id
        WHERE s.id = $1
        GROUP BY s.id, u.nickname`,
      [req.params.id]
    );
    const row = result.rows[0];
    const isAuthor = !!req.user && row && row.author_id === req.user.id;
    if (!row || row.status === 'deleted' || (row.status === 'hidden' && !isAuthor)) {
      return res.status(404).json({ success: false, message: '找不到這則故事，可能已被移除' });
    }

    // View counting: logged-in dedupes per user (once ever); anonymous counts
    // behind a per-IP throttle. The author reading their own story never counts.
    try {
      if (req.user && !isAuthor) {
        const ins = await db.query(
          `INSERT INTO story_views (story_id, viewer_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING RETURNING story_id`,
          [row.id, req.user.id]
        );
        if (ins.rows.length > 0) {
          await db.query(`UPDATE relationship_stories SET view_count = view_count + 1 WHERE id = $1`, [row.id]);
          row.view_count += 1;
        }
      } else if (!req.user && allowAnonView(req.ip || 'unknown')) {
        await db.query(`UPDATE relationship_stories SET view_count = view_count + 1 WHERE id = $1`, [row.id]);
        row.view_count += 1;
      }
    } catch (viewErr) {
      logWarn('Story view counting failed', { storyId: row.id, err: viewErr.message });
    }

    const commentsResult = await db.query(
      `SELECT c.id, c.body, c.created_at, c.author_id,
              u.nickname, u.public_share_show_nickname
         FROM story_comments c
         JOIN users u ON u.id = c.author_id
        WHERE c.story_id = $1 AND c.status = 'published'
        ORDER BY c.created_at ASC`,
      [row.id]
    );
    const comments = commentsResult.rows.map((c) => ({
      id: c.id,
      body: c.body,
      authorName: c.public_share_show_nickname !== false ? (c.nickname || '匿名') : '匿名',
      isMine: !!req.user && c.author_id === req.user.id,
      createdAt: c.created_at,
    }));

    let myVotes = [];
    if (req.user) {
      const mv = await db.query(
        `SELECT vote_type FROM story_votes WHERE story_id = $1 AND voter_id = $2`,
        [row.id, req.user.id]
      );
      myVotes = mv.rows.map((r) => r.vote_type);
    }

    res.json({
      success: true,
      story: {
        id: row.id,
        title: row.title,
        sections: {
          context: row.section_context,
          happened: row.section_happened,
          impact: row.section_impact,
          tried: row.section_tried,
          repair: row.section_repair,
          now: row.section_now,
        },
        tags: row.tags || [],
        authorName: row.show_nickname ? (row.author_nickname || '匿名') : '匿名',
        isMine: isAuthor,
        status: row.status,
        aiInsights: row.ai_insights || null,
        votes: {
          helpful: row.helpful_count || 0,
          resonate: row.resonate_count || 0,
          repair_worked: row.repair_count || 0,
        },
        myVotes,
        comments,
        viewCount: row.view_count,
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    logError('Get story failed', { err: err.message, stack: err.stack, storyId: req.params.id });
    res.status(500).json({ success: false, message: '無法載入故事內容' });
  }
});

// ---------------------------------------------------------------------------
// Publish a story
// ---------------------------------------------------------------------------
// Freeform → structured: the author pasted their whole story; AI splits it
// into the 6 template sections for them to review before publishing. No DB
// write; counts against the shared daily AI budget.
// ---------------------------------------------------------------------------
router.post(
  '/structure',
  authenticateToken,
  [body('rawText').isString().trim().isLength({ min: 30, max: 6000 })
    .withMessage('請先寫下你的故事（至少 30 字），AI 才能幫你分段')],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const userId = req.user.id;
      const { tier, limit } = await resolveAiLimit(userId);
      const usedToday = await countTodayAiUsage(userId);
      const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
      if (!limitCheck.ok) {
        logInfo('story.structure.limit', { userId, used: usedToday, limit, tier });
        return res.status(limitCheck.status).json(limitCheck.body);
      }

      const result = await llmService.structureStory({ rawText: req.body.rawText });
      await recordAiUsage(userId, 'story_structure', req.body.rawText.slice(0, 200), result._meta);
      logInfo('story.structure.done', { userId, provider: result._meta?.provider, costUsd: result._meta?.costUsd });
      res.json({ success: true, sections: result.sections });
    } catch (err) {
      logError('Story structure failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: 'AI 分段失敗，請稍後再試，或改用逐步填寫' });
    }
  }
);

// ---------------------------------------------------------------------------
router.post(
  '/',
  authenticateToken,
  [
    body('title').isString().trim().isLength({ min: 4, max: 120 })
      .withMessage('標題需在 4 到 120 字之間'),
    body('tags').optional().isArray({ max: 5 }),
    body('tags.*').optional().isString().isLength({ min: 1, max: 16 }),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const userId = req.user.id;
      const sections = req.body.sections || {};

      // Per-section validation with the section named in the message so the
      // author knows exactly what to fix (playbook messaging rule).
      for (const s of SECTIONS) {
        const val = (sections[s.key] || '').toString().trim();
        if (val.length < 10) {
          return res.status(400).json({
            success: false,
            message: `「${s.label}」至少需要 10 個字，寫下一點細節能幫助其他伴侶理解`,
            error_code: 'STORY_SECTION_REQUIRED',
            section: s.key,
          });
        }
        if (val.length > 2000) {
          return res.status(400).json({
            success: false,
            message: `「${s.label}」超過 2000 字上限，請精簡後再送出`,
            error_code: 'STORY_SECTION_TOO_LONG',
            section: s.key,
          });
        }
      }

      // Anti-spam: cap stories per author per day.
      const todayCount = await db.query(
        `SELECT COUNT(*)::int AS n FROM relationship_stories
          WHERE author_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'
            AND status <> 'deleted'`,
        [userId]
      );
      if (todayCount.rows[0].n >= STORIES_PER_DAY) {
        return res.status(429).json({
          success: false,
          message: `每天最多發表 ${STORIES_PER_DAY} 則故事，明天再回來分享吧`,
          error_code: 'STORY_DAILY_LIMIT',
        });
      }

      // Anonymity snapshot at publish time.
      const pref = await db.query(
        `SELECT public_share_show_nickname FROM users WHERE id = $1`,
        [userId]
      );
      const showNickname = pref.rows[0]?.public_share_show_nickname !== false;

      const tags = (req.body.tags || []).map((t) => t.toString().trim()).filter(Boolean).slice(0, 5);

      const insert = await db.query(
        `INSERT INTO relationship_stories (
           author_id, title,
           section_context, section_happened, section_impact,
           section_tried, section_repair, section_now,
           tags, show_nickname
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          userId,
          req.body.title.trim(),
          sections.context.trim(),
          sections.happened.trim(),
          sections.impact.trim(),
          sections.tried.trim(),
          sections.repair.trim(),
          sections.now.trim(),
          tags,
          showNickname,
        ]
      );
      const story = insert.rows[0];
      logInfo('story.published', { userId, storyId: story.id, tags, showNickname });

      // Instant AI insights + toxicity pre-check. A bonus, never a gate: if
      // the daily AI budget is exhausted or the LLM fails, the story still
      // publishes and the author sees a graceful skip notice.
      let aiInsights = null;
      let aiSkipped = false;
      try {
        const { tier, limit } = await resolveAiLimit(userId);
        const usedToday = await countTodayAiUsage(userId);
        const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
        if (!limitCheck.ok) {
          aiSkipped = true;
          logInfo('story.insight.limit', { userId, storyId: story.id, used: usedToday, limit, tier });
        } else {
          const result = await llmService.generateStoryInsights({
            title: story.title,
            sections: {
              context: story.section_context,
              happened: story.section_happened,
              impact: story.section_impact,
              tried: story.section_tried,
              repair: story.section_repair,
              now: story.section_now,
            },
          });
          const meta = result._meta;
          aiInsights = { insights: result.insights, generatedAt: new Date().toISOString() };
          await db.query(
            `UPDATE relationship_stories SET ai_insights = $1, toxicity_flags = $2 WHERE id = $3`,
            [JSON.stringify(aiInsights), result.toxicityFlags || [], story.id]
          );
          await recordAiUsage(userId, 'story_insight', story.title, meta);
          logInfo('story.insight.cost', {
            userId,
            storyId: story.id,
            provider: meta?.provider,
            costUsd: meta?.costUsd,
            durationMs: meta?.durationMs,
            toxicityFlags: result.toxicityFlags,
          });
        }
      } catch (aiErr) {
        aiSkipped = true;
        logWarn('Story insight generation failed (story still published)', {
          storyId: story.id,
          err: aiErr.message,
        });
      }

      res.status(201).json({
        success: true,
        story: { id: story.id, title: story.title, createdAt: story.created_at },
        aiInsights,
        aiSkipped,
      });
    } catch (err) {
      logError('Publish story failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: '發表失敗，請稍後再試' });
    }
  }
);

// ---------------------------------------------------------------------------
// Toggle a vote
// ---------------------------------------------------------------------------
router.post(
  '/:id/vote',
  authenticateToken,
  [param('id').isUUID(), body('voteType').isIn(VOTE_TYPES)],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const storyResult = await db.query(
        `SELECT id, author_id FROM relationship_stories WHERE id = $1 AND status = 'published'`,
        [req.params.id]
      );
      const story = storyResult.rows[0];
      if (!story) return res.status(404).json({ success: false, message: '找不到這則故事' });
      if (story.author_id === req.user.id) {
        return res.status(400).json({
          success: false,
          message: '不能為自己的故事投票，把機會留給被你幫助的人',
          error_code: 'STORY_SELF_VOTE',
        });
      }

      const { voteType } = req.body;
      const del = await db.query(
        `DELETE FROM story_votes WHERE story_id = $1 AND voter_id = $2 AND vote_type = $3 RETURNING id`,
        [story.id, req.user.id, voteType]
      );
      let voted;
      if (del.rows.length > 0) {
        voted = false;
      } else {
        await db.query(
          `INSERT INTO story_votes (story_id, voter_id, vote_type) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [story.id, req.user.id, voteType]
        );
        voted = true;
      }

      const counts = await db.query(
        `SELECT ${VOTE_COUNT_SELECT} FROM story_votes v WHERE v.story_id = $1`,
        [story.id]
      );
      const c = counts.rows[0] || {};
      logInfo('story.vote', { userId: req.user.id, storyId: story.id, voteType, voted });
      res.json({
        success: true,
        voted,
        counts: {
          helpful: c.helpful_count || 0,
          resonate: c.resonate_count || 0,
          repair_worked: c.repair_count || 0,
        },
      });
    } catch (err) {
      logError('Story vote failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: '投票失敗，請稍後再試' });
    }
  }
);

// ---------------------------------------------------------------------------
// Comment on a story (+ notify the author)
// ---------------------------------------------------------------------------
router.post(
  '/:id/comments',
  authenticateToken,
  [param('id').isUUID(), body('body').isString().trim().isLength({ min: 1, max: 1000 })
    .withMessage('留言需在 1 到 1000 字之間')],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const storyResult = await db.query(
        `SELECT id, author_id, title FROM relationship_stories WHERE id = $1 AND status = 'published'`,
        [req.params.id]
      );
      const story = storyResult.rows[0];
      if (!story) return res.status(404).json({ success: false, message: '找不到這則故事' });

      const ins = await db.query(
        `INSERT INTO story_comments (story_id, author_id, body) VALUES ($1, $2, $3)
         RETURNING id, body, created_at`,
        [story.id, req.user.id, req.body.body.trim()]
      );
      const comment = ins.rows[0];
      logInfo('story.comment', { userId: req.user.id, storyId: story.id, commentId: comment.id });

      if (story.author_id !== req.user.id) {
        try {
          await db.query(
            `INSERT INTO notifications (user_id, notification_type, title, content, related_user_id, priority)
             VALUES ($1, 'story_comment', $2, $3, $4, 2)`,
            [
              story.author_id,
              '你的故事收到新留言',
              `「${story.title.slice(0, 40)}」：${comment.body.slice(0, 120)}`,
              req.user.id,
            ]
          );
        } catch (notifyErr) {
          logWarn('Story comment notification failed', { storyId: story.id, err: notifyErr.message });
        }
      }

      const me = await db.query(
        `SELECT nickname, public_share_show_nickname FROM users WHERE id = $1`,
        [req.user.id]
      );
      const meRow = me.rows[0] || {};
      res.status(201).json({
        success: true,
        comment: {
          id: comment.id,
          body: comment.body,
          authorName: meRow.public_share_show_nickname !== false ? (meRow.nickname || '匿名') : '匿名',
          isMine: true,
          createdAt: comment.created_at,
        },
      });
    } catch (err) {
      logError('Story comment failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: '留言失敗，請稍後再試' });
    }
  }
);

// ---------------------------------------------------------------------------
// Delete own story (soft)
// ---------------------------------------------------------------------------
router.delete('/:id', authenticateToken, [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const result = await db.query(
      `UPDATE relationship_stories SET status = 'deleted'
        WHERE id = $1 AND author_id = $2 AND status <> 'deleted'
        RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '找不到這則故事或沒有權限' });
    }
    logInfo('story.deleted', { userId: req.user.id, storyId: req.params.id });
    res.json({ success: true, message: '故事已刪除' });
  } catch (err) {
    logError('Delete story failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '刪除失敗，請稍後再試' });
  }
});

// ---------------------------------------------------------------------------
// Reports (story / comment)
// ---------------------------------------------------------------------------
async function insertReport(res, { storyId = null, commentId = null, reporterId, reason, detail }) {
  try {
    await db.query(
      `INSERT INTO story_reports (story_id, comment_id, reporter_user_id, reason, detail)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [storyId, commentId, reporterId, reason, detail || null]
    );
    logInfo('story.reported', { storyId, commentId, reporterId, reason });
    res.json({ success: true, message: '已收到你的檢舉，我們會盡快處理' });
  } catch (err) {
    logError('Story report failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '檢舉送出失敗，請稍後再試' });
  }
}

router.post(
  '/:id/report',
  authenticateToken,
  [param('id').isUUID(), body('reason').isIn(REPORT_REASONS), body('detail').optional().isString().isLength({ max: 500 })],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    const exists = await db.query(`SELECT id FROM relationship_stories WHERE id = $1`, [req.params.id]);
    if (exists.rows.length === 0) return res.status(404).json({ success: false, message: '找不到這則故事' });
    await insertReport(res, {
      storyId: req.params.id,
      reporterId: req.user.id,
      reason: req.body.reason,
      detail: req.body.detail,
    });
  }
);

router.post(
  '/comments/:id/report',
  authenticateToken,
  [param('id').isUUID(), body('reason').isIn(REPORT_REASONS), body('detail').optional().isString().isLength({ max: 500 })],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    const exists = await db.query(`SELECT id FROM story_comments WHERE id = $1`, [req.params.id]);
    if (exists.rows.length === 0) return res.status(404).json({ success: false, message: '找不到這則留言' });
    await insertReport(res, {
      commentId: req.params.id,
      reporterId: req.user.id,
      reason: req.body.reason,
      detail: req.body.detail,
    });
  }
);

// ---------------------------------------------------------------------------
// Admin: reports queue, toxicity queue, moderation (mounted behind adminAuth)
// ---------------------------------------------------------------------------
adminRouter.get('/reports', async (req, res) => {
  try {
    const status = ['pending', 'reviewed', 'resolved'].includes(req.query.status)
      ? req.query.status
      : 'pending';
    const result = await db.query(
      `SELECT r.id, r.reason, r.detail, r.status, r.created_at,
              r.story_id, r.comment_id,
              ru.email AS reporter_email,
              s.title AS story_title, s.status AS story_status,
              c.body AS comment_body, c.status AS comment_status
         FROM story_reports r
         JOIN users ru ON ru.id = r.reporter_user_id
         LEFT JOIN relationship_stories s ON s.id = r.story_id
         LEFT JOIN story_comments c ON c.id = r.comment_id
        WHERE r.status = $1
        ORDER BY r.created_at DESC
        LIMIT 100`,
      [status]
    );
    res.json({ success: true, reports: result.rows });
  } catch (err) {
    logError('Admin story reports failed', { err: err.message });
    res.status(500).json({ success: false, message: 'failed' });
  }
});

adminRouter.get('/flagged', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, title, toxicity_flags, status, created_at
         FROM relationship_stories
        WHERE status = 'published' AND array_length(toxicity_flags, 1) > 0
        ORDER BY created_at DESC
        LIMIT 100`
    );
    res.json({ success: true, stories: result.rows });
  } catch (err) {
    logError('Admin flagged stories failed', { err: err.message });
    res.status(500).json({ success: false, message: 'failed' });
  }
});

adminRouter.post('/:id/moderate', async (req, res) => {
  try {
    const action = req.body?.action;
    if (!['hide', 'restore'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be hide|restore' });
    }
    const status = action === 'hide' ? 'hidden' : 'published';
    const result = await db.query(
      `UPDATE relationship_stories SET status = $1 WHERE id = $2 AND status <> 'deleted' RETURNING id`,
      [status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'not found' });
    await db.query(
      `UPDATE story_reports SET status = 'reviewed' WHERE story_id = $1 AND status = 'pending'`,
      [req.params.id]
    );
    logInfo('story.moderated', { storyId: req.params.id, action });
    res.json({ success: true });
  } catch (err) {
    logError('Admin moderate story failed', { err: err.message });
    res.status(500).json({ success: false, message: 'failed' });
  }
});

adminRouter.post('/comments/:id/moderate', async (req, res) => {
  try {
    const action = req.body?.action;
    if (!['hide', 'restore'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be hide|restore' });
    }
    const status = action === 'hide' ? 'hidden' : 'published';
    const result = await db.query(
      `UPDATE story_comments SET status = $1 WHERE id = $2 RETURNING id`,
      [status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'not found' });
    await db.query(
      `UPDATE story_reports SET status = 'reviewed' WHERE comment_id = $1 AND status = 'pending'`,
      [req.params.id]
    );
    logInfo('story.comment.moderated', { commentId: req.params.id, action });
    res.json({ success: true });
  } catch (err) {
    logError('Admin moderate comment failed', { err: err.message });
    res.status(500).json({ success: false, message: 'failed' });
  }
});

module.exports = { router, adminRouter };
