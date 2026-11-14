// 關係解方手冊 Relationship Playbook.
//
// Public (no login): the library list and each Playbook's full seven-section
// content, served from lib/playbooks/ in the caller's language (X-Locale). The
// value has to be visible BEFORE any sign-up prompt, so nothing here is gated.
//
// Private (JWT): saving a Playbook and writing "我的經驗" reflections. These rows
// belong to the user alone (migration 115) and never appear on public pages.

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { logInfo, logWarn } = require('../lib/logger');
const { logDbError, errorResponseBody } = require('../lib/db-errors');
const playbooks = require('../lib/playbooks');

const router = express.Router();

const EXPERIENCE_MAX = 4000;
const ANSWER_MAX = 2000;
const MAX_ANSWERS = 10;
// Per Playbook, per user. Generous: a reflection is meant to be revisited
// weekly, this only stops runaway clients.
const REFLECTIONS_PER_PLAYBOOK = 100;

function sendValidationError(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({
    success: false,
    message: '內容格式不正確，請檢查後再送出一次',
    error_code: 'VALIDATION_FAILED',
    errors: errors.array(),
  });
  return true;
}

function notFound(res) {
  return res.status(404).json({
    success: false,
    message: '找不到這份手冊，它可能已經下架；回到手冊列表看看其他主題吧',
    error_code: 'PLAYBOOK_NOT_FOUND',
  });
}

const slugParam = param('slug').isString().isLength({ min: 1, max: 80 }).matches(/^[a-z0-9-]+$/);

// ─── Public ────────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const list = playbooks.listPlaybooks(req.locale);
  logInfo('playbooks.library_viewed', { locale: req.locale, signedIn: false });
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Vary', 'X-Locale');
  res.json({ success: true, playbooks: list, categories: playbooks.listCategories(req.locale) });
});

// GET /api/playbooks/me — the caller's saves + reflection counts. Registered
// before /:slug so "me" is never read as a slug.
router.get('/me', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const [saves, reflections] = await Promise.all([
      db.query(
        'SELECT playbook_slug, created_at FROM playbook_saves WHERE user_id = $1 ORDER BY created_at DESC',
        [userId],
      ),
      db.query(
        `SELECT playbook_slug, COUNT(*)::int AS count, MAX(created_at) AS last_at
           FROM playbook_reflections WHERE user_id = $1
          GROUP BY playbook_slug ORDER BY MAX(created_at) DESC`,
        [userId],
      ),
    ]);
    res.json({
      success: true,
      saved: saves.rows.filter((r) => playbooks.isPublishedSlug(r.playbook_slug)).map((r) => ({ slug: r.playbook_slug, savedAt: r.created_at })),
      reflections: reflections.rows
        .filter((r) => playbooks.isPublishedSlug(r.playbook_slug))
        .map((r) => ({ slug: r.playbook_slug, count: r.count, lastAt: r.last_at })),
    });
  } catch (error) {
    logDbError('playbooks.me_failed', error, { userId });
    res.status(500).json(errorResponseBody('暫時讀不到你收藏的手冊，請稍後重新整理再試', error));
  }
});

router.get('/:slug', [slugParam], (req, res) => {
  if (sendValidationError(req, res)) return;
  const playbook = playbooks.getPlaybook(req.params.slug, req.locale);
  if (!playbook) {
    logWarn('playbooks.not_found', { slug: req.params.slug });
    return notFound(res);
  }
  logInfo('playbooks.viewed', { slug: playbook.slug, locale: req.locale });
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Vary', 'X-Locale');
  res.json({ success: true, playbook });
});

// ─── Private: save ─────────────────────────────────────────────────────────

router.put('/:slug/save', authenticateToken, [slugParam], async (req, res) => {
  if (sendValidationError(req, res)) return;
  const { slug } = req.params;
  if (!playbooks.isPublishedSlug(slug)) return notFound(res);
  const userId = req.user.id;
  try {
    await db.query(
      `INSERT INTO playbook_saves (user_id, playbook_slug) VALUES ($1, $2)
       ON CONFLICT (user_id, playbook_slug) DO NOTHING`,
      [userId, slug],
    );
    logInfo('playbooks.saved', { userId, slug });
    res.json({ success: true, saved: true, message: '已收藏，之後可以在「關係解方手冊」最上方找到它' });
  } catch (error) {
    logDbError('playbooks.save_failed', error, { userId, slug });
    res.status(500).json(errorResponseBody('收藏沒有成功，請稍後再按一次', error));
  }
});

router.delete('/:slug/save', authenticateToken, [slugParam], async (req, res) => {
  if (sendValidationError(req, res)) return;
  const { slug } = req.params;
  const userId = req.user.id;
  try {
    await db.query('DELETE FROM playbook_saves WHERE user_id = $1 AND playbook_slug = $2', [userId, slug]);
    logInfo('playbooks.unsaved', { userId, slug });
    res.json({ success: true, saved: false });
  } catch (error) {
    logDbError('playbooks.unsave_failed', error, { userId, slug });
    res.status(500).json(errorResponseBody('取消收藏沒有成功，請稍後再按一次', error));
  }
});

