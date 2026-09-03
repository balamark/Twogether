const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { getCoupleIdForUser } = require('../lib/entitlements');
const { logInfo, logWarn, logError } = require('../lib/logger');

const router = express.Router();
router.use(authenticateToken);

// 我們的故事 backend. Persists the couple's shared story timeline so it syncs
// across both partners and survives a cleared browser (it used to live only in
// localStorage). Two row kinds: 'story' (a milestone the couple added) and
// 'enrich' (photo + reflections layered onto a client-preset base milestone,
// keyed by base_ref). See migration 093.
//
// Photos are downscaled client-side to a JPEG data URL and stored in-column — a
// deliberately simple keepsake store (no media bucket), so the payload is
// size-capped here to keep rows and API responses sane.
const PHOTO_MAX_CHARS = 900 * 1024; // ~900KB of data URL ≈ a ~1000px JPEG
const TEXT_MAX = 4000;

// owner_scope = couple id when the user belongs to a couple, else their user id.
//
// A couple row is created lazily (couples.js, pairing), so a solo user's story
// first lands under owner_scope = userId. The moment a couple id appears, we MUST
// carry those rows over — otherwise the whole timeline would silently vanish
// (couples.id !== userId). So resolving the scope also migrates any stranded
// solo rows into the couple scope. It's a no-op once migrated. Enrich rows are
// de-duplicated first: the partial unique index (owner_scope, base_ref) would
// reject a solo enrich that collides with one the partner already made, so the
// colliding solo copy is dropped in favour of the existing couple row.
async function ownerScopeFor(userId) {
  const coupleId = await getCoupleIdForUser(userId);
  if (!coupleId || coupleId === userId) return coupleId || userId;
  try {
    await db.query(
      `DELETE FROM journey_milestones s
        WHERE s.owner_scope = $2 AND s.kind = 'enrich'
          AND EXISTS (
            SELECT 1 FROM journey_milestones c
             WHERE c.owner_scope = $1 AND c.kind = 'enrich' AND c.base_ref = s.base_ref
          )`,
      [coupleId, userId]
    );
    await db.query(
      `UPDATE journey_milestones SET owner_scope = $1 WHERE owner_scope = $2`,
      [coupleId, userId]
    );
  } catch (e) {
    logWarn('journey.scope.migrate_failed', { err: e.message });
  }
  return coupleId;
}

function rowToMilestone(r) {
  return {
    id: r.id,
    kind: r.kind,
    baseRef: r.base_ref || undefined,
    emoji: r.emoji || '',
    title: r.title || '',
    date: r.event_date ? new Date(r.event_date).toISOString().slice(0, 10) : '',
    place: r.place || undefined,
    description: r.description || '',
    photo: r.photo_url || undefined,
    likedThen: r.liked_then || undefined,
    realizeNow: r.realize_now || undefined,
  };
}

// Trim + clamp free text; empty → null so the column stays clean.
function cleanText(v, max = TEXT_MAX) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

// Accept only a data: image URL within the size cap; anything else → null so a
// bad/oversized value never lands in the DB.
function cleanPhoto(v) {
  if (typeof v !== 'string' || !v) return null;
  if (!/^data:image\//.test(v)) return null;
  if (v.length > PHOTO_MAX_CHARS) return null;
  return v;
}

function cleanDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  // Reject shape-valid but impossible dates (e.g. 2024-13-45) so they fail as a
  // 400 '日期格式錯誤' rather than a 500 from the DATE column.
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return v;
}

// GET /api/journey — the whole story layer for this scope.
router.get('/', async (req, res) => {
  const userId = req.user.id;
  try {
    const scope = await ownerScopeFor(userId);
    const result = await db.query(
      `SELECT id, kind, base_ref, emoji, title, event_date, place, description,
              photo_url, liked_then, realize_now
         FROM journey_milestones
        WHERE owner_scope = $1
        ORDER BY event_date NULLS LAST, created_at`,
      [scope]
    );
    const added = [];
    const enrich = {};
    for (const r of result.rows) {
      if (r.kind === 'enrich' && r.base_ref) {
        const m = rowToMilestone(r);
        enrich[r.base_ref] = {
          ...(m.photo ? { photo: m.photo } : {}),
          ...(m.likedThen ? { likedThen: m.likedThen } : {}),
          ...(m.realizeNow ? { realizeNow: m.realizeNow } : {}),
        };
      } else {
        added.push(rowToMilestone(r));
      }
    }
    res.json({ success: true, added, enrich });
  } catch (error) {
    logError('journey.list failed', { err: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '暫時讀不到你們的故事，請稍後再試。', error_code: 'JOURNEY_LIST_FAILED' });
  }
});

