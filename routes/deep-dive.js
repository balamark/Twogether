// 情緒深潛 Emotional Deep Dive — the guided journey router.
//
// One person (the owner) walks a self-paced state machine: name the feeling →
// is it familiar → a memory → a letter to the past → a letter of self-compassion
// → what I need now → a vulnerable letter to my partner → share → the partner
// reads / mirrors / validates / responds → repair. See the PRD and migration 087.
//
// Two hard rules this router enforces (mirrors of 一起收尾 in event-closure.js):
//   1. Pause / resume is free. Every step persists (`current_step` + `state`);
//      closing the app is a pause, and GET /active returns the resume point.
//   2. Private letters stay private. The past / compassion letters are never
//      returned to the partner (serializeJourney in lib/deepDiveAccess.js gates
//      it by viewer role); only the shared 寫給伴侶的信 crosses over.
//
// Solo (unpaired) users may walk the entire self-exploration half; only the
// 分享 step needs a real partner, where a three-part NOT_PAIRED gate invites one.

const express = require('express');
const { body, param } = require('express-validator');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const llmService = require('../services/llmService');
const { getCoupleForUser, assertEventAccess } = require('../lib/eventAccess');
const {
  assertJourneyAccess,
  loadJourneyArtifacts,
  serializeJourney,
  sendValidationError,
} = require('../lib/deepDiveAccess');
const { resolveCompanion } = require('../lib/aiCompanions');
const { countTodayAiUsage, resolveAiLimit, recordAiUsage } = require('../lib/aiUsage');
const { checkLimit } = require('../lib/entitlements');
const { isReflectionStep, isLetterKind } = require('../lib/deepDiveAi');
const notificationService = require('../services/notificationService');
const { logInfo, logWarn, logError } = require('../lib/logger');

const router = express.Router();
router.use(authenticateToken);

// The linear resume pointer. Branch: FAMILIARITY_CHECK may jump straight to
// CURRENT_NEED when nothing familiar comes up (the "write about now" path).
const STEP_ORDER = [
  'CURRENT_EMOTION', 'DEEPER_EMOTION', 'FAMILIARITY_CHECK', 'MEMORY_EXPLORATION',
  'PAST_PERSON', 'PAST_LETTER', 'COMPASSION_LETTER', 'CURRENT_NEED', 'PARTNER_LETTER',
  'SHARED', 'PARTNER_READING', 'PARTNER_MIRROR', 'PARTNER_VALIDATION',
  'PARTNER_RESPONSE', 'REPAIR', 'COMPLETED',
];
const LETTER_KINDS = ['past', 'compassion', 'partner'];
const MAX_LETTER_CHARS = 4000;

async function getNickname(userId) {
  try {
    const r = await db.query('SELECT nickname FROM users WHERE id = $1', [userId]);
    return r.rows[0]?.nickname || null;
  } catch (err) {
    logWarn('deep_dive getNickname failed', { err: err.message });
    return null;
  }
}

async function getUserCompanion(userId) {
  try {
    const r = await db.query('SELECT selected_therapist FROM users WHERE id = $1', [userId]);
    return resolveCompanion(r.rows[0]?.selected_therapist);
  } catch (err) {
    logWarn('deep_dive getUserCompanion failed; using default', { err: err.message });
    return resolveCompanion(null);
  }
}

// Build the AI context from the stored journey state (+ an unsaved draft the
// client may pass). The AI only ever sees THIS journey's own fields — never the
// couple's wider history (PRD §31).
async function buildContext(journey, { draft } = {}) {
  const state = journey.state || {};
  const me = await getNickname(journey.created_by);
  const ctx = {
    me,
    situation: state.situation || null,
    currentEmotions: state.current_emotions || null,
    deeperEmotions: state.deeper_emotions || null,
    familiarity: state.familiarity || null,
    memory: state.memory_text || null,
    pastPerson: state.past_person || null,
    currentNeed: state.current_need?.custom || state.current_need?.type || null,
    draft: draft || null,
  };
  return ctx;
}

