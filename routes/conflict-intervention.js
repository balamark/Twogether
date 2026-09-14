// Sophie 衝突即時介入 — the message-hold mediator.
//
// The one line that governs every endpoint here:
//   The message is never blocked or rewritten. We only control WHEN and HOW the
//   other partner receives it.
//
// Flow (Level ≥ hold threshold):
//   POST /messages           → save the words, hold them, return Sophie's pause
//   POST /:id/answer         → user picks the core need → AI emotional translation
//   POST /:id/confirm        → user confirms / edits / rejects the translation
//   POST /:id/release        → deliver the ORIGINAL (+ translation) to the partner
// Level 0/1 (or a never-silence override) deliver immediately.

const express = require('express');
const { body, param } = require('express-validator');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const llmService = require('../services/llmService');
const { checkLimit } = require('../lib/entitlements');
const { countTodayAiUsage, resolveAiLimit, recordAiUsage } = require('../lib/aiUsage');
const { getCoupleForUser, sendValidationError } = require('../lib/eventAccess');
const { notify } = require('../lib/eventNotify');
const { logInfo, logWarn, logError } = require('../lib/logger');
const {
  LEVEL,
  CORE_QUESTION,
  CORE_OPTIONS,
  detectEmotion,
  shouldHold,
  findCoreOption,
  pauseCopy,
  safetyCopy,
  agencyCopy,
  gentleNudge,
  serializeIntervention,
} = require('../lib/conflictMediator');

const router = express.Router();

router.use(authenticateToken);

// The intervention menu the sender needs on every held-message screen.
function interventionMenu(level) {
  return {
    pause: pauseCopy(level),
    core_question: CORE_QUESTION,
    core_options: CORE_OPTIONS,
    // Sophie's highest-level branch — offered from the pause when the urge is to
    // retaliate (surfaced most on escalation, available whenever a message is held).
    agency: agencyCopy(),
  };
}

// Load one intervention the caller is party to (sender OR recipient). Returns
// null for a stranger or a missing id — collapsed into one 404 so ids can't be
// probed.
async function loadIntervention(id, userId) {
  const r = await db.query(
    `SELECT * FROM conflict_interventions
      WHERE id = $1 AND (sender_id = $2 OR recipient_id = $2)`,
    [id, userId]
  );
  return r.rows[0] || null;
}

// Both partners' genders so the AI translation uses 他/她 instead of guessing.
async function getCoupleGenders(userId) {
  try {
    const r = await db.query(
      `SELECT u.gender AS user_gender, p.gender AS partner_gender
         FROM users u
         LEFT JOIN couples c ON (c.user1_id = u.id OR c.user2_id = u.id) AND c.user2_id IS NOT NULL
         LEFT JOIN users p ON p.id = CASE WHEN c.user1_id = u.id THEN c.user2_id ELSE c.user1_id END
        WHERE u.id = $1`,
      [userId]
    );
    return {
      userGender: r.rows[0]?.user_gender || null,
      partnerGender: r.rows[0]?.partner_gender || null,
    };
  } catch (err) {
    logWarn('conflict.getCoupleGenders failed', { err: err.message });
    return { userGender: null, partnerGender: null };
  }
}

// Deliver a released message to the partner (in-app + LINE + email fan-out).
async function notifyRelease(row) {
  await notify(
    row.recipient_id,
    'conflict_released',
    'TA有一段話想讓你聽見',
    'Sophie 陪TA整理過情緒後，把原話交給你',
    null,
    row.sender_id,
    2,
    row.original_text
  );
}

