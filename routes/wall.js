const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { logDbError, errorResponseBody } = require('../lib/db-errors');
const emailService = require('../services/emailService');
const lineService = require('../services/lineService');
const { logInfo, logWarn, logError } = require('../lib/logger');
const llmService = require('../services/llmService');
const { checkLimit } = require('../lib/entitlements');
const { resolveCompanion } = require('../lib/aiCompanions');
const { resolveAiLimit, countTodayAiUsage, recordAiUsage } = require('../lib/aiUsage');
const { translationStatus } = require('../lib/translationStatus');
const {
  uploadMedia,
  checkMediaSizes,
  normalizeUrlList,
  createMediaMulter,
  wrapMulterErrors,
} = require('../lib/media-upload');

const router = express.Router();

// Mood tags whitelist — must match WALL_MOOD_TAGS in src/App.tsx
const WALL_MOOD_TAGS = [
  '想念你', '需要空間', '想被抱抱', '想溝通',
  '感謝', '撒嬌', '開心', '難過', '有想法',
];

// A wall post may carry up to this many photos/videos. Kept in sync with
// WALL_MAX_MEDIA in src/components/WallPostComposer.tsx.
const WALL_MAX_MEDIA = 4;

// Mood tags are free-form (custom tags allowed) but capped at the DB column
// width (mood_tag VARCHAR(32)). WALL_MOOD_TAGS above are just the preset chips.
const MOOD_TAG_MAX = 32;

// Parse a boolean form field. Multipart sends 'true'/'false' strings; JSON
// sends real booleans — accept both, default false.
function parseBool(val) {
  return val === true || val === 'true';
}

// express-validator predicate: null/empty clears the tag; otherwise any string
// up to the column width.
function isValidMoodTag(val) {
  return val === null || val === '' || (typeof val === 'string' && val.trim().length <= MOOD_TAG_MAX && val.trim().length > 0);
}

// Trim + null-out an incoming mood tag for storage.
function normalizeMoodTag(val) {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  return trimmed ? trimmed.slice(0, MOOD_TAG_MAX) : null;
}

// Multipart middleware for the `media[]` field (photos/videos). Errors become
// actionable JSON with a wall-specific error_code. A no-op for JSON requests.
const wallMediaUpload = wrapMulterErrors(
  createMediaMulter({ maxFiles: WALL_MAX_MEDIA }).array('media', WALL_MAX_MEDIA),
  { tooLargeCode: 'WALL_MEDIA_TOO_LARGE', invalidCode: 'WALL_MEDIA_INVALID' }
);

// Upload one wall media file (image or video) → public Supabase URL.
function uploadWallMedia(file) {
  return uploadMedia(file, { imagePrefix: 'wall-photos/', videoPrefix: 'wall-videos/' });
}

// Fetch ordered media URLs for a set of post ids → { postId: [url, ...] }.
// Degrades to no media (rather than failing the list) if the table isn't
// present yet, e.g. a pre-migration environment.
async function fetchMediaForPosts(postIds) {
  const map = {};
  if (!postIds.length) return map;
  try {
    const result = await db.query(
      `SELECT post_id, url FROM wall_post_media
        WHERE post_id = ANY($1::uuid[])
        ORDER BY post_id, sort_order, created_at`,
      [postIds]
    );
    for (const row of result.rows) {
      (map[row.post_id] = map[row.post_id] || []).push(row.url);
    }
  } catch (err) {
    logWarn('fetchMediaForPosts failed', { err: err.message });
  }
  return map;
}

// Replace a post's media rows with `urls` (already ordered).
async function replaceWallMedia(postId, urls) {
  await db.query('DELETE FROM wall_post_media WHERE post_id = $1', [postId]);
  for (let i = 0; i < urls.length; i++) {
    await db.query(
      'INSERT INTO wall_post_media (post_id, url, sort_order) VALUES ($1, $2, $3)',
      [postId, urls[i], i]
    );
  }
}

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