// ---------------------------------------------------------------------------
// START / RESUME
// ---------------------------------------------------------------------------
// POST / — resume the caller's open journey, or start a fresh one. Optional
// { event_id } seeds the current conflict for AI context (Entry A).
router.post('/', [body('event_id').optional({ nullable: true }).isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const userId = req.user.id;

    const existing = await db.query(
      `SELECT * FROM deep_dive_journeys
        WHERE created_by = $1 AND status = 'in_progress'
        ORDER BY updated_at DESC LIMIT 1`,
      [userId]
    );
    if (existing.rows.length > 0) {
      const journey = existing.rows[0];
      const artifacts = await loadJourneyArtifacts(journey.id);
      logInfo('deep_dive.resume', { userId, journeyId: journey.id, step: journey.current_step });
      return res.json({ success: true, journey: serializeJourney(journey, artifacts, 'owner') });
    }

    const couple = await getCoupleForUser(userId); // null when solo — allowed.
    const state = {};
    let eventId = null;
    if (req.body.event_id) {
      const access = await assertEventAccess(req.body.event_id, userId);
      if (access) {
        eventId = access.event.id;
        if (access.event.summary) state.situation = access.event.summary;
        if (Array.isArray(access.event.emotions) && access.event.emotions.length) {
          state.current_emotions = access.event.emotions;
        }
      }
    }

    const inserted = await db.query(
      `INSERT INTO deep_dive_journeys (created_by, couple_id, event_id, status, current_step, state)
       VALUES ($1, $2, $3, 'in_progress', 'CURRENT_EMOTION', $4::jsonb)
       RETURNING *`,
      [userId, couple?.couple_id || null, eventId, JSON.stringify(state)]
    );
    const journey = inserted.rows[0];
    logInfo('deep_dive.start', { userId, journeyId: journey.id, fromEvent: !!eventId, paired: !!couple });
    res.json({ success: true, journey: serializeJourney(journey, { letters: [], partnerResponse: null }, 'owner') });
  } catch (err) {
    logError('Deep dive start failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '暫時沒辦法開始情緒深潛，請稍後再試一次。' });
  }
});

// GET /active — the caller's resume point (their most recent unfinished journey).
router.get('/active', async (req, res) => {
  try {
    const r = await db.query(
      `SELECT * FROM deep_dive_journeys
        WHERE created_by = $1 AND status NOT IN ('completed', 'abandoned')
        ORDER BY updated_at DESC LIMIT 1`,
      [req.user.id]
    );
    if (r.rows.length === 0) return res.json({ success: true, journey: null });
    const journey = r.rows[0];
    const artifacts = await loadJourneyArtifacts(journey.id);
    res.json({ success: true, journey: serializeJourney(journey, artifacts, 'owner') });
  } catch (err) {
    logError('Deep dive active failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '暫時讀不到你的情緒深潛進度。' });
  }
});

// GET /inbox — journeys a partner shared with the caller that still await them.
router.get('/inbox', async (req, res) => {
  try {
    const couple = await getCoupleForUser(req.user.id);
    if (!couple) return res.json({ success: true, journeys: [] });
    const r = await db.query(
      `SELECT j.id, j.status, j.updated_at, u.nickname AS from_nickname
         FROM deep_dive_journeys j
         JOIN users u ON u.id = j.created_by
        WHERE j.couple_id = $1 AND j.created_by = $2
          AND j.status IN ('shared', 'partner_reading')
        ORDER BY j.updated_at DESC`,
      [couple.couple_id, couple.partner_id]
    );
    res.json({ success: true, journeys: r.rows });
  } catch (err) {
    logError('Deep dive inbox failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '暫時讀不到伴侶分享的內容。' });
  }
});

// GET /:id — full state, filtered by the viewer's role.
router.get('/:id', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await assertJourneyAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到這段情緒深潛或沒有權限' });
    const artifacts = await loadJourneyArtifacts(access.journey.id);
    res.json({ success: true, journey: serializeJourney(access.journey, artifacts, access.viewerRole) });
  } catch (err) {
    logError('Deep dive get failed', { err: err.message, stack: err.stack, journeyId: req.params.id });
    res.status(500).json({ success: false, message: '暫時讀不到這段情緒深潛。' });
  }
});

