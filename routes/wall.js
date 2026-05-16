const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { logDbError, errorResponseBody } = require('../lib/db-errors');

const router = express.Router();

// Mood tags whitelist — must match WALL_MOOD_TAGS in src/App.tsx
const WALL_MOOD_TAGS = [
  '想念你', '需要空間', '想被抱抱', '想溝通',
  '感謝', '撒嬌', '開心', '難過', '有想法',
];

router.use(authenticateToken);

async function findCoupleForUser(userId) {
  const result = await db.query(
    'SELECT id, user1_id, user2_id FROM couples WHERE user1_id = $1 OR user2_id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

function partnerOf(couple, userId) {
  if (!couple) return null;
  return couple.user1_id === userId ? couple.user2_id : couple.user1_id;
}

async function notifyPartner(partnerId, type, title, content, relatedUserId) {
  if (!partnerId) return;
  try {
    await db.query(
      `INSERT INTO notifications (
         user_id, notification_type, title, content, related_user_id, priority
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [partnerId, type, title, content.slice(0, 200), relatedUserId, 1]
    );
  } catch (err) {
    console.warn(`⚠️ Failed to create ${type} notification:`, err.message);
  }
}

function mapPost(row) {
  return {
    id: row.id,
    content: row.content,
    mood_tag: row.mood_tag,
    category: row.category,
    author_id: row.author_id,
    author_nickname: row.author_nickname,
    reply_count: Number(row.reply_count || 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapReply(row) {
  return {
    id: row.id,
    post_id: row.post_id,
    content: row.content,
    author_id: row.author_id,
    author_nickname: row.author_nickname,
    created_at: row.created_at,
  };
}

// List all posts for the user's couple, important first, then newest first.
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const couple = await findCoupleForUser(userId);

    if (!couple) {
      return res.json({ success: true, wall_posts: [] });
    }

    const result = await db.query(
      `SELECT
         p.id, p.content, p.mood_tag, p.category, p.author_id,
         p.created_at, p.updated_at,
         u.nickname AS author_nickname,
         (SELECT COUNT(*) FROM wall_post_replies r WHERE r.post_id = p.id) AS reply_count
       FROM wall_posts p
       JOIN users u ON u.id = p.author_id
       WHERE p.couple_id = $1
       ORDER BY (p.category = 'important') DESC, p.created_at DESC`,
      [couple.id]
    );

    res.json({
      success: true,
      wall_posts: result.rows.map(mapPost),
    });
  } catch (error) {
    logDbError('Get wall posts error:', error, { user_id: req.user?.id });
    res.status(500).json(errorResponseBody('無法獲取貼文', error));
  }
});

// Create a new post and notify the partner.
router.post(
  '/',
  [
    body('content')
      .isString()
      .isLength({ min: 1, max: 2000 })
      .withMessage('內容必須在 1-2000 字之間'),
    body('mood_tag')
      .optional({ nullable: true })
      .custom((val) => val === null || val === '' || WALL_MOOD_TAGS.includes(val))
      .withMessage('無效的心情標籤'),
    body('category')
      .optional()
      .isIn(['important', 'general'])
      .withMessage('無效的類別'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: '驗證失敗',
          errors: errors.array(),
        });
      }

      const userId = req.user.id;
      const couple = await findCoupleForUser(userId);
      if (!couple) {
        return res.status(400).json({
          success: false,
          message: '尚未配對，無法在牆上發文',
        });
      }

      const content = req.body.content;
      const moodTag = req.body.mood_tag || null;
      const category = req.body.category || 'general';

      const inserted = await db.query(
        `INSERT INTO wall_posts (couple_id, author_id, content, mood_tag, category)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, content, mood_tag, category, author_id, created_at, updated_at`,
        [couple.id, userId, content, moodTag, category]
      );

      const post = inserted.rows[0];

      // Hydrate with author nickname for client.
      const enriched = await db.query(
        `SELECT u.nickname AS author_nickname FROM users u WHERE u.id = $1`,
        [userId]
      );

      const partnerId = partnerOf(couple, userId);
      const title = category === 'important' ? '對方留下了重要的話 ⭐' : '對方在牆上留言';
      await notifyPartner(partnerId, 'wall_post', title, content, userId);

      res.json({
        success: true,
        message: '貼文發布成功',
        wall_post: mapPost({
          ...post,
          author_nickname: enriched.rows[0]?.author_nickname || null,
          reply_count: 0,
        }),
      });
    } catch (error) {
      logDbError('Create wall post error:', error, { user_id: req.user?.id });
      res.status(500).json(errorResponseBody('發布貼文失敗', error));
    }
  }
);

// Edit own post.
router.put(
  '/:id',
  [
    body('content')
      .optional()
      .isString()
      .isLength({ min: 1, max: 2000 })
      .withMessage('內容必須在 1-2000 字之間'),
    body('mood_tag')
      .optional({ nullable: true })
      .custom((val) => val === null || val === '' || WALL_MOOD_TAGS.includes(val))
      .withMessage('無效的心情標籤'),
    body('category')
      .optional()
      .isIn(['important', 'general'])
      .withMessage('無效的類別'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: '驗證失敗',
          errors: errors.array(),
        });
      }

      const postId = req.params.id;
      const userId = req.user.id;

      const existing = await db.query(
        `SELECT id FROM wall_posts WHERE id = $1 AND author_id = $2`,
        [postId, userId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: '找不到貼文或無權限修改',
        });
      }

      const fields = [];
      const values = [];
      let i = 1;

      if (req.body.content !== undefined) {
        fields.push(`content = $${i++}`);
        values.push(req.body.content);
      }
      if (req.body.mood_tag !== undefined) {
        fields.push(`mood_tag = $${i++}`);
        values.push(req.body.mood_tag || null);
      }
      if (req.body.category !== undefined) {
        fields.push(`category = $${i++}`);
        values.push(req.body.category);
      }

      if (fields.length === 0) {
        return res.status(400).json({
          success: false,
          message: '沒有提供有效的更新欄位',
        });
      }

      values.push(postId);

      const updated = await db.query(
        `UPDATE wall_posts SET ${fields.join(', ')}
         WHERE id = $${i}
         RETURNING id, content, mood_tag, category, author_id, created_at, updated_at`,
        values
      );

      const post = updated.rows[0];
      const enriched = await db.query(
        `SELECT u.nickname AS author_nickname,
                (SELECT COUNT(*) FROM wall_post_replies r WHERE r.post_id = $1) AS reply_count
         FROM users u WHERE u.id = $2`,
        [postId, userId]
      );

      res.json({
        success: true,
        message: '貼文更新成功',
        wall_post: mapPost({
          ...post,
          author_nickname: enriched.rows[0]?.author_nickname || null,
          reply_count: enriched.rows[0]?.reply_count || 0,
        }),
      });
    } catch (error) {
      logDbError('Update wall post error:', error, {
        user_id: req.user?.id,
        post_id: req.params.id,
      });
      res.status(500).json(errorResponseBody('更新貼文失敗', error));
    }
  }
);

// Delete own post (cascades replies).
router.delete('/:id', async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;

    const existing = await db.query(
      `SELECT id FROM wall_posts WHERE id = $1 AND author_id = $2`,
      [postId, userId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '找不到貼文或無權限刪除',
      });
    }

    await db.query(`DELETE FROM wall_posts WHERE id = $1`, [postId]);

    res.json({ success: true, message: '貼文已刪除' });
  } catch (error) {
    logDbError('Delete wall post error:', error, {
      user_id: req.user?.id,
      post_id: req.params.id,
    });
    res.status(500).json(errorResponseBody('刪除貼文失敗', error));
  }
});

// List replies for a post (must belong to user's couple).
router.get('/:id/replies', async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;
    const couple = await findCoupleForUser(userId);

    if (!couple) {
      return res.status(404).json({ success: false, message: '找不到貼文' });
    }

    const access = await db.query(
      `SELECT id FROM wall_posts WHERE id = $1 AND couple_id = $2`,
      [postId, couple.id]
    );

    if (access.rows.length === 0) {
      return res.status(404).json({ success: false, message: '找不到貼文' });
    }

    const result = await db.query(
      `SELECT r.id, r.post_id, r.content, r.author_id, r.created_at,
              u.nickname AS author_nickname
       FROM wall_post_replies r
       JOIN users u ON u.id = r.author_id
       WHERE r.post_id = $1
       ORDER BY r.created_at ASC`,
      [postId]
    );

    res.json({
      success: true,
      replies: result.rows.map(mapReply),
    });
  } catch (error) {
    logDbError('List wall replies error:', error, {
      user_id: req.user?.id,
      post_id: req.params.id,
    });
    res.status(500).json(errorResponseBody('無法獲取回覆', error));
  }
});

// Add a reply to a post; notify whoever isn't the replier.
router.post(
  '/:id/replies',
  [
    body('content')
      .isString()
      .isLength({ min: 1, max: 1000 })
      .withMessage('回覆內容必須在 1-1000 字之間'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: '驗證失敗',
          errors: errors.array(),
        });
      }

      const postId = req.params.id;
      const userId = req.user.id;
      const couple = await findCoupleForUser(userId);

      if (!couple) {
        return res.status(404).json({ success: false, message: '找不到貼文' });
      }

      const postResult = await db.query(
        `SELECT id, author_id FROM wall_posts WHERE id = $1 AND couple_id = $2`,
        [postId, couple.id]
      );

      if (postResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: '找不到貼文' });
      }

      const post = postResult.rows[0];
      const content = req.body.content;

      const inserted = await db.query(
        `INSERT INTO wall_post_replies (post_id, author_id, content)
         VALUES ($1, $2, $3)
         RETURNING id, post_id, content, author_id, created_at`,
        [postId, userId, content]
      );

      const reply = inserted.rows[0];
      const enriched = await db.query(
        `SELECT nickname AS author_nickname FROM users WHERE id = $1`,
        [userId]
      );

      // Notify the other person — if replier is the original author, notify
      // partner; otherwise notify the original author.
      const recipientId =
        post.author_id === userId ? partnerOf(couple, userId) : post.author_id;
      await notifyPartner(
        recipientId,
        'wall_reply',
        '對方回覆了你的貼文',
        content,
        userId
      );

      res.json({
        success: true,
        message: '回覆成功',
        reply: mapReply({
          ...reply,
          author_nickname: enriched.rows[0]?.author_nickname || null,
        }),
      });
    } catch (error) {
      logDbError('Create wall reply error:', error, {
        user_id: req.user?.id,
        post_id: req.params.id,
      });
      res.status(500).json(errorResponseBody('發送回覆失敗', error));
    }
  }
);

// Delete own reply.
router.delete('/replies/:replyId', async (req, res) => {
  try {
    const replyId = req.params.replyId;
    const userId = req.user.id;

    const existing = await db.query(
      `SELECT id FROM wall_post_replies WHERE id = $1 AND author_id = $2`,
      [replyId, userId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '找不到回覆或無權限刪除',
      });
    }

    await db.query(`DELETE FROM wall_post_replies WHERE id = $1`, [replyId]);

    res.json({ success: true, message: '回覆已刪除' });
  } catch (error) {
    logDbError('Delete wall reply error:', error, {
      user_id: req.user?.id,
      reply_id: req.params.replyId,
    });
    res.status(500).json(errorResponseBody('刪除回覆失敗', error));
  }
});

module.exports = router;