async function notifyPartner(partnerId, type, title, content, relatedUserId, opts = {}) {
  if (!partnerId) return;
  try {
    await db.query(
      `INSERT INTO notifications (
         user_id, notification_type, title, content, related_user_id, priority
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [partnerId, type, title, content.slice(0, 200), relatedUserId, 1]
    );
  } catch (err) {
    logWarn('Failed to create notification', { type, err: err.message });
  }

  // Mirror to LINE (no-ops unless the partner linked + opted in). Carry the
  // full post/reply text (excerpted) so the push alone tells the story.
  lineService.pushToUserIfLinked(
    db,
    partnerId,
    `💌 Twogether｜${title}\n「${lineService.excerpt(content)}」\n👉 https://twogether.fun`
  );

  // Fire-and-forget email to the partner. Honors per-user opt-out.
  try {
    const partner = await emailService.getUserEmailIfOptedIn(db, partnerId);
    if (!partner) return;
    let senderName = opts.senderName;
    if (!senderName && relatedUserId) {
      const r = await db.query(`SELECT nickname FROM users WHERE id = $1`, [relatedUserId]);
      senderName = r.rows[0]?.nickname || null;
    }
    await emailService.sendWallPostNotification({
      senderName,
      recipientEmail: partner.email,
      recipientUserId: partner.id,
      isImportant: !!opts.isImportant,
      isReply: type === 'wall_reply',
      content,
    });
  } catch (err) {
    logWarn('Failed to send notification email', { type, err: err.message });
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
    media: Array.isArray(row.media) ? row.media : [],
    is_private: row.is_private === true,
    public_status: row.public_status || 'private',
    public_title: row.public_title || null,
    translation_enabled: row.translation_enabled === true,
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
    is_ai: row.is_ai === true,
    is_therapist: row.is_therapist === true,
    ai_therapist: row.ai_therapist || null,
    created_at: row.created_at,
  };
}

// The inviting user's chosen AI companion persona (falls back to Luma).
async function getUserCompanion(userId) {
  try {
    const r = await db.query(`SELECT selected_therapist FROM users WHERE id = $1`, [userId]);
    return resolveCompanion(r.rows[0]?.selected_therapist);
  } catch (err) {
    logWarn('getUserCompanion failed; using default', { err: err.message });
    return resolveCompanion(null);
  }
}

// ---------------------------------------------------------------------------
// Reusable read/write helpers — shared by the couple-member endpoints below and
// by the dedicated-therapist endpoints in routes/therapists.js. `privateVisibleTo`
// controls whose private posts are visible: pass a member's userId to include
// their own private posts, or null (e.g. a therapist) to exclude ALL private
// items. Private content is never exposed to a third party.
// ---------------------------------------------------------------------------

// List a couple's wall posts, important first then newest first.
async function listWallPostsForCouple(coupleId, { privateVisibleTo = null } = {}) {
  const privateClause = privateVisibleTo
    ? '(p.is_private = false OR p.author_id = $2)'
    : 'p.is_private = false';
  const params = privateVisibleTo ? [coupleId, privateVisibleTo] : [coupleId];

  const result = await db.query(
    `SELECT
       p.id, p.content, p.mood_tag, p.category, p.author_id, p.is_private,
       p.public_status, p.public_title, p.translation_enabled,
       p.created_at, p.updated_at,
       u.nickname AS author_nickname,
       (SELECT COUNT(*) FROM wall_post_replies r WHERE r.post_id = p.id) AS reply_count
     FROM wall_posts p
     JOIN users u ON u.id = p.author_id
     WHERE p.couple_id = $1 AND ${privateClause}
     ORDER BY (p.category = 'important') DESC, p.created_at DESC`,
    params
  );

  const mediaByPost = await fetchMediaForPosts(result.rows.map((r) => r.id));
  return result.rows.map((row) =>
    mapPost({ ...row, media: mediaByPost[row.id] || [] })
  );
}

// Fetch one post scoped to a couple, applying the same privacy rule. Returns the
// raw row ({ id, translation_enabled, is_private, author_id }) or null when the
// post doesn't belong to the couple or is a private post the viewer can't see.
async function getWallPostForCouple(postId, coupleId, { privateVisibleTo = null } = {}) {
  const result = await db.query(
    `SELECT id, translation_enabled, is_private, author_id
       FROM wall_posts WHERE id = $1 AND couple_id = $2`,
    [postId, coupleId]
  );
  const post = result.rows[0];
  if (!post) return null;
  if (post.is_private === true && post.author_id !== privateVisibleTo) return null;
  return post;
}

// All replies for a post (caller must have already checked post access).
async function listRepliesForPost(postId) {
  const result = await db.query(
    `SELECT r.id, r.post_id, r.content, r.author_id, r.is_ai, r.is_therapist,
            r.ai_therapist, r.created_at, u.nickname AS author_nickname
     FROM wall_post_replies r
     JOIN users u ON u.id = r.author_id
     WHERE r.post_id = $1
     ORDER BY r.created_at ASC`,
    [postId]
  );
  return result.rows.map(mapReply);
}

// Insert a reply and return it hydrated with the author nickname. isTherapist
// flags a dedicated-therapist comment so the UI can render it distinctly.
async function insertWallReply(postId, authorId, content, { isTherapist = false } = {}) {
  const inserted = await db.query(
    `INSERT INTO wall_post_replies (post_id, author_id, content, is_therapist)
     VALUES ($1, $2, $3, $4)
     RETURNING id, post_id, content, author_id, is_ai, is_therapist, ai_therapist, created_at`,
    [postId, authorId, content, isTherapist]
  );
  const reply = inserted.rows[0];
  const enriched = await db.query(
    `SELECT nickname AS author_nickname FROM users WHERE id = $1`,
    [authorId]
  );
  return mapReply({ ...reply, author_nickname: enriched.rows[0]?.author_nickname || null });
}

// List all posts for the user's couple, important first, then newest first.
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const couple = await findCoupleForUser(userId);

    if (!couple) {
      return res.json({ success: true, wall_posts: [] });
    }

    // Private posts are visible only to their author — the partner neither sees
    // them here nor is notified about them.
    const wall_posts = await listWallPostsForCouple(couple.id, { privateVisibleTo: userId });

    res.json({ success: true, wall_posts });
  } catch (error) {
    logDbError('Get wall posts error:', error, { user_id: req.user?.id });
    res.status(500).json(errorResponseBody('無法獲取貼文', error));
  }
});