// ---------------------------------------------------------------------------
// POST /messages — send. Detect the emotion level and decide when to deliver.
// ---------------------------------------------------------------------------
router.post(
  '/messages',
  [
    body('content')
      .isString()
      .isLength({ min: 1, max: 2000 })
      .withMessage('訊息需在 1–2000 字之間，請刪減後再送出，或分成兩則送出'),
    body('force').optional().isBoolean(),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const userId = req.user.id;
      const couple = await getCoupleForUser(userId);
      if (!couple) {
        // Three-part gate (why blocked · what you CAN do · a next step).
        return res.status(400).json({
          success: false,
          error_code: 'CONFLICT_NOT_PAIRED',
          message:
            'Sophie 的即時介入需要先配對伴侶才能運作（訊息要有人可以收）。你可以先到「說開一件事」把情緒寫成草稿，配對成功後再送出。',
        });
      }

      const content = req.body.content.trim();
      const force = req.body.force === true;
      const detection = detectEmotion(content);

      const base = {
        couple_id: couple.couple_id,
        sender_id: userId,
        recipient_id: couple.partner_id,
        original_text: content,
        emotion_level: detection.level,
        detected_signals: detection.signals,
      };

      // --- Safety override: never dress a threat up as a normal spat. --------
      if (detection.safety) {
        const row = (
          await db.query(
            `INSERT INTO conflict_interventions
               (couple_id, sender_id, recipient_id, original_text, emotion_level,
                detected_signals, message_status, state, safety_flag)
             VALUES ($1,$2,$3,$4,$5,$6,'HELD','PAUSED',TRUE)
             RETURNING *`,
            [base.couple_id, base.sender_id, base.recipient_id, base.original_text, base.emotion_level, base.detected_signals]
          )
        ).rows[0];
        logWarn('conflict.message.safety_hold', {
          userId, coupleId: couple.couple_id, signals: detection.safetySignals,
        });
        return res.status(201).json({
          success: true,
          safety: true,
          safety_copy: safetyCopy(),
          intervention: serializeIntervention(row, userId),
        });
      }

      // --- Immediate delivery: normal / tension, or never-silence override. --
      if (force || !shouldHold(detection.level)) {
        const row = (
          await db.query(
            `INSERT INTO conflict_interventions
               (couple_id, sender_id, recipient_id, original_text, emotion_level,
                detected_signals, message_status, state, released_at)
             VALUES ($1,$2,$3,$4,$5,$6,'DELIVERED','COMPLETED',NOW())
             RETURNING *`,
            [base.couple_id, base.sender_id, base.recipient_id, base.original_text, base.emotion_level, base.detected_signals]
          )
        ).rows[0];
        await notifyRelease(row);
        logInfo('conflict.message.delivered', {
          userId, coupleId: couple.couple_id, level: detection.level, forced: force,
        });
        return res.status(201).json({
          success: true,
          delivered: true,
          level: detection.level,
          // A Level-1 message still goes through — the nudge is optional coaching.
          gentle_nudge: detection.level === LEVEL.TENSION ? gentleNudge() : null,
          intervention: serializeIntervention(row, userId),
        });
      }

      // --- Hold for intervention: save the words, pause delivery. ------------
      const row = (
        await db.query(
          `INSERT INTO conflict_interventions
             (couple_id, sender_id, recipient_id, original_text, emotion_level,
              detected_signals, message_status, state)
           VALUES ($1,$2,$3,$4,$5,$6,'HELD','PAUSED')
           RETURNING *`,
          [base.couple_id, base.sender_id, base.recipient_id, base.original_text, base.emotion_level, base.detected_signals]
        )
      ).rows[0];
      logInfo('conflict.message.held', {
        userId, coupleId: couple.couple_id, level: detection.level, signals: detection.signals,
      });
      return res.status(201).json({
        success: true,
        held: true,
        level: detection.level,
        ...interventionMenu(detection.level),
        intervention: serializeIntervention(row, userId),
      });
    } catch (err) {
      logError('conflict.message failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: 'Sophie 暫時無法處理這則訊息，請稍後再試' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /active — the sender's one in-flight (not-yet-released) intervention, so a
// closed tab or a refresh can resume the pause instead of losing the held words.
// ---------------------------------------------------------------------------
router.get('/active', async (req, res) => {
  try {
    const r = await db.query(
      `SELECT * FROM conflict_interventions
        WHERE sender_id = $1 AND message_status IN ('HELD','IN_INTERVENTION')
        ORDER BY created_at DESC
        LIMIT 1`,
      [req.user.id]
    );
    const row = r.rows[0];
    if (!row) return res.json({ success: true, intervention: null });
    res.json({
      success: true,
      ...interventionMenu(row.emotion_level),
      safety: row.safety_flag === true,
      safety_copy: row.safety_flag ? safetyCopy() : null,
      intervention: serializeIntervention(row, req.user.id),
    });
  } catch (err) {
    logError('conflict.active failed', { err: err.message });
    res.status(500).json({ success: false, message: '無法載入進行中的對話' });
  }
});

// ---------------------------------------------------------------------------
// POST /:id/agency — record the retaliation / agency choice (§ highest-level
// intervention). No LLM, no message change: this only captures what the user
// said they wanted in the moment (fight / stop / be_understood, and the deeper
// hurt-vs-understand goal), marks the intervention as active mediation, and logs
// the path. The actual routing (translate vs raw release) is done by the client
// calling /answer or /release next — this endpoint never sends the message.
// ---------------------------------------------------------------------------
router.post(
  '/:id/agency',
  [
    param('id').isUUID(),
    body('intent').isIn(['fight', 'stop', 'be_understood']),
    body('goal').optional({ nullable: true }).isIn(['hurt', 'understand']),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const userId = req.user.id;
      const row = await loadIntervention(req.params.id, userId);
      if (!row || row.sender_id !== userId) {
        return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
      }
      if (!['HELD', 'IN_INTERVENTION'].includes(row.message_status)) {
        return res.status(400).json({ success: false, message: '這則訊息已經送出，無法再修改。' });
      }

      const intent = req.body.intent;
      const goal = req.body.goal || null;
      const updated = (
        await db.query(
          `UPDATE conflict_interventions
              SET agency_intent = $2,
                  agency_goal = COALESCE($3, agency_goal),
                  message_status = 'IN_INTERVENTION',
                  state = 'ACTIVE_MEDIATION'
            WHERE id = $1
            RETURNING *`,
          [row.id, intent, goal]
        )
      ).rows[0];

      // Log the path so Cloud Logging shows how often the real answer is
      // "I just want them to know how hurt I am" rather than "I want to fight".
      logInfo('conflict.agency', { userId, id: row.id, intent, goal, level: row.emotion_level });

      res.json({
        success: true,
        agency: agencyCopy(),
        intervention: serializeIntervention(updated, userId),
      });
    } catch (err) {
      logError('conflict.agency failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: 'Sophie 暫時無法處理，請稍後再試' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /:id/answer — the user picks the core need. Sophie produces the emotional
// translation (the paid LLM call — the only one in this feature).
// ---------------------------------------------------------------------------
router.post(
  '/:id/answer',
  [
    param('id').isUUID(),
    body('emotion_key').isString().isLength({ min: 1, max: 40 }),
    body('own_text').optional().isString().isLength({ max: 500 }),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const userId = req.user.id;
      const row = await loadIntervention(req.params.id, userId);
      if (!row || row.sender_id !== userId) {
        return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
      }
      if (!['HELD', 'IN_INTERVENTION'].includes(row.message_status)) {
        return res.status(400).json({ success: false, message: '這則訊息已經送出，無法再修改。' });
      }

      const option = findCoreOption(req.body.emotion_key);
      const ownText = (req.body.own_text || '').trim();
      const emotionLabel = option ? option.label : (ownText || '想被理解');

      // Daily AI budget (shared with the 說開一件事 rewrites). A reached cap is a
      // warning with a next step, surfaced with its own error_code by checkLimit.
      const { tier, limit } = await resolveAiLimit(userId);
      const usedToday = await countTodayAiUsage(userId);
      const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
      if (!limitCheck.ok) {
        logInfo('conflict.answer.limit', { userId, used: usedToday, limit, tier, blocked: true });
        return res.status(limitCheck.status).json(limitCheck.body);
      }

      // Reuse the draft-analysis model call: given the raw words + what the user
      // most wants understood, it returns the underlying emotion, need, and a
      // reframed line — exactly the emotional translation Sophie needs. The
      // synthesized summary biases it toward the chosen need without editing the
      // user's own message.
      const genders = await getCoupleGenders(userId);
      const summary = `這是一段衝突當下、情緒很滿的訊息。說話的人最希望對方理解的是：「${emotionLabel}」。請翻出這句話底下真正想被聽見的情緒與需求。`;
      let analysis;
      try {
        analysis = await llmService.analyzeDraft({
          draft: row.original_text,
          eventSummary: summary,
          recentMessages: [],
          userGender: genders.userGender,
          partnerGender: genders.partnerGender,
        });
      } catch (err) {
        logError('conflict.answer.translate_failed', { userId, id: row.id, err: err.message });
        return res.status(500).json({
          success: false,
          error_code: 'CONFLICT_TRANSLATE_FAILED',
          message: 'Sophie 這次沒能整理出你想說的話（沒有扣用今日額度）。可以再試一次，或直接讓TA看到原話。',
        });
      }
      const meta = analysis._meta;
      delete analysis._meta;

      const translation = (analysis.rewrite || '').trim() || null;
      const need = option?.need || (analysis.need || '').trim() || null;

      const updated = (
        await db.query(
          `UPDATE conflict_interventions
              SET message_status = 'IN_INTERVENTION',
                  state = 'CONFIRMING',
                  user_emotion = $2,
                  underlying_need = $3,
                  emotional_translation = $4,
                  translation_confirmed = FALSE
            WHERE id = $1
            RETURNING *`,
          [row.id, emotionLabel, need, translation]
        )
      ).rows[0];

      await recordAiUsage(userId, 'conflict_translation', row.original_text, meta);
      logInfo('conflict.answer.translated', {
        userId, id: row.id, provider: meta?.provider, costUsd: meta?.costUsd, durationMs: meta?.durationMs,
      });

      res.json({
        success: true,
        intervention: serializeIntervention(updated, userId),
        translation: {
          rewrite: translation,
          need,
          emotions: analysis.emotions || [],
          partnerHears: analysis.partnerHears || null,
        },
      });
    } catch (err) {
      logError('conflict.answer failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: 'Sophie 暫時無法整理這段話，請稍後再試' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /:id/confirm — the user confirms / edits / rejects the translation.
// Confirming moves to RELEASING; rejecting re-opens exploration so they can
// pick another need or write their own. AI translation NEVER replaces original.
// ---------------------------------------------------------------------------
router.post(
  '/:id/confirm',
  [
    param('id').isUUID(),
    body('confirmed').isBoolean(),
    body('edited_translation').optional().isString().isLength({ max: 2000 }),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const userId = req.user.id;
      const row = await loadIntervention(req.params.id, userId);
      if (!row || row.sender_id !== userId) {
        return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
      }
      if (!['HELD', 'IN_INTERVENTION'].includes(row.message_status)) {
        return res.status(400).json({ success: false, message: '這則訊息已經送出，無法再修改。' });
      }

      const confirmed = req.body.confirmed === true;
      const edited = (req.body.edited_translation || '').trim();

      const updated = (
        await db.query(
          `UPDATE conflict_interventions
              SET translation_confirmed = $2,
                  emotional_translation = COALESCE(NULLIF($3, ''), emotional_translation),
                  state = $4
            WHERE id = $1
            RETURNING *`,
          [row.id, confirmed, edited, confirmed ? 'RELEASING' : 'EXPLORING']
        )
      ).rows[0];

      logInfo('conflict.confirm', { userId, id: row.id, confirmed, edited: !!edited });
      res.json({ success: true, intervention: serializeIntervention(updated, userId) });
    } catch (err) {
      logError('conflict.confirm failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: '無法儲存，請稍後再試' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /:id/release — deliver the original (+ translation) to the partner. Works
// from ANY held state, so "直接讓他看到原話" (never-silence, §24) is the same
// endpoint — a raw release simply carries no confirmed translation.
// ---------------------------------------------------------------------------
router.post('/:id/release', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const userId = req.user.id;
    const row = await loadIntervention(req.params.id, userId);
    if (!row || row.sender_id !== userId) {
      return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
    }
    if (['RELEASED', 'DELIVERED'].includes(row.message_status)) {
      // Idempotent: a double-tap on 讓他看到 just returns the released row.
      return res.json({ success: true, intervention: serializeIntervention(row, userId) });
    }

    const updated = (
      await db.query(
        `UPDATE conflict_interventions
            SET message_status = 'RELEASED',
                state = 'COMPLETED',
                released_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [row.id]
      )
    ).rows[0];
    await notifyRelease(updated);
    logInfo('conflict.release', {
      userId, id: row.id, translated: !!updated.emotional_translation, confirmed: updated.translation_confirmed,
    });
    res.json({ success: true, intervention: serializeIntervention(updated, userId) });
  } catch (err) {
    logError('conflict.release failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '無法送出，請稍後再試' });
  }
});

// ---------------------------------------------------------------------------
// GET /inbox — the recipient's released messages (original + Sophie's lens).
// ---------------------------------------------------------------------------
router.get('/inbox', async (req, res) => {
  try {
    const r = await db.query(
      `SELECT * FROM conflict_interventions
        WHERE recipient_id = $1 AND message_status IN ('RELEASED','DELIVERED')
        ORDER BY released_at DESC NULLS LAST, created_at DESC
        LIMIT 50`,
      [req.user.id]
    );
    res.json({
      success: true,
      items: r.rows.map((row) => serializeIntervention(row, req.user.id)),
    });
  } catch (err) {
    logError('conflict.inbox failed', { err: err.message });
    res.status(500).json({ success: false, message: '無法載入收件匣' });
  }
});

// ---------------------------------------------------------------------------
// POST /:id/read — recipient opened it (RELEASED → DELIVERED). Optimistic on the
// client; this just records the receipt.
// ---------------------------------------------------------------------------
router.post('/:id/read', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const userId = req.user.id;
    const updated = (
      await db.query(
        `UPDATE conflict_interventions
            SET message_status = 'DELIVERED',
                delivered_read_at = COALESCE(delivered_read_at, NOW())
          WHERE id = $1 AND recipient_id = $2 AND message_status IN ('RELEASED','DELIVERED')
          RETURNING *`,
        [req.params.id, userId]
      )
    ).rows[0];
    if (!updated) return res.status(404).json({ success: false, message: '找不到訊息' });
    res.json({ success: true, intervention: serializeIntervention(updated, userId) });
  } catch (err) {
    logError('conflict.read failed', { err: err.message });
    res.status(500).json({ success: false, message: '無法更新狀態' });
  }
});

// ---------------------------------------------------------------------------
// POST /:id/understood — recipient's acknowledgement (§14). Not a verdict on who
// is right — only "did you hear what TA wanted you to hear?".
// ---------------------------------------------------------------------------
router.post(
  '/:id/understood',
  [param('id').isUUID(), body('understood').isBoolean()],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const userId = req.user.id;
      const understood = req.body.understood === true;
      const updated = (
        await db.query(
          `UPDATE conflict_interventions
              SET partner_understood = $3,
                  partner_understood_at = NOW(),
                  message_status = 'DELIVERED',
                  delivered_read_at = COALESCE(delivered_read_at, NOW())
            WHERE id = $1 AND recipient_id = $2 AND message_status IN ('RELEASED','DELIVERED')
            RETURNING *`,
          [req.params.id, userId, understood]
        )
      ).rows[0];
      if (!updated) return res.status(404).json({ success: false, message: '找不到訊息' });
      // Let the sender know their partner heard them — a quiet, positive signal.
      if (understood) {
        await notify(
          updated.sender_id,
          'conflict_understood',
          'TA說：我理解了',
          '你剛才想讓TA聽見的，TA收到了',
          null,
          userId,
          1
        );
      }
      logInfo('conflict.understood', { userId, id: updated.id, understood });
      res.json({ success: true, intervention: serializeIntervention(updated, userId) });
    } catch (err) {
      logError('conflict.understood failed', { err: err.message });
      res.status(500).json({ success: false, message: '無法送出回應' });
    }
  }
);

module.exports = router;