const photoValidator = body('photo').optional({ nullable: true }).custom((v) => {
  if (v == null || v === '') return true;
  if (typeof v !== 'string' || !/^data:image\//.test(v)) throw new Error('照片格式不支援');
  if (v.length > PHOTO_MAX_CHARS) throw new Error('照片太大，請換一張');
  return true;
});

// POST /api/journey — add a story milestone.
router.post('/', [
  body('title').isString().trim().isLength({ min: 1, max: 200 }).withMessage('請填一個標題'),
  body('date').custom((v) => cleanDate(v) !== null).withMessage('日期格式錯誤'),
  body('emoji').optional({ nullable: true }).isString().isLength({ max: 16 }),
  body('place').optional({ nullable: true }).isString().isLength({ max: 200 }),
  body('description').optional({ nullable: true }).isString().isLength({ max: TEXT_MAX }),
  body('likedThen').optional({ nullable: true }).isString().isLength({ max: TEXT_MAX }),
  body('realizeNow').optional({ nullable: true }).isString().isLength({ max: TEXT_MAX }),
  photoValidator,
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0]?.msg || '格式錯誤', errors: errors.array() });
  }
  const userId = req.user.id;
  try {
    const scope = await ownerScopeFor(userId);
    const inserted = await db.query(
      `INSERT INTO journey_milestones
         (owner_scope, kind, emoji, title, event_date, place, description, photo_url, liked_then, realize_now, created_by)
       VALUES ($1, 'story', $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, kind, base_ref, emoji, title, event_date, place, description, photo_url, liked_then, realize_now`,
      [
        scope,
        (req.body.emoji || '✦').slice(0, 16),
        cleanText(req.body.title, 200),
        cleanDate(req.body.date),
        cleanText(req.body.place, 200),
        cleanText(req.body.description),
        cleanPhoto(req.body.photo),
        cleanText(req.body.likedThen),
        cleanText(req.body.realizeNow),
        userId,
      ]
    );
    logInfo('journey.create', { userId, scope, id: inserted.rows[0].id });
    res.json({ success: true, milestone: rowToMilestone(inserted.rows[0]) });
  } catch (error) {
    logError('journey.create failed', { err: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '暫時存不了這段回憶，請稍後再試。', error_code: 'JOURNEY_CREATE_FAILED' });
  }
});

// PUT /api/journey/:id — update a story milestone owned by this scope.
router.put('/:id', [
  param('id').isUUID().withMessage('id 格式錯誤'),
  body('title').isString().trim().isLength({ min: 1, max: 200 }).withMessage('請填一個標題'),
  body('date').custom((v) => cleanDate(v) !== null).withMessage('日期格式錯誤'),
  body('emoji').optional({ nullable: true }).isString().isLength({ max: 16 }),
  body('place').optional({ nullable: true }).isString().isLength({ max: 200 }),
  body('description').optional({ nullable: true }).isString().isLength({ max: TEXT_MAX }),
  body('likedThen').optional({ nullable: true }).isString().isLength({ max: TEXT_MAX }),
  body('realizeNow').optional({ nullable: true }).isString().isLength({ max: TEXT_MAX }),
  photoValidator,
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0]?.msg || '格式錯誤', errors: errors.array() });
  }
  const userId = req.user.id;
  try {
    const scope = await ownerScopeFor(userId);
    const updated = await db.query(
      `UPDATE journey_milestones SET
         emoji = $3, title = $4, event_date = $5, place = $6, description = $7,
         photo_url = $8, liked_then = $9, realize_now = $10, updated_at = NOW()
       WHERE id = $1 AND owner_scope = $2 AND kind = 'story'
       RETURNING id, kind, base_ref, emoji, title, event_date, place, description, photo_url, liked_then, realize_now`,
      [
        req.params.id,
        scope,
        (req.body.emoji || '✦').slice(0, 16),
        cleanText(req.body.title, 200),
        cleanDate(req.body.date),
        cleanText(req.body.place, 200),
        cleanText(req.body.description),
        cleanPhoto(req.body.photo),
        cleanText(req.body.likedThen),
        cleanText(req.body.realizeNow),
      ]
    );
    if (updated.rows.length === 0) {
      return res.status(404).json({ success: false, message: '找不到這段回憶，可能已被刪除。', error_code: 'JOURNEY_NOT_FOUND' });
    }
    res.json({ success: true, milestone: rowToMilestone(updated.rows[0]) });
  } catch (error) {
    logError('journey.update failed', { err: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '暫時存不了這次修改，請稍後再試。', error_code: 'JOURNEY_UPDATE_FAILED' });
  }
});