// Custom mood tags this couple has used before (excluding the preset chips), most
// recent first. Powers the "remembered custom tags" chips in the composer so a
// self-defined mood can be reused without retyping. No separate table — derived
// from the mood_tags already stored on the couple's posts.
router.get('/mood-tags', async (req, res) => {
  try {
    const userId = req.user.id;
    const couple = await findCoupleForUser(userId);
    if (!couple) return res.json({ success: true, tags: [] });

    const result = await db.query(
      `SELECT mood_tag, MAX(created_at) AS last_used
         FROM wall_posts
        WHERE couple_id = $1
          AND mood_tag IS NOT NULL AND mood_tag <> ''
          AND NOT (mood_tag = ANY($2::text[]))
        GROUP BY mood_tag
        ORDER BY last_used DESC
        LIMIT 12`,
      [couple.id, WALL_MOOD_TAGS]
    );
    res.json({ success: true, tags: result.rows.map((r) => r.mood_tag) });
  } catch (error) {
    logDbError('Get wall mood tags error:', error, { user_id: req.user?.id });
    res.status(500).json(errorResponseBody('無法獲取心情標籤', error));
  }
});

// Create a new post and notify the partner. Accepts multipart (with a `media[]`
// series of up to 4 photos/videos) or plain JSON; multer is a no-op for JSON.
// A post may be text-only, media-only, or both — but not entirely empty.
router.post(
  '/',
  wallMediaUpload,
  [
    body('content')
      .optional({ nullable: true })
      .isString()
      .isLength({ max: 6000 })
      .withMessage('內容不能超過 6000 字'),
    body('mood_tag')
      .optional({ nullable: true })
      .custom(isValidMoodTag)
      .withMessage('心情標籤不能超過 32 字'),
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

      const content = (req.body.content || '').trim();
      const moodTag = normalizeMoodTag(req.body.mood_tag);
      const category = req.body.category || 'general';
      const isPrivate = parseBool(req.body.is_private);
      const mediaFiles = req.files || [];

      // A post needs either text or at least one photo/video — a specific,
      // actionable reason instead of a generic validation failure.
      if (!content && mediaFiles.length === 0) {
        return res.status(400).json({
          success: false,
          message: '請輸入內容，或至少上傳一張照片或影片',
          error_code: 'WALL_POST_EMPTY',
        });
      }

      // Per-type size cap (image 5MB / video 20MB) with a specific message.
      const oversize = checkMediaSizes(mediaFiles, { tooLargeCode: 'WALL_MEDIA_TOO_LARGE' });
      if (oversize) {
        logWarn('wall.post.media_too_large', { userId, coupleId: couple.id, blocked: true });
        return res.status(oversize.status).json(oversize.body);
      }

      logInfo('wall.post.create.attempt', {
        userId,
        coupleId: couple.id,
        mediaCount: mediaFiles.length,
        contentLen: content.length,
      });

      // Upload media (in submitted order) before inserting the post so a failed
      // upload doesn't leave a half-formed post behind.
      const mediaUrls = [];
      for (const file of mediaFiles) {
        mediaUrls.push(await uploadWallMedia(file));
      }

      const inserted = await db.query(
        `INSERT INTO wall_posts (couple_id, author_id, content, mood_tag, category, is_private)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, content, mood_tag, category, author_id, is_private, created_at, updated_at`,
        [couple.id, userId, content, moodTag, category, isPrivate]
      );

      const post = inserted.rows[0];

      if (mediaUrls.length > 0) {
        await replaceWallMedia(post.id, mediaUrls);
      }

      // Hydrate with author nickname for client.
      const enriched = await db.query(
        `SELECT u.nickname AS author_nickname FROM users u WHERE u.id = $1`,
        [userId]
      );

      logInfo('wall.post.create.success', {
        userId,
        coupleId: couple.id,
        postId: post.id,
        mediaCount: mediaUrls.length,
        isPrivate,
      });

      // Private posts stay with their author — the partner isn't notified.
      if (!isPrivate) {
        // Media-only posts have no text to preview — describe the attachment so
        // the partner's notification still tells the story.
        const notifyBody = content || `傳送了 ${mediaUrls.length} 個照片／影片`;
        const partnerId = partnerOf(couple, userId);
        const title = category === 'important' ? '對方留下了重要的話 ⭐' : '對方在牆上留言';
        await notifyPartner(partnerId, 'wall_post', title, notifyBody, userId, {
          isImportant: category === 'important',
          senderName: enriched.rows[0]?.author_nickname || null,
        });
      }

      res.json({
        success: true,
        message: '貼文發布成功',
        wall_post: mapPost({
          ...post,
          author_nickname: enriched.rows[0]?.author_nickname || null,
          reply_count: 0,
          media: mediaUrls,
        }),
      });
    } catch (error) {
      logDbError('Create wall post error:', error, { user_id: req.user?.id });
      res.status(500).json(errorResponseBody('發布貼文失敗', error));
    }
  }
);

