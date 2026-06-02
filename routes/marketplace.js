const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { logDbError, errorResponseBody } = require('../lib/db-errors');

const router = express.Router();

router.use(authenticateToken);

function rejectIfInvalid(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      message: '驗證失敗',
      errors: errors.array(),
    });
    return true;
  }
  return false;
}

function mapScriptRow(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    scenario: row.scenario,
    script: row.content,
    tags: Array.isArray(row.tags) ? row.tags : JSON.parse(row.tags || '[]'),
    duration: row.duration || '15-30分鐘',
    thumbnailUrl: row.thumbnail_url,
    authorId: row.created_by,
    authorName: row.author_name,
    avgStars: Number(row.avg_stars) || 0,
    ratingCount: Number(row.rating_count) || 0,
    isPublic: row.is_public,
    isCustom: true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/marketplace/scripts — list public scripts
router.get(
  '/scripts',
  [
    query('sort').optional().isIn(['rating', 'recent', 'popular']),
    query('category').optional().isIn(['romantic', 'adventurous', 'school', 'bold']),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ],
  async (req, res) => {
    if (rejectIfInvalid(req, res)) return;
    try {
      const sort = req.query.sort || 'rating';
      const category = req.query.category;
      const limit = req.query.limit || 30;
      const offset = req.query.offset || 0;

      const params = [];
      let whereClause = '';
      if (category) {
        params.push(category);
        whereClause = `WHERE category = $${params.length}`;
      }

      let orderClause;
      if (sort === 'recent') {
        orderClause = 'ORDER BY created_at DESC';
      } else if (sort === 'popular') {
        orderClause = 'ORDER BY rating_count DESC, avg_stars DESC, created_at DESC';
      } else {
        // rating: prefer well-reviewed scripts but break ties by popularity then recency.
        orderClause = 'ORDER BY avg_stars DESC, rating_count DESC, created_at DESC';
      }

      params.push(limit, offset);
      const sql = `
        SELECT *
        FROM marketplace_scripts_view
        ${whereClause}
        ${orderClause}
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `;

      const result = await db.query(sql, params);
      res.json({
        success: true,
        scripts: result.rows.map(mapScriptRow),
      });
    } catch (error) {
      logDbError('Marketplace list error:', error, { user_id: req.user?.id });
      res.status(500).json(errorResponseBody('無法載入 Marketplace 劇本', error));
    }
  }
);

// GET /api/marketplace/scripts/:id — single script + viewer-relative flags
router.get(
  '/scripts/:id',
  [param('id').isUUID().withMessage('劇本 ID 必須是 UUID')],
  async (req, res) => {
    if (rejectIfInvalid(req, res)) return;
    try {
      const scriptId = req.params.id;
      const userId = req.user.id;

      const scriptResult = await db.query(
        'SELECT * FROM marketplace_scripts_view WHERE id = $1',
        [scriptId]
      );
      if (scriptResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: '找不到劇本' });
      }
      const script = mapScriptRow(scriptResult.rows[0]);

      // Has the viewer rated it?
      const myRating = await db.query(
        'SELECT stars, review_text FROM script_ratings WHERE script_id = $1 AND user_id = $2',
        [scriptId, userId]
      );

      // Has the viewer's couple (or unpaired user) favorited it?
      const coupleRow = await db.query(
        'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
        [userId]
      );
      const coupleId = coupleRow.rows.length ? coupleRow.rows[0].id : null;

      const favResult = await db.query(
        `SELECT 1 FROM script_favorites
          WHERE script_id = $1
            AND (($2::uuid IS NOT NULL AND couple_id = $2)
              OR ($2::uuid IS NULL AND couple_id IS NULL AND favorited_by = $3))`,
        [scriptId, coupleId, userId]
      );

      res.json({
        success: true,
        script: {
          ...script,
          myRating: myRating.rows.length
            ? { stars: myRating.rows[0].stars, reviewText: myRating.rows[0].review_text }
            : null,
          isFavorited: favResult.rows.length > 0,
          isAuthor: script.authorId === userId,
        },
      });
    } catch (error) {
      logDbError('Marketplace detail error:', error, { user_id: req.user?.id, script_id: req.params.id });
      res.status(500).json(errorResponseBody('無法載入劇本詳情', error));
    }
  }
);