// DELETE /api/journey/:id — remove a story milestone owned by this scope.
router.delete('/:id', [param('id').isUUID()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'id 格式錯誤', errors: errors.array() });
  }
  const userId = req.user.id;
  try {
    const scope = await ownerScopeFor(userId);
    const del = await db.query(
      `DELETE FROM journey_milestones WHERE id = $1 AND owner_scope = $2 AND kind = 'story' RETURNING id`,
      [req.params.id, scope]
    );
    if (del.rows.length === 0) {
      return res.status(404).json({ success: false, message: '找不到這段回憶，可能已被刪除。', error_code: 'JOURNEY_NOT_FOUND' });
    }
    logInfo('journey.delete', { userId, scope, id: req.params.id });
    res.json({ success: true });
  } catch (error) {
    logError('journey.delete failed', { err: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '暫時刪不掉，請稍後再試。', error_code: 'JOURNEY_DELETE_FAILED' });
  }
});

// PUT /api/journey/enrich/:baseRef — upsert the extras (photo + reflections) on a
// client-preset base milestone. An all-empty payload clears (deletes) the row.
router.put('/enrich/:baseRef', [
  param('baseRef').isString().trim().isLength({ min: 1, max: 64 }),
  body('description').optional({ nullable: true }).isString().isLength({ max: TEXT_MAX }),
  body('likedThen').optional({ nullable: true }).isString().isLength({ max: TEXT_MAX }),
  body('realizeNow').optional({ nullable: true }).isString().isLength({ max: TEXT_MAX }),
  photoValidator,
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0]?.msg || '格式錯誤', errors: errors.array() });
  }
  const userId = req.user.id;
  const baseRef = req.params.baseRef;
  const photo = cleanPhoto(req.body.photo);
  const likedThen = cleanText(req.body.likedThen);
  const realizeNow = cleanText(req.body.realizeNow);
  try {
    const scope = await ownerScopeFor(userId);
    if (!photo && !likedThen && !realizeNow) {
      await db.query(
        `DELETE FROM journey_milestones WHERE owner_scope = $1 AND base_ref = $2 AND kind = 'enrich'`,
        [scope, baseRef]
      );
      return res.json({ success: true, enrich: {} });
    }
    await db.query(
      `INSERT INTO journey_milestones (owner_scope, kind, base_ref, photo_url, liked_then, realize_now, created_by)
       VALUES ($1, 'enrich', $2, $3, $4, $5, $6)
       ON CONFLICT (owner_scope, base_ref) WHERE kind = 'enrich'
       DO UPDATE SET photo_url = EXCLUDED.photo_url, liked_then = EXCLUDED.liked_then,
                     realize_now = EXCLUDED.realize_now, updated_at = NOW()`,
      [scope, baseRef, photo, likedThen, realizeNow, userId]
    );
    res.json({
      success: true,
      enrich: {
        ...(photo ? { photo } : {}),
        ...(likedThen ? { likedThen } : {}),
        ...(realizeNow ? { realizeNow } : {}),
      },
    });
  } catch (error) {
    logError('journey.enrich failed', { err: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '暫時存不了照片與回憶，請稍後再試。', error_code: 'JOURNEY_ENRICH_FAILED' });
  }
});

module.exports = router;