// Edit own post. Accepts multipart (with new `media[]` files and/or an
// `existingMedia` JSON list of kept URLs) or plain JSON. Media is only rebuilt
// when the request carries `existingMedia` or new files; otherwise it's left
// untouched, mirroring the custom-script updater.
router.put(
  '/:id',
  wallMediaUpload,
  [
    body('content')
      .optional()
      .isString()
      .isLength({ max: 6000 })
      .withMessage('內容不能超過 6000 字'),
    body('mood_tag')
      .optional({ nullable: true })
      .custom(isValidMoodTag)
      .withMessage('心情標籤不能超過 32 字'),
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
        `SELECT id, content FROM wall_posts WHERE id = $1 AND author_id = $2`,
        [postId, userId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: '找不到貼文或無權限修改',
        });
      }

      const newFiles = req.files || [];
      const mediaChanged = req.body.existingMedia !== undefined || newFiles.length > 0;

      // Per-type size cap on any newly uploaded files.
      const oversize = checkMediaSizes(newFiles, { tooLargeCode: 'WALL_MEDIA_TOO_LARGE' });
      if (oversize) {
        logWarn('wall.post.media_too_large', { userId, postId, blocked: true });
        return res.status(oversize.status).json(oversize.body);
      }

      // Work out the final media set (kept URLs first, then new uploads) so we
      // can enforce the per-post cap and the not-entirely-empty rule.
      const keptUrls = normalizeUrlList(req.body.existingMedia);
      if (mediaChanged && keptUrls.length + newFiles.length > WALL_MAX_MEDIA) {
        logWarn('wall.post.media_limit', {
          userId,
          postId,
          kept: keptUrls.length,
          added: newFiles.length,
          blocked: true,
        });
        return res.status(400).json({
          success: false,
          message: `每則貼文最多 ${WALL_MAX_MEDIA} 個，先移除一個才能再加。`,
          error_code: 'WALL_MEDIA_LIMIT',
        });
      }

      // Resolve what content and media the post will have AFTER this update, to
      // block an edit that would leave the post entirely empty.
      const finalContent =
        req.body.content !== undefined
          ? (req.body.content || '').trim()
          : (existing.rows[0].content || '').trim();
      const currentMediaCount = mediaChanged
        ? 0
        : ((await fetchMediaForPosts([postId]))[postId] || []).length;
      const finalMediaCount = mediaChanged
        ? keptUrls.length + newFiles.length
        : currentMediaCount;
      if (!finalContent && finalMediaCount === 0) {
        return res.status(400).json({
          success: false,
          message: '請輸入內容，或至少保留一張照片或影片',
          error_code: 'WALL_POST_EMPTY',
        });
      }

      const fields = [];
      const values = [];
      let i = 1;

      if (req.body.content !== undefined) {
        fields.push(`content = $${i++}`);
        values.push((req.body.content || '').trim());
      }
      if (req.body.mood_tag !== undefined) {
        fields.push(`mood_tag = $${i++}`);
        values.push(normalizeMoodTag(req.body.mood_tag));
      }
      if (req.body.category !== undefined) {
        fields.push(`category = $${i++}`);
        values.push(req.body.category);
      }
      if (req.body.is_private !== undefined) {
        fields.push(`is_private = $${i++}`);
        values.push(parseBool(req.body.is_private));
      }

      // Rebuild media when requested. Upload new files, then persist kept URLs
      // (in order) followed by the new uploads.
      let finalMedia = null;
      if (mediaChanged) {
        const newUrls = [];
        for (const file of newFiles) {
          newUrls.push(await uploadWallMedia(file));
        }
        finalMedia = [...keptUrls, ...newUrls];
        await replaceWallMedia(postId, finalMedia);
        logInfo('wall.post.update.media', { userId, postId, mediaCount: finalMedia.length });
      }

      // If only media changed (no scalar fields), still touch the row so
      // updated_at advances and we can return the fresh post.
      if (fields.length === 0) {
        fields.push(`updated_at = NOW()`);
      }

      values.push(postId);

      const updated = await db.query(
        `UPDATE wall_posts SET ${fields.join(', ')}
         WHERE id = $${i}
         RETURNING id, content, mood_tag, category, author_id, is_private, created_at, updated_at`,
        values
      );

      const post = updated.rows[0];
      const enriched = await db.query(
        `SELECT u.nickname AS author_nickname,
                (SELECT COUNT(*) FROM wall_post_replies r WHERE r.post_id = $1) AS reply_count
         FROM users u WHERE u.id = $2`,
        [postId, userId]
      );

      // Return the current media so the client can update the card in place.
      const media = finalMedia !== null
        ? finalMedia
        : ((await fetchMediaForPosts([postId]))[postId] || []);

      res.json({
        success: true,
        message: '貼文更新成功',
        wall_post: mapPost({
          ...post,
          author_nickname: enriched.rows[0]?.author_nickname || null,
          reply_count: enriched.rows[0]?.reply_count || 0,
          media,
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

    // A private post (and its replies) is visible only to its author.
    const post = await getWallPostForCouple(postId, couple.id, { privateVisibleTo: userId });
    if (!post) {
      return res.status(404).json({ success: false, message: '找不到貼文' });
    }

    const replies = await listRepliesForPost(postId);

    res.json({
      success: true,
      replies,
      translation_enabled: post.translation_enabled === true,
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
      .isLength({ min: 1, max: 3000 })
      .withMessage('回覆內容必須在 1-3000 字之間'),
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

      // A private post is author-only; the partner can neither see nor reply.
      const post = await getWallPostForCouple(postId, couple.id, { privateVisibleTo: userId });
      if (!post) {
        return res.status(404).json({ success: false, message: '找不到貼文' });
      }

      const content = req.body.content;
      const reply = await insertWallReply(postId, userId, content);

      // Notify the other person — if replier is the original author, notify
      // partner; otherwise notify the original author. Private posts never
      // notify the partner (they can't see them).
      const recipientId =
        post.author_id === userId ? partnerOf(couple, userId) : post.author_id;
      if (!post.is_private) {
        await notifyPartner(
          recipientId,
          'wall_reply',
          '對方回覆了你的貼文',
          content,
          userId,
          { senderName: reply.author_nickname || null }
        );
      }

      res.json({
        success: true,
        message: '回覆成功',
        reply,
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

// Preview an AI 諮商師 (counselor) comment for a thread. Generates but does NOT
// persist — the requester reviews it and then calls POST /:id/ai-comment to
// share it. Counts against the shared daily AI budget.
router.post('/:id/ai-comment/preview', async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;
    const couple = await findCoupleForUser(userId);

    if (!couple) {
      return res.status(404).json({ success: false, message: '找不到貼文' });
    }

    const postResult = await db.query(
      `SELECT p.id, p.content, p.mood_tag, p.author_id, p.is_private, u.nickname AS author_nickname
         FROM wall_posts p
         JOIN users u ON u.id = p.author_id
        WHERE p.id = $1 AND p.couple_id = $2`,
      [postId, couple.id]
    );

    if (postResult.rows.length === 0 || (postResult.rows[0].is_private === true && postResult.rows[0].author_id !== userId)) {
      return res.status(404).json({ success: false, message: '找不到貼文' });
    }
    const post = postResult.rows[0];

    // Shared daily AI budget (same pool as the icebreaker / reply-rewrite).
    const { tier, limit } = await resolveAiLimit(userId);
    const usedToday = await countTodayAiUsage(userId);
    const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
    if (!limitCheck.ok) {
      logInfo('wall.ai_comment.limit', { userId, postId, used: usedToday, limit, tier, blocked: true });
      return res.status(limitCheck.status).json(limitCheck.body);
    }

    const repliesResult = await db.query(
      `SELECT r.content, r.is_ai, u.nickname AS author_nickname
         FROM wall_post_replies r
         JOIN users u ON u.id = r.author_id
        WHERE r.post_id = $1
        ORDER BY r.created_at ASC`,
      [postId]
    );
    const replies = repliesResult.rows.map((r) => ({
      authorName: r.author_nickname,
      content: r.content,
      isAi: r.is_ai === true,
    }));

    const companion = await getUserCompanion(userId);
    logInfo('wall.ai_comment.preview', { userId, postId, replyCount: replies.length, companion: companion.id });

    const result = await llmService.generateWallCounselorComment({
      postContent: post.content,
      postAuthorName: post.author_nickname,
      moodTag: post.mood_tag,
      replies,
      companion,
    });
    const meta = result._meta;
    delete result._meta;

    logInfo('wall.ai_comment.cost', {
      userId,
      postId,
      provider: meta?.provider,
      model: meta?.model,
      costUsd: meta?.costUsd,
      durationMs: meta?.durationMs,
    });

    await recordAiUsage(userId, 'wall_counselor', post.content, meta);

    res.json({ success: true, comment: result.comment });
  } catch (error) {
    logError('Wall AI comment preview failed', {
      err: error.message,
      stack: error.stack,
      user_id: req.user?.id,
      post_id: req.params.id,
    });
    res.status(500).json({ success: false, message: 'AI 諮商師暫時無法回應，請稍後再試' });
  }
});

// Post a previewed AI 諮商師 comment into the thread, visible to both partners.
router.post(
  '/:id/ai-comment',
  [
    body('content')
      .isString()
      .isLength({ min: 1, max: 3000 })
      .withMessage('AI 留言內容必須在 1-3000 字之間'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: '驗證失敗', errors: errors.array() });
      }

      const postId = req.params.id;
      const userId = req.user.id;
      const couple = await findCoupleForUser(userId);

      if (!couple) {
        return res.status(404).json({ success: false, message: '找不到貼文' });
      }

      const postResult = await db.query(
        `SELECT id, author_id, is_private FROM wall_posts WHERE id = $1 AND couple_id = $2`,
        [postId, couple.id]
      );
      if (postResult.rows.length === 0 || (postResult.rows[0].is_private === true && postResult.rows[0].author_id !== userId)) {
        return res.status(404).json({ success: false, message: '找不到貼文' });
      }
      const post = postResult.rows[0];
      const content = req.body.content;

      // author_id = the inviting partner so the existing JOIN users / own-reply
      // delete rules keep working; is_ai flags it as a counselor comment.
      const companion = await getUserCompanion(userId);
      const inserted = await db.query(
        `INSERT INTO wall_post_replies (post_id, author_id, content, is_ai, ai_therapist)
         VALUES ($1, $2, $3, TRUE, $4)
         RETURNING id, post_id, content, author_id, is_ai, ai_therapist, created_at`,
        [postId, userId, content, companion.id]
      );
      const reply = inserted.rows[0];
      const enriched = await db.query(
        `SELECT nickname AS author_nickname FROM users WHERE id = $1`,
        [userId]
      );

      logInfo('wall.ai_comment.posted', { userId, postId, replyId: reply.id, companion: companion.id });

      // Private posts never notify the partner (they can't see the thread).
      if (!post.is_private) {
        const recipientId =
          post.author_id === userId ? partnerOf(couple, userId) : post.author_id;
        await notifyPartner(
          recipientId,
          'wall_ai_comment',
          `AI 諮商師 ${companion.name} 在你們的牆上留言`,
          content,
          userId,
          { senderName: `AI 諮商師 ${companion.name}` }
        );
      }

      res.json({
        success: true,
        message: 'AI 留言已貼到對話串',
        reply: mapReply({
          ...reply,
          author_nickname: enriched.rows[0]?.author_nickname || null,
        }),
      });
    } catch (error) {
      logDbError('Post wall AI comment error:', error, {
        user_id: req.user?.id,
        post_id: req.params.id,
      });
      res.status(500).json(errorResponseBody('貼上 AI 留言失敗', error));
    }
  }
);

// ---------------------------------------------------------------------------
// 情緒翻譯 (emotion / need translation) — shared per-thread lens
// ---------------------------------------------------------------------------

// Toggle the shared translation lens for a wall thread. Either partner can flip
// it; state lives on the post so both load the same on/off view.
router.patch(
  '/:id/translation',
  [body('enabled').isBoolean()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: '驗證失敗', errors: errors.array() });
      }
      const postId = req.params.id;
      const userId = req.user.id;
      const couple = await findCoupleForUser(userId);
      if (!couple) return res.status(404).json({ success: false, message: '找不到貼文' });

      const post = await db.query(
        `SELECT id FROM wall_posts WHERE id = $1 AND couple_id = $2`,
        [postId, couple.id]
      );
      if (post.rows.length === 0) return res.status(404).json({ success: false, message: '找不到貼文' });

      const enabled = req.body.enabled === true;
      await db.query(`UPDATE wall_posts SET translation_enabled = $2 WHERE id = $1`, [postId, enabled]);
      logInfo('wall.translation.toggle', { userId, postId, enabled });
      res.json({ success: true, translation_enabled: enabled });
    } catch (error) {
      logError('Toggle wall translation failed', { err: error.message, stack: error.stack, post_id: req.params.id });
      res.status(500).json({ success: false, message: '無法更新情緒翻譯設定，請稍後再試' });
    }
  }
);