// ─── Private: reflections (我的經驗) ───────────────────────────────────────

function toReflection(r) {
  return {
    id: r.id,
    slug: r.playbook_slug,
    experience: r.experience,
    answers: Array.isArray(r.answers) ? r.answers : [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

router.get('/:slug/reflections', authenticateToken, [slugParam], async (req, res) => {
  if (sendValidationError(req, res)) return;
  const { slug } = req.params;
  const userId = req.user.id;
  try {
    const result = await db.query(
      `SELECT id, playbook_slug, experience, answers, created_at, updated_at
         FROM playbook_reflections
        WHERE user_id = $1 AND playbook_slug = $2
        ORDER BY created_at DESC
        LIMIT 50`,
      [userId, slug],
    );
    res.json({ success: true, reflections: result.rows.map(toReflection) });
  } catch (error) {
    logDbError('playbooks.reflections_list_failed', error, { userId, slug });
    res.status(500).json(errorResponseBody('暫時讀不到你的經驗紀錄，請稍後重新整理再試', error));
  }
});

router.post(
  '/:slug/reflections',
  authenticateToken,
  [
    slugParam,
    body('experience').isString().trim().isLength({ min: 1, max: EXPERIENCE_MAX }),
    body('answers').optional().isArray({ max: MAX_ANSWERS }),
    body('answers.*.question').optional().isString().isLength({ max: 300 }),
    body('answers.*.answer').optional().isString().isLength({ max: ANSWER_MAX }),
  ],
  async (req, res) => {
    const { slug } = req.params;
    const userId = req.user.id;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const experienceErr = errors.array().find((e) => e.path === 'experience');
      if (experienceErr) {
        const tooLong = typeof req.body.experience === 'string' && req.body.experience.trim().length > EXPERIENCE_MAX;
        logInfo('playbooks.reflection_rejected', { userId, slug, reason: tooLong ? 'too_long' : 'empty' });
        return res.status(400).json({
          success: false,
          message: tooLong
            ? `經驗紀錄最多 ${EXPERIENCE_MAX} 字，請精簡一些再儲存`
            : '先寫下一兩句你們發生的事，再按儲存',
          error_code: tooLong ? 'REFLECTION_TOO_LONG' : 'REFLECTION_EMPTY',
        });
      }
      return sendValidationError(req, res);
    }
    if (!playbooks.isPublishedSlug(slug)) return notFound(res);

    const answers = (Array.isArray(req.body.answers) ? req.body.answers : [])
      .filter((a) => a && typeof a.question === 'string' && typeof a.answer === 'string' && a.answer.trim())
      .map((a) => ({ question: a.question.slice(0, 300), answer: a.answer.trim().slice(0, ANSWER_MAX) }));

    try {
      const count = await db.query(
        'SELECT COUNT(*)::int AS n FROM playbook_reflections WHERE user_id = $1 AND playbook_slug = $2',
        [userId, slug],
      );
      if (count.rows[0].n >= REFLECTIONS_PER_PLAYBOOK) {
        logWarn('playbooks.reflection_limit', { userId, slug, limit: REFLECTIONS_PER_PLAYBOOK });
        return res.status(429).json({
          success: false,
          message: `這份手冊最多保存 ${REFLECTIONS_PER_PLAYBOOK} 則經驗紀錄，刪掉幾則舊的就能再新增`,
          error_code: 'REFLECTION_LIMIT',
        });
      }
      const result = await db.query(
        `INSERT INTO playbook_reflections (user_id, playbook_slug, experience, answers)
         VALUES ($1, $2, $3, $4::jsonb)
         RETURNING id, playbook_slug, experience, answers, created_at, updated_at`,
        [userId, slug, req.body.experience.trim(), JSON.stringify(answers)],
      );
      logInfo('playbooks.reflection_created', { userId, slug, answers: answers.length, chars: req.body.experience.trim().length });
      res.status(201).json({ success: true, reflection: toReflection(result.rows[0]), message: '已儲存，只有你看得到這則經驗紀錄' });
    } catch (error) {
      logDbError('playbooks.reflection_create_failed', error, { userId, slug });
      res.status(500).json(errorResponseBody('經驗紀錄沒有存成功，你寫的內容還在，請稍後再按一次儲存', error));
    }
  },
);

router.delete('/reflections/:id', authenticateToken, [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  const userId = req.user.id;
  try {
    const result = await db.query(
      'DELETE FROM playbook_reflections WHERE id = $1 AND user_id = $2 RETURNING playbook_slug',
      [req.params.id, userId],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: '找不到這則經驗紀錄，它可能已經被刪除了',
        error_code: 'REFLECTION_NOT_FOUND',
      });
    }
    logInfo('playbooks.reflection_deleted', { userId, slug: result.rows[0].playbook_slug });
    res.json({ success: true });
  } catch (error) {
    logDbError('playbooks.reflection_delete_failed', error, { userId });
    res.status(500).json(errorResponseBody('刪除沒有成功，請稍後再試一次', error));
  }
});

module.exports = router;