// GET /api/marketplace/scripts/:id/ratings — paginated review list
router.get(
  '/scripts/:id/ratings',
  [
    param('id').isUUID(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ],
  async (req, res) => {
    if (rejectIfInvalid(req, res)) return;
    try {
      const limit = req.query.limit || 20;
      const offset = req.query.offset || 0;

      const result = await db.query(
        `SELECT r.id, r.stars, r.review_text, r.created_at, r.updated_at,
                r.user_id, COALESCE(u.nickname, '匿名') AS author_name
           FROM script_ratings r
           LEFT JOIN users u ON u.id = r.user_id
           WHERE r.script_id = $1
           ORDER BY r.updated_at DESC
           LIMIT $2 OFFSET $3`,
        [req.params.id, limit, offset]
      );

      res.json({
        success: true,
        ratings: result.rows.map((r) => ({
          id: r.id,
          stars: r.stars,
          reviewText: r.review_text,
          userId: r.user_id,
          authorName: r.author_name,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      });
    } catch (error) {
      logDbError('Marketplace ratings list error:', error, { user_id: req.user?.id });
      res.status(500).json(errorResponseBody('無法載入評論', error));
    }
  }
);

// POST /api/marketplace/scripts/:id/rate — upsert rating
router.post(
  '/scripts/:id/rate',
  [
    param('id').isUUID(),
    body('stars').isInt({ min: 1, max: 5 }).withMessage('星等必須是 1-5'),
    body('reviewText').optional({ nullable: true }).isLength({ max: 500 }).withMessage('評論不能超過 500 字'),
  ],
  async (req, res) => {
    if (rejectIfInvalid(req, res)) return;
    try {
      const scriptId = req.params.id;
      const userId = req.user.id;
      const { stars } = req.body;
      const reviewText = req.body.reviewText || null;

      // Block authors from rating their own scripts.
      const owner = await db.query(
        'SELECT created_by, is_public FROM custom_scripts WHERE id = $1',
        [scriptId]
      );
      if (owner.rows.length === 0) {
        return res.status(404).json({ success: false, message: '找不到劇本' });
      }
      if (owner.rows[0].created_by === userId) {
        return res.status(400).json({ success: false, message: '不能評自己的劇本' });
      }
      if (!owner.rows[0].is_public) {
        return res.status(400).json({ success: false, message: '此劇本未公開' });
      }

      await db.query(
        `INSERT INTO script_ratings (script_id, user_id, stars, review_text)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (script_id, user_id)
         DO UPDATE SET stars = EXCLUDED.stars,
                       review_text = EXCLUDED.review_text,
                       updated_at = NOW()`,
        [scriptId, userId, stars, reviewText]
      );

      res.json({ success: true });
    } catch (error) {
      logDbError('Marketplace rate error:', error, { user_id: req.user?.id, script_id: req.params.id });
      res.status(500).json(errorResponseBody('無法送出評分', error));
    }
  }
);

// DELETE /api/marketplace/scripts/:id/rate — remove viewer's rating
router.delete(
  '/scripts/:id/rate',
  [param('id').isUUID()],
  async (req, res) => {
    if (rejectIfInvalid(req, res)) return;
    try {
      await db.query(
        'DELETE FROM script_ratings WHERE script_id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      res.json({ success: true });
    } catch (error) {
      logDbError('Marketplace unrate error:', error, { user_id: req.user?.id });
      res.status(500).json(errorResponseBody('無法刪除評分', error));
    }
  }
);

// POST /api/marketplace/scripts/:id/report — file a report
router.post(
  '/scripts/:id/report',
  [
    param('id').isUUID(),
    body('reason').isIn(['inappropriate', 'spam', 'copyright', 'other']),
    body('detail').optional({ nullable: true }).isLength({ max: 1000 }),
  ],
  async (req, res) => {
    if (rejectIfInvalid(req, res)) return;
    try {
      const { reason } = req.body;
      const detail = req.body.detail || null;

      await db.query(
        `INSERT INTO script_reports (script_id, reporter_user_id, reason, detail)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (script_id, reporter_user_id) DO NOTHING`,
        [req.params.id, req.user.id, reason, detail]
      );

      res.json({ success: true });
    } catch (error) {
      logDbError('Marketplace report error:', error, { user_id: req.user?.id });
      res.status(500).json(errorResponseBody('無法送出檢舉', error));
    }
  }
);

// GET /api/marketplace/my-favorites — viewer's favorited custom scripts
// (built-in default scripts handled separately by /api/script-favorites)
router.get('/my-favorites', async (req, res) => {
  try {
    const userId = req.user.id;
    const coupleRow = await db.query(
      'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
      [userId]
    );
    const coupleId = coupleRow.rows.length ? coupleRow.rows[0].id : null;

    // Pull favorites whose script_id is a UUID that matches a custom script.
    // Join via marketplace view first; fall back to raw custom_scripts for
    // scripts the author has since unpublished (so user keeps access).
    const result = await db.query(
      `SELECT s.id, s.title, s.category, s.scenario, s.content, s.tags, s.duration,
              s.thumbnail_url, s.is_public, s.created_by, s.created_at, s.updated_at,
              COALESCE(u.nickname, '匿名作者') AS author_name,
              COALESCE(r.avg_stars, 0)::numeric(3,2) AS avg_stars,
              COALESCE(r.rating_count, 0)::int AS rating_count
         FROM script_favorites f
         JOIN custom_scripts s ON s.id::text = f.script_id
         LEFT JOIN users u ON u.id = s.created_by
         LEFT JOIN (
           SELECT script_id, AVG(stars)::numeric(3,2) AS avg_stars, COUNT(*) AS rating_count
             FROM script_ratings GROUP BY script_id
         ) r ON r.script_id = s.id
         WHERE ($1::uuid IS NOT NULL AND f.couple_id = $1)
            OR ($1::uuid IS NULL AND f.couple_id IS NULL AND f.favorited_by = $2)
         ORDER BY f.created_at DESC`,
      [coupleId, userId]
    );

    res.json({
      success: true,
      scripts: result.rows.map(mapScriptRow),
    });
  } catch (error) {
    logDbError('Marketplace my-favorites error:', error, { user_id: req.user?.id });
    res.status(500).json(errorResponseBody('無法載入收藏', error));
  }
});

module.exports = router;