// Return the emotion/need translation for every human reply in the thread.
// Cached per reply (replies are immutable): only still-untranslated ones cost
// one batched LLM call + one shared-budget unit; a fully cached thread is free.
router.get('/:id/translations', async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;
    const couple = await findCoupleForUser(userId);
    if (!couple) return res.status(404).json({ success: false, message: '找不到貼文' });

    const postResult = await db.query(
      `SELECT id, content FROM wall_posts WHERE id = $1 AND couple_id = $2`,
      [postId, couple.id]
    );
    if (postResult.rows.length === 0) return res.status(404).json({ success: false, message: '找不到貼文' });

    const repliesResult = await db.query(
      `SELECT r.id, r.content, r.is_ai, u.nickname AS author_nickname
         FROM wall_post_replies r
         JOIN users u ON u.id = r.author_id
        WHERE r.post_id = $1
        ORDER BY r.created_at ASC`,
      [postId]
    );
    const humanIds = repliesResult.rows.filter((r) => r.is_ai !== true).map((r) => r.id);

    const cachedRows = humanIds.length > 0
      ? (await db.query(
          `SELECT message_id, translation FROM message_need_translations
            WHERE surface = 'wall' AND message_id = ANY($1::uuid[])`,
          [humanIds]
        )).rows
      : [];
    const translations = {};
    for (const row of cachedRows) translations[row.message_id] = row.translation;

    const missing = humanIds.filter((id) => !translations[id]);
    // Reported back so the client can tell "nothing to do" apart from "asked
    // for 5, got 0" — the latter must never render as silence.
    let requested = 0;
    let translated = 0;
    logInfo('wall.translation.request', {
      userId, postId, humanMessages: humanIds.length, cached: cachedRows.length, missing: missing.length,
    });

    if (missing.length > 0) {
      const { tier, limit } = await resolveAiLimit(userId);
      const usedToday = await countTodayAiUsage(userId);
      const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
      if (!limitCheck.ok) {
        logInfo('wall.translation.limit', { userId, postId, used: usedToday, limit, tier, blocked: true });
        return res.status(limitCheck.status).json(limitCheck.body);
      }

      // The post itself leads the thread as context (not translated here).
      const threadForModel = [
        { id: `post:${postResult.rows[0].id}`, speaker: '貼文', content: postResult.rows[0].content },
        ...repliesResult.rows.map((r) => ({
          id: r.id,
          speaker: r.is_ai === true ? 'AI 諮商師' : (r.author_nickname || '某人'),
          content: r.content,
        })),
      ];

      logInfo('wall.translation.generate', { userId, postId, missing: missing.length });

      const result = await llmService.generateThreadTranslations({
        messages: threadForModel,
        targetIds: missing,
        context: { summary: postResult.rows[0].content },
      });
      const meta = result._meta;
      delete result._meta;

      logInfo('wall.translation.cost', {
        userId,
        postId,
        provider: meta?.provider,
        model: meta?.model,
        costUsd: meta?.costUsd,
        durationMs: meta?.durationMs,
      });

      let saved = 0;
      const unmatched = [];
      for (const t of result.translations || []) {
        if (!missing.includes(t.id)) { unmatched.push(t.id); continue; }
        const payload = { emotions: t.emotions || [], need: t.need || '', rewrite: t.rewrite || '' };
        translations[t.id] = payload;
        saved += 1;
        try {
          await db.query(
            `INSERT INTO message_need_translations (surface, message_id, couple_id, translation)
             VALUES ('wall', $1, $2, $3)
             ON CONFLICT (surface, message_id) DO UPDATE SET translation = EXCLUDED.translation`,
            [t.id, couple.id, JSON.stringify(payload)]
          );
        } catch (err) {
          logWarn('save wall translation failed', { messageId: t.id, err: err.message });
        }
      }
      logInfo('wall.translation.saved', {
        userId, postId, requested: missing.length, returned: (result.translations || []).length, saved, unmatched,
        truncated: meta?.truncated === true,
      });

      // Only bill the shared daily AI budget for work the user can actually
      // see. A batch that came back empty (model truncated mid tool_use) used
      // to burn a unit and cache nothing, so every retry cost another one.
      if (saved > 0) {
        await recordAiUsage(userId, 'need_translation', postResult.rows[0].content, meta);
      } else {
        logWarn('wall.translation.empty', {
          userId, postId, requested: missing.length, truncated: meta?.truncated === true,
        });
      }
      requested = missing.length;
      translated = saved;
    }

    logInfo('wall.translation.respond', {
      userId, postId, returnedKeys: Object.keys(translations).length, requested, translated,
    });
    res.json({ success: true, translations, ...translationStatus(requested, translated) });
  } catch (error) {
    logError('Get wall translations failed', { err: error.message, stack: error.stack, post_id: req.params.id });
    res.status(500).json({ success: false, message: '情緒翻譯暫時無法產生，請稍後再試' });
  }
});

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