// ---------------------------------------------------------------------------
// STEP — save answers + advance the resume pointer (owner only, while in progress)
// ---------------------------------------------------------------------------
router.patch(
  '/:id/step',
  [
    param('id').isUUID(),
    body('step').isIn(STEP_ORDER).withMessage('未知的步驟'),
    body('patch').optional({ nullable: true }).isObject(),
    body('skip').optional().isBoolean(),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const access = await assertJourneyAccess(req.params.id, req.user.id);
      if (!access) return res.status(404).json({ success: false, message: '找不到這段情緒深潛或沒有權限' });
      if (access.viewerRole !== 'owner') {
        return res.status(403).json({ success: false, message: '只有開始這段深潛的人可以編輯它。', error_code: 'DEEP_DIVE_NOT_OWNER' });
      }
      if (access.journey.status !== 'in_progress') {
        return res.status(400).json({
          success: false,
          message: '這段深潛已經分享或完成了，沒辦法再改前面的步驟。想重新探索可以開始一段新的。',
          error_code: 'DEEP_DIVE_LOCKED',
        });
      }

      const state = { ...(access.journey.state || {}) };
      if (req.body.patch && typeof req.body.patch === 'object') {
        Object.assign(state, req.body.patch);
      }
      if (req.body.skip) {
        const skipped = new Set(state.skipped || []);
        skipped.add(access.journey.current_step);
        state.skipped = Array.from(skipped);
      }

      const updated = await db.query(
        `UPDATE deep_dive_journeys SET current_step = $2, state = $3::jsonb
          WHERE id = $1 RETURNING *`,
        [access.journey.id, req.body.step, JSON.stringify(state)]
      );
      const journey = updated.rows[0];
      const artifacts = await loadJourneyArtifacts(journey.id);
      logInfo('deep_dive.step', { userId: req.user.id, journeyId: journey.id, step: req.body.step, skip: !!req.body.skip });
      res.json({ success: true, journey: serializeJourney(journey, artifacts, 'owner') });
    } catch (err) {
      logError('Deep dive step failed', { err: err.message, stack: err.stack, journeyId: req.params.id });
      res.status(500).json({ success: false, message: '這一步暫時存不起來，你寫的內容還在，請再試一次。' });
    }
  }
);