// Share a wall thread into the public 公開問答 (anonymised, read-only). Either
// partner can publish their couple's post; single-party toggle with an in-app
// warning on the client.
router.post(
  '/:id/publish',
  [body('title').optional().isString().isLength({ max: 200 })],
  async (req, res) => {
    try {
      const userId = req.user.id;
      const couple = await findCoupleForUser(userId);
      if (!couple) return res.status(404).json({ success: false, message: '找不到貼文' });

      const postResult = await db.query(
        `SELECT id, content, is_private FROM wall_posts WHERE id = $1 AND couple_id = $2`,
        [req.params.id, couple.id]
      );
      if (postResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: '找不到貼文' });
      }
      // A private post isn't shared with the partner, so it can't be published
      // publicly either — ask the author to turn privacy off first.
      if (postResult.rows[0].is_private === true) {
        logInfo('wall.publish.blocked_private', { userId, postId: req.params.id, blocked: true });
        return res.status(400).json({
          success: false,
          message: '這是私密貼文。請先關閉私密（分享給對方），才能匿名公開。',
          error_code: 'WALL_PRIVATE_CANNOT_PUBLISH',
        });
      }
      const fallback = (postResult.rows[0].content || '').slice(0, 60);
      const title = (req.body.title && req.body.title.trim()) || fallback || '我們的牆分享';

      const result = await db.query(
        `UPDATE wall_posts
            SET public_status = 'published', public_title = $2,
                published_at = NOW(), published_by = $3
          WHERE id = $1
          RETURNING *`,
        [req.params.id, title, userId]
      );
      logInfo('wall.published', { userId, postId: req.params.id });
      res.json({
        success: true,
        message: '已匿名公開到公開問答，謝謝你願意幫助其他人。',
        post: mapPost({ ...result.rows[0], author_nickname: null }),
      });
    } catch (error) {
      logError('Publish wall post failed', { err: error.message, postId: req.params.id });
      res.status(500).json(errorResponseBody('公開失敗，請稍後再試', error));
    }
  }
);