// ---------------------------------------------------------------------------
// LETTER — upsert a draft letter (owner only, while in progress)
// ---------------------------------------------------------------------------
router.put(
  '/:id/letter',
  [
    param('id').isUUID(),
    body('kind').isIn(LETTER_KINDS),
    body('content').isString().isLength({ max: MAX_LETTER_CHARS }),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const access = await assertJourneyAccess(req.params.id, req.user.id);
      if (!access) return res.status(404).json({ success: false, message: '找不到這段情緒深潛或沒有權限' });
      if (access.viewerRole !== 'owner') {
        return res.status(403).json({ success: false, message: '只有開始這段深潛的人可以寫這封信。', error_code: 'DEEP_DIVE_NOT_OWNER' });
      }
      // Sharing already happened -> the partner letter is frozen.
      if (access.journey.status !== 'in_progress') {
        return res.status(400).json({ success: false, message: '這封信已經分享或完成，沒辦法再改了。', error_code: 'DEEP_DIVE_LOCKED' });
      }

      await db.query(
        `INSERT INTO deep_dive_letters (journey_id, owner_id, kind, content, visibility, status)
         VALUES ($1, $2, $3, $4, 'private', 'draft')
         ON CONFLICT (journey_id, kind)
         DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
        [access.journey.id, req.user.id, req.body.kind, req.body.content]
      );
      logInfo('deep_dive.letter', { userId: req.user.id, journeyId: access.journey.id, kind: req.body.kind, len: req.body.content.length });
      res.json({ success: true, letter: { kind: req.body.kind, content: req.body.content } });
    } catch (err) {
      logError('Deep dive letter failed', { err: err.message, stack: err.stack, journeyId: req.params.id });
      res.status(500).json({ success: false, message: '這封信暫時存不起來，你寫的內容還在，請再試一次。' });
    }
  }
);

// ---------------------------------------------------------------------------
// AI — reflection / letter assist (charged to the shared daily budget)
// ---------------------------------------------------------------------------
router.post(
  '/:id/ai/:kind',
  [
    param('id').isUUID(),
    param('kind').isIn(['reflect', 'letter']),
    body('step').optional().isString(),
    body('letterKind').optional().isString(),
    body('draft').optional({ nullable: true }).isString().isLength({ max: MAX_LETTER_CHARS }),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const access = await assertJourneyAccess(req.params.id, req.user.id);
      if (!access) return res.status(404).json({ success: false, message: '找不到這段情緒深潛或沒有權限' });
      const userId = req.user.id;

      // Shared daily AI budget. A block is a soft, inline stop — the frontend
      // passes skipBillingRedirect so the user keeps their progress and can
      // just write it themselves.
      const { tier, limit, unlimitedAi } = await resolveAiLimit(userId);
      const usedToday = await countTodayAiUsage(userId);
      const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday, unlimited: unlimitedAi });
      if (!limitCheck.ok) {
        logInfo('deep_dive.ai', { userId, journeyId: access.journey.id, blocked: true, used: usedToday, limit, tier });
        return res.status(limitCheck.status).json({ ...limitCheck.body, error_code: 'DEEP_DIVE_AI_QUOTA' });
      }

      const companion = await getUserCompanion(userId);
      const ctx = await buildContext(access.journey, { draft: req.body.draft });

      let out;
      if (req.params.kind === 'reflect') {
        const step = isReflectionStep(req.body.step) ? req.body.step : 'emotion';
        if (step === 'partner_mirror') {
          // The partner is the one being coached; hand them the shared letter.
          const artifacts = await loadJourneyArtifacts(access.journey.id);
          const partnerLetter = (artifacts.letters || []).find((l) => l.kind === 'partner' && l.visibility === 'shared');
          ctx.partnerLetter = partnerLetter?.content || null;
        }
        out = await llmService.generateDeepDiveReflection({ step, context: ctx, companion });
      } else {
        const letterKind = isLetterKind(req.body.letterKind) && req.body.letterKind !== 'past' ? req.body.letterKind : 'partner';
        out = await llmService.generateDeepDiveLetter({ kind: letterKind, context: ctx, companion });
      }

      const meta = out._meta;
      await recordAiUsage(userId, 'deep_dive', ctx.situation || '情緒深潛', meta);
      logInfo('deep_dive.ai.cost', {
        userId, journeyId: access.journey.id, kind: req.params.kind,
        provider: meta?.provider, model: meta?.model, costUsd: meta?.costUsd, durationMs: meta?.durationMs,
      });

      const { _meta, ...payload } = out;
      res.json({ success: true, ...payload });
    } catch (err) {
      logError('Deep dive AI failed', { err: err.message, stack: err.stack, journeyId: req.params.id });
      res.status(500).json({ success: false, message: 'AI 暫時想不出來，你還是可以自己寫。' });
    }
  }
);

// ---------------------------------------------------------------------------
// SHARE — reveal the partner letter (owner only; needs a real pairing)
// ---------------------------------------------------------------------------
router.post('/:id/share', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await assertJourneyAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到這段情緒深潛或沒有權限' });
    if (access.viewerRole !== 'owner') {
      return res.status(403).json({ success: false, message: '只有開始這段深潛的人可以分享它。', error_code: 'DEEP_DIVE_NOT_OWNER' });
    }

    // Re-derive the couple now (a solo journey may have paired since it started).
    const couple = await getCoupleForUser(req.user.id);
    if (!couple) {
      return res.status(400).json({
        success: false,
        message: '分享這封信需要先和另一半配對。你寫的內容都已經幫你存好了，先邀請另一半，配對之後就能分享；在那之前，你也可以只保存給自己。',
        error_code: 'NOT_PAIRED',
      });
    }

    const letterRow = await db.query(
      `SELECT content FROM deep_dive_letters WHERE journey_id = $1 AND kind = 'partner'`,
      [access.journey.id]
    );
    const content = letterRow.rows[0]?.content?.trim();
    if (!content) {
      return res.status(400).json({
        success: false,
        message: '還沒有寫給伴侶的信可以分享。先在「寫給伴侶」那一步寫下幾句話，再分享給 TA。',
        error_code: 'DEEP_DIVE_NOTHING_TO_SHARE',
      });
    }

    await db.transaction(async (client) => {
      await client.query(
        `UPDATE deep_dive_letters SET visibility = 'shared', status = 'shared', updated_at = NOW()
          WHERE journey_id = $1 AND kind = 'partner'`,
        [access.journey.id]
      );
      await client.query(
        `UPDATE deep_dive_journeys SET couple_id = $2, status = 'partner_reading', current_step = 'PARTNER_READING'
          WHERE id = $1`,
        [access.journey.id, couple.couple_id]
      );
      await client.query(
        `INSERT INTO deep_dive_partner_responses (journey_id, responder_id, status)
         VALUES ($1, $2, 'reading') ON CONFLICT (journey_id) DO NOTHING`,
        [access.journey.id, couple.partner_id]
      );
    });

    notificationService.notifyPartnerAction({
      actorId: req.user.id,
      type: 'deep_dive_shared',
      content: '打開 App，先花點時間讀完 TA 想讓你了解的感受。',
    });

    const reload = await assertJourneyAccess(access.journey.id, req.user.id);
    const artifacts = await loadJourneyArtifacts(access.journey.id);
    logInfo('deep_dive.share', { userId: req.user.id, journeyId: access.journey.id });
    res.json({ success: true, journey: serializeJourney(reload.journey, artifacts, 'owner') });
  } catch (err) {
    logError('Deep dive share failed', { err: err.message, stack: err.stack, journeyId: req.params.id });
    res.status(500).json({ success: false, message: '暫時沒辦法分享，你的信已經存好了，請稍後再試一次。' });
  }
});

// ---------------------------------------------------------------------------
// PARTNER side — read → mirror → validate → respond
// ---------------------------------------------------------------------------
function requirePartner(access, res) {
  if (access.viewerRole !== 'partner') {
    res.status(403).json({ success: false, message: '這一步是留給收到信的另一半做的。', error_code: 'DEEP_DIVE_NOT_PARTNER' });
    return false;
  }
  return true;
}

async function loadForPartner(req, res) {
  const access = await assertJourneyAccess(req.params.id, req.user.id);
  if (!access) {
    res.status(404).json({ success: false, message: '找不到這段情緒深潛或沒有權限' });
    return null;
  }
  if (!requirePartner(access, res)) return null;
  return access;
}

router.post('/:id/partner/read', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await loadForPartner(req, res);
    if (!access) return;
    await db.query(
      `UPDATE deep_dive_journeys SET status = 'partner_reading', current_step = 'PARTNER_MIRROR'
        WHERE id = $1 AND status = 'shared'`,
      [access.journey.id]
    );
    logInfo('deep_dive.partner_read', { userId: req.user.id, journeyId: access.journey.id });
    res.json({ success: true });
  } catch (err) {
    logError('Deep dive partner read failed', { err: err.message, stack: err.stack, journeyId: req.params.id });
    res.status(500).json({ success: false, message: '暫時存不起來，請再試一次。' });
  }
});

router.put(
  '/:id/partner/mirror',
  [param('id').isUUID(), body('mirror').isString().trim().isLength({ min: 1, max: 2000 })],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const access = await loadForPartner(req, res);
      if (!access) return;
      await db.query(
        `UPDATE deep_dive_partner_responses SET mirror = $2, status = 'mirrored', updated_at = NOW()
          WHERE journey_id = $1`,
        [access.journey.id, req.body.mirror]
      );
      logInfo('deep_dive.partner_mirror', { userId: req.user.id, journeyId: access.journey.id });
      res.json({ success: true });
    } catch (err) {
      logError('Deep dive partner mirror failed', { err: err.message, stack: err.stack, journeyId: req.params.id });
      res.status(500).json({ success: false, message: '暫時存不起來，你寫的內容還在，請再試一次。' });
    }
  }
);

router.put(
  '/:id/partner/validation',
  [
    param('id').isUUID(),
    body('knew_now').optional({ nullable: true }).isString().isLength({ max: 2000 }),
    body('didnt_know').optional({ nullable: true }).isString().isLength({ max: 2000 }),
    body('want_you_to_know').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const access = await loadForPartner(req, res);
      if (!access) return;
      const validation = {
        knew_now: (req.body.knew_now || '').trim(),
        didnt_know: (req.body.didnt_know || '').trim(),
        want_you_to_know: (req.body.want_you_to_know || '').trim(),
      };
      await db.query(
        `UPDATE deep_dive_partner_responses SET validation = $2::jsonb, status = 'validated', updated_at = NOW()
          WHERE journey_id = $1`,
        [access.journey.id, JSON.stringify(validation)]
      );
      logInfo('deep_dive.partner_validation', { userId: req.user.id, journeyId: access.journey.id });
      res.json({ success: true });
    } catch (err) {
      logError('Deep dive partner validation failed', { err: err.message, stack: err.stack, journeyId: req.params.id });
      res.status(500).json({ success: false, message: '暫時存不起來，你寫的內容還在，請再試一次。' });
    }
  }
);

router.put(
  '/:id/partner/response',
  [param('id').isUUID(), body('response').isString().trim().isLength({ min: 1, max: 4000 })],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const access = await loadForPartner(req, res);
      if (!access) return;
      await db.transaction(async (client) => {
        await client.query(
          `UPDATE deep_dive_partner_responses SET response = $2, status = 'responded', updated_at = NOW()
            WHERE journey_id = $1`,
          [access.journey.id, req.body.response]
        );
        await client.query(
          `UPDATE deep_dive_journeys SET status = 'partner_responded', current_step = 'REPAIR'
            WHERE id = $1`,
          [access.journey.id]
        );
      });
      notificationService.notifyPartnerAction({
        actorId: req.user.id,
        type: 'deep_dive_partner_responded',
        content: '打開 App 看看 TA 的理解與回應。',
      });
      logInfo('deep_dive.partner_response', { userId: req.user.id, journeyId: access.journey.id });
      res.json({ success: true });
    } catch (err) {
      logError('Deep dive partner response failed', { err: err.message, stack: err.stack, journeyId: req.params.id });
      res.status(500).json({ success: false, message: '暫時存不起來，你寫的內容還在，請再試一次。' });
    }
  }
);

// ---------------------------------------------------------------------------
// REPAIR / CLOSE (owner) + ABANDON
// ---------------------------------------------------------------------------
router.post(
  '/:id/repair',
  [
    param('id').isUUID(),
    body('shared_understanding').optional({ nullable: true }).isString().isLength({ max: 2000 }),
    body('agreed_action').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const access = await assertJourneyAccess(req.params.id, req.user.id);
      if (!access) return res.status(404).json({ success: false, message: '找不到這段情緒深潛或沒有權限' });
      if (access.viewerRole !== 'owner') {
        return res.status(403).json({ success: false, message: '只有開始這段深潛的人可以收尾它。', error_code: 'DEEP_DIVE_NOT_OWNER' });
      }
      const state = { ...(access.journey.state || {}) };
      state.repair = {
        shared_understanding: (req.body.shared_understanding || '').trim(),
        agreed_action: (req.body.agreed_action || '').trim(),
      };
      const updated = await db.query(
        `UPDATE deep_dive_journeys SET state = $2::jsonb, status = 'completed', current_step = 'COMPLETED'
          WHERE id = $1 RETURNING *`,
        [access.journey.id, JSON.stringify(state)]
      );
      const artifacts = await loadJourneyArtifacts(access.journey.id);
      logInfo('deep_dive.repair', { userId: req.user.id, journeyId: access.journey.id });
      res.json({ success: true, journey: serializeJourney(updated.rows[0], artifacts, 'owner') });
    } catch (err) {
      logError('Deep dive repair failed', { err: err.message, stack: err.stack, journeyId: req.params.id });
      res.status(500).json({ success: false, message: '暫時存不起來，請再試一次。' });
    }
  }
);

router.post('/:id/abandon', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await assertJourneyAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到這段情緒深潛或沒有權限' });
    if (access.viewerRole !== 'owner') {
      return res.status(403).json({ success: false, message: '只有開始這段深潛的人可以結束它。', error_code: 'DEEP_DIVE_NOT_OWNER' });
    }
    await db.query(`UPDATE deep_dive_journeys SET status = 'abandoned' WHERE id = $1`, [access.journey.id]);
    logInfo('deep_dive.abandon', { userId: req.user.id, journeyId: access.journey.id });
    res.json({ success: true });
  } catch (err) {
    logError('Deep dive abandon failed', { err: err.message, stack: err.stack, journeyId: req.params.id });
    res.status(500).json({ success: false, message: '暫時沒辦法結束，請再試一次。' });
  }
});

module.exports = router;