// Un-share a previously published wall thread.
router.post('/:id/unpublish', async (req, res) => {
  try {
    const userId = req.user.id;
    const couple = await findCoupleForUser(userId);
    if (!couple) return res.status(404).json({ success: false, message: '找不到貼文' });

    const result = await db.query(
      `UPDATE wall_posts
          SET public_status = 'private', published_at = NULL
        WHERE id = $1 AND couple_id = $2
        RETURNING *`,
      [req.params.id, couple.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '找不到貼文' });
    }
    logInfo('wall.unpublished', { userId, postId: req.params.id });
    res.json({
      success: true,
      message: '已取消公開，這個對話不再顯示於公開問答。',
      post: mapPost({ ...result.rows[0], author_nickname: null }),
    });
  } catch (error) {
    logError('Unpublish wall post failed', { err: error.message, postId: req.params.id });
    res.status(500).json(errorResponseBody('取消公開失敗，請稍後再試', error));
  }
});

module.exports = router;
// Reusable helpers for the dedicated-therapist endpoints (routes/therapists.js).
module.exports.listWallPostsForCouple = listWallPostsForCouple;
module.exports.getWallPostForCouple = getWallPostForCouple;
module.exports.listRepliesForPost = listRepliesForPost;
module.exports.insertWallReply = insertWallReply;
module.exports.notifyPartner = notifyPartner;
