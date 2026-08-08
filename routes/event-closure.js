// 一起收尾 — the forward-looking half of an 事件.
//
// The old flow ended at a therapy note: a good read of what happened, with no
// answer to 下次怎麼辦. Closure adds one small observable commitment per person
// plus an optional shared decision, written by the humans and commented on by
// the AI afterwards — never the other way round.
//
// Shape of the machine (migration 083):
//
//   open ──「一起收尾」(either partner, ONE tap)──▶ closing ──▶ resolved
//     ▲                                             │
//     └──── 我還想再聊一下 (only before anyone submits)┘
//
// Entering closure is not a verdict about who was right, so it needs no
// handshake. It is safe to make one-tap because it is reversible three ways
// (cancel / skip / 72h auto-finalize) and replies stay open throughout.
//
// Mounted separately from routes/events.js so the Playbook and follow-up
// routers can follow the same seam later. It must NOT require('./events') —
// that is the shortcut that becomes a cycle; shared helpers live in
// lib/eventAccess.js and lib/eventNotify.js.

const express = require('express');
const { body, param } = require('express-validator');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const llmService = require('../services/llmService');
const { checkLimit } = require('../lib/entitlements');
const { resolveCompanion } = require('../lib/aiCompanions');
const { countTodayAiUsage, resolveAiLimit, recordAiUsage } = require('../lib/aiUsage');
const { logInfo, logWarn, logError } = require('../lib/logger');
const { assertEventAccess, sendValidationError } = require('../lib/eventAccess');
const { notify } = require('../lib/eventNotify');
const { isAssistField } = require('../lib/closureAi');

const router = express.Router();

router.use(authenticateToken);

// A commitment must be long enough to name an action and short enough to
// remember. Mirrors the CHECK on commitments.text in migration 083.
const MIN_COMMITMENT_CHARS = 4;
const MAX_COMMITMENT_CHARS = 200;

// How long an unanswered closure waits before it finalizes itself. Long enough
// that a busy partner isn't cut out, short enough that events don't strand in
// 'closing' and quietly corrupt every resolved count.
const CLOSURE_DEADLINE_HOURS = 72;
// An impatient partner can force the finish, but not within a day of asking.
const UNILATERAL_FINALIZE_AFTER_HOURS = 24;
// When the event resolves, each active commitment gets a follow-up date (Batch 3).
const FOLLOW_UP_AFTER_HOURS = 72;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function getNickname(userId) {
  if (!userId) return '伴侶';
  try {
    const r = await db.query(`SELECT nickname FROM users WHERE id = $1`, [userId]);
    return r.rows[0]?.nickname || '伴侶';
  } catch (err) {
    logWarn('closure getNickname failed', { err: err.message });
    return '伴侶';
  }
}

async function getUserCompanion(userId) {
  try {
    const r = await db.query(`SELECT selected_therapist FROM users WHERE id = $1`, [userId]);
    return resolveCompanion(r.rows[0]?.selected_therapist);
  } catch (err) {
    logWarn('closure getUserCompanion failed; using default', { err: err.message });
    return resolveCompanion(null);
  }
}

// Every closure endpoint below starts here: the event must exist, be visible to
// the caller, be shared (solo mode has nobody to close with) and be paired.
// Returns null after responding, so callers do `if (!ctx) return;`.
async function loadClosureContext(req, res, { requireClosing = true } = {}) {
  const access = await assertEventAccess(req.params.id, req.user.id);
  if (!access) {
    res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
    return null;
  }
  if (access.event.is_private) {
    res.status(403).json({
      success: false,
      message: '私人對話沒有收尾流程。想和伴侶一起定下下次的約定，可以先把它改成雙方都看得到的對話。',
      error_code: 'PRIVATE_EVENT',
    });
    return null;
  }
  if (!access.partnerId) {
    res.status(400).json({
      success: false,
      message: '收尾需要兩個人一起寫。先邀請另一半配對，配對之後就能一起定下下次的約定。',
      error_code: 'NOT_PAIRED',
    });
    return null;
  }
  if (requireClosing && access.event.status !== 'closing') {
    res.status(400).json({
      success: false,
      message: access.event.status === 'resolved'
        ? '你們已經完成這次收尾了。想再補上約定可以先重新開啟討論。'
        : '這段對話還沒進入收尾。先按「一起收尾」，你們就能各自寫下下次願意做的事。',
      error_code: 'EVENT_NOT_CLOSING',
    });
    return null;
  }
  return access;
}

async function getClosureRow(eventId) {
  const r = await db.query(`SELECT * FROM event_closures WHERE event_id = $1`, [eventId]);
  return r.rows[0] || null;
}

async function getParticipants(eventId) {
  const r = await db.query(
    `SELECT * FROM event_closure_participants WHERE event_id = $1`,
    [eventId]
  );
  return r.rows;
}

async function getCommitments(eventId) {
  const r = await db.query(
    `SELECT * FROM commitments
      WHERE event_id = $1 AND status IN ('draft','active')
      ORDER BY created_at ASC`,
    [eventId]
  );
  return r.rows;
}

// A participant is terminal when nothing more is expected of them: they wrote
// their part AND looked at their partner's, or they opted out.
function isTerminal(row) {
  return row && row.status !== 'pending';
}

// ---------------------------------------------------------------------------
// Serializer — this is where the reveal rule is enforced
// ---------------------------------------------------------------------------
// The partner's commitment is withheld server-side until I have submitted my
// own. Hiding it in the frontend would leave it one devtools panel away, and
// the whole point is that the less-assertive partner writes their own answer
// before reading someone else's to agree with.
function serializeClosure({ closure, participants, commitments, event, userId, partnerId, partnerNickname }) {
  const me = participants.find((p) => p.user_id === userId) || null;
  const partner = participants.find((p) => p.user_id === partnerId) || null;
  const iSubmitted = me?.status === 'submitted';

  const myCommitment = commitments.find((c) => c.owner_id === userId) || null;
  const partnerCommitment = commitments.find((c) => c.owner_id === partnerId) || null;

  const shapeCommitment = (row) => (row ? {
    id: row.id,
    ownerId: row.owner_id,
    text: row.text,
    status: row.status,
    reviewStatus: row.review_status,
    reviewNote: row.review_note || null,
    reviewedAt: row.reviewed_at,
    dueAt: row.due_at,
  } : null);

  const startedAt = closure.started_at ? new Date(closure.started_at) : null;
  const canFinalizeAt = startedAt
    ? new Date(startedAt.getTime() + UNILATERAL_FINALIZE_AFTER_HOURS * 3600 * 1000).toISOString()
    : null;

  // The shared decision is written by one partner but belongs to both, so
  // unlike a commitment it is only hidden while I still owe my own answer.
  const decisionVisible = iSubmitted || closure.shared_decision_by === userId || closure.status === 'finalized';

  return {
    eventId: closure.event_id,
    status: closure.status,
    eventStatus: event.status,
    startedBy: closure.started_by,
    startedAt: closure.started_at,
    deadlineAt: closure.deadline_at,
    canFinalizeAt,
    finalizedAt: closure.finalized_at,
    // The recap block renders from this — no new AI call to open the panel.
    therapyNote: event.therapy_note || null,
    insight: closure.insight?.text || null,
    insightAt: closure.insight_at,
    me: {
      userId,
      status: me?.status || 'pending',
      submittedAt: me?.submitted_at || null,
      reviewedAt: me?.reviewed_at || null,
      commitment: shapeCommitment(myCommitment),
    },
    partner: {
      userId: partnerId,
      nickname: partnerNickname,
      status: partner?.status || 'pending',
      submittedAt: partner?.submitted_at || null,
      // Withheld until I have written mine.
      commitment: iSubmitted ? shapeCommitment(partnerCommitment) : null,
    },
    sharedDecision: decisionVisible ? (closure.shared_decision || null) : null,
    sharedDecisionBy: decisionVisible ? closure.shared_decision_by : null,
    sharedDecisionStatus: closure.shared_decision_status,
    sharedDecisionNote: decisionVisible ? (closure.shared_decision_note || null) : null,
    // Nobody can be cancelled out of work they already did.
    canCancel: participants.every((p) => p.status === 'pending'),
  };
}

async function loadAndSerialize(access, userId) {
  const eventId = access.event.id;
  const [closure, participants, commitments, partnerNickname] = await Promise.all([
    getClosureRow(eventId),
    getParticipants(eventId),
    getCommitments(eventId),
    getNickname(access.partnerId),
  ]);
  if (!closure) return null;
  // Re-read the event so status reflects a finalize that just happened.
  const fresh = (await db.query(`SELECT * FROM events WHERE id = $1`, [eventId])).rows[0] || access.event;
  return serializeClosure({
    closure,
    participants,
    commitments,
    event: fresh,
    userId,
    partnerId: access.partnerId,
    partnerNickname,
  });
}

// ---------------------------------------------------------------------------
// enterClosing — one tap, both partners, one transaction
// ---------------------------------------------------------------------------
// Idempotent: a second tap (or the other partner tapping at the same moment)
// returns the existing closure rather than resetting the deadline. Deliberately
// does NOT set resolved_at — the event is not resolved yet, and every metric
// keyed on resolved_at must stay honest about that.
//
// A closure row outlives its closure: /reopen leaves an 'abandoned' row behind
// and a finished one stays 'finalized'. So the upsert RESETS a row that is no
// longer collecting — otherwise the second 一起收尾 on the same event runs
// against a stale row and submit rejects forever with CLOSURE_ALREADY_FINALIZED.
// The `WHERE status <> 'collecting'` is what keeps the idempotent re-tap from
// resetting a live deadline.
async function enterClosing(access, userId) {
  const eventId = access.event.id;
  return db.transaction(async (client) => {
    const claim = await client.query(
      `UPDATE events
          SET status = 'closing', updated_at = NOW()
        WHERE id = $1 AND status IN ('open', 'resolve_pending')
        RETURNING *`,
      [eventId]
    );
    const alreadyClosing = claim.rows.length === 0;

    await client.query(
      `INSERT INTO event_closures (event_id, couple_id, started_by, deadline_at)
       VALUES ($1, $2, $3, NOW() + ($4 || ' hours')::interval)
       ON CONFLICT (event_id) DO UPDATE
          SET status                 = 'collecting',
              started_by             = EXCLUDED.started_by,
              started_at             = NOW(),
              deadline_at            = EXCLUDED.deadline_at,
              finalized_at           = NULL,
              insight                = NULL,
              insight_at             = NULL,
              shared_decision        = NULL,
              shared_decision_by     = NULL,
              shared_decision_status = 'none',
              shared_decision_note   = NULL,
              updated_at             = NOW()
        WHERE event_closures.status <> 'collecting'`,
      [eventId, access.coupleId, userId, String(CLOSURE_DEADLINE_HOURS)]
    );
    await client.query(
      `INSERT INTO event_closure_participants (event_id, user_id)
       VALUES ($1, $2), ($1, $3)
       ON CONFLICT (event_id, user_id) DO NOTHING`,
      [eventId, userId, access.partnerId]
    );

    return { created: !alreadyClosing };
  });
}

// ---------------------------------------------------------------------------
// maybeFinalizeClosure — the race-safe single claim
// ---------------------------------------------------------------------------
// Called after every participant write. Zero rows back means either a partner
// is not terminal yet or another request won the race — either way this caller
// does nothing more. Only the winner activates commitments, requests the AI
// insight and fires the notification, so there are no duplicate pushes and no
// duplicate LLM spend. Same shape as the facilitation step_count claim.
//
// Terminal means: skipped/auto_skipped, or submitted AND reviewed the partner's
// commitment. The review clause is conditional on the partner having actually
// submitted something — if they skipped there is nothing to review, and a
// blanket "reviewed_at IS NOT NULL" would strand the closure forever.
const NOT_TERMINAL_EXISTS = `EXISTS (
        SELECT 1 FROM event_closure_participants p
         WHERE p.event_id = e.id
           AND (
             p.status = 'pending'
             OR (p.status = 'submitted' AND p.reviewed_at IS NULL AND EXISTS (
                   SELECT 1 FROM event_closure_participants q
                    WHERE q.event_id = e.id AND q.user_id <> p.user_id
                      AND q.status = 'submitted'))
           ))`;

async function maybeFinalizeClosure(eventId, { force = false } = {}) {
  const claim = await db.query(
    `UPDATE events e
        SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
      WHERE e.id = $1 AND e.status = 'closing'
        ${force ? '' : `AND NOT ${NOT_TERMINAL_EXISTS}`}
      RETURNING e.*`,
    [eventId]
  );
  if (claim.rows.length === 0) return null;
  const event = claim.rows[0];

  await db.query(
    `UPDATE event_closures
        SET status = 'finalized', finalized_at = NOW(), updated_at = NOW()
      WHERE event_id = $1`,
    [eventId]
  );

  // Draft → active, and the follow-up clock starts NOW (at resolution), not
  // whenever the partner happened to type first.
  const activated = await db.query(
    `UPDATE commitments
        SET status = 'active', activated_at = NOW(),
            due_at = NOW() + ($2 || ' hours')::interval, updated_at = NOW()
      WHERE event_id = $1 AND status = 'draft'
      RETURNING *`,
    [eventId, String(FOLLOW_UP_AFTER_HOURS)]
  );

  logInfo('events.closure.finalized', {
    eventId,
    forced: force,
    commitments: activated.rows.length,
  });

  return { event, commitments: activated.rows };
}

// The AI 見解 is written AFTER the finalize claim has already resolved the
// event, so a failed or quota-blocked call can never strand anything in
// 'closing'. On failure the summary card offers a manual retry instead.
async function writeClosureInsight(eventId, userId, { charge = true } = {}) {
  try {
    const closure = await getClosureRow(eventId);
    if (!closure) return null;
    const event = (await db.query(`SELECT * FROM events WHERE id = $1`, [eventId])).rows[0];
    if (!event) return null;

    const rows = (await db.query(
      `SELECT c.text, u.nickname
         FROM commitments c
         JOIN users u ON u.id = c.owner_id
        WHERE c.event_id = $1 AND c.status IN ('draft','active')
        ORDER BY c.created_at ASC`,
      [eventId]
    )).rows;
    if (rows.length === 0) {
      logInfo('events.closure.insight_deferred', { eventId, reason: 'no_commitments' });
      return null;
    }

    if (charge) {
      const { tier } = await resolveAiLimit(userId);
      const usedToday = await countTodayAiUsage(userId);
      const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
      if (!limitCheck.ok) {
        logInfo('events.closure.insight_deferred', { eventId, userId, reason: 'quota' });
        return null;
      }
    }

    const companion = await getUserCompanion(userId);
    const out = await llmService.generateClosureInsight({
      eventSummary: event.summary,
      therapyNote: event.therapy_note || null,
      commitments: rows.map((r) => ({ who: r.nickname, text: r.text })),
      sharedDecision: closure.shared_decision || null,
      companion,
    });
    const meta = out._meta;
    if (!out.insight) {
      logInfo('events.closure.insight_deferred', { eventId, reason: 'empty' });
      return null;
    }

    await db.query(
      `UPDATE event_closures
          SET insight = $2, insight_at = NOW(), updated_at = NOW()
        WHERE event_id = $1`,
      [eventId, JSON.stringify({ text: out.insight, companion: companion.id })]
    );
    await recordAiUsage(userId, 'closure_insight', event.summary || '收尾見解', meta);
    logInfo('events.closure.insight', {
      eventId, userId, provider: meta?.provider, model: meta?.model,
      costUsd: meta?.costUsd, durationMs: meta?.durationMs,
    });
    return out.insight;
  } catch (err) {
    // Never rethrow: the event is already resolved and the user is owed a
    // response. The card falls back to 「想聽聽 AI 怎麼看？」.
    logWarn('events.closure.insight_deferred', { eventId, reason: 'error', err: err.message });
    return null;
  }
}

// Everything that must happen once a closure finishes, whoever triggered it.
async function afterFinalize(access, userId, result, { notifyPartner = true } = {}) {
  const eventId = access.event.id;
  if (notifyPartner && access.partnerId) {
    await notify(
      access.partnerId,
      'event_closure_done',
      '你們一起定下了下次的約定',
      access.event.title,
      eventId,
      userId
    );
    // Deliberately NOT also firing 'event_resolved'. The closure IS the
    // resolution, and sending both gave the partner two inbox rows, two LINE
    // pushes and two emails for one event.
  }
  await writeClosureInsight(eventId, userId);
  return result;
}

// ---------------------------------------------------------------------------
// Lazy 72h sweep — there is no cron in this app
// ---------------------------------------------------------------------------
// Ridden fire-and-forget off GET /api/events (hit whenever anyone opens
// 好好說話), same pattern as the relationship reminders. An absent partner is
// marked 'auto_skipped', never 'skipped' — they didn't decline, they just
// weren't there, and the copy the user eventually sees must not blame them.
// Rides GET /api/events, which every user hits on opening 好好說話, so without a
// gate it runs on literally every request — 20 closures' worth of queries each
// time. Once every few minutes per process is plenty for a 72h deadline.
// Disabled under test so the sweep spec can drive it off a single GET without
// racing a throttle set by an earlier request in the same serial run.
const SWEEP_MIN_INTERVAL_MS = process.env.NODE_ENV === 'test' ? 0 : 5 * 60 * 1000;
let lastSweepAt = 0;

async function sweepOverdueClosures({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastSweepAt < SWEEP_MIN_INTERVAL_MS) return;
  lastSweepAt = now;
  try {
    const due = await db.query(
      `SELECT event_id FROM event_closures
        WHERE status = 'collecting' AND deadline_at <= NOW()
        LIMIT 20`
    );
    for (const row of due.rows) {
      const eventId = row.event_id;
      const claimed = await db.query(
        `UPDATE event_closure_participants
            SET status = 'auto_skipped', updated_at = NOW()
          WHERE event_id = $1 AND status = 'pending'
          RETURNING user_id`,
        [eventId]
      );
      // force: past the deadline the clock is the authority, not the state
      // machine. Without it a closure where both submitted but neither reviewed
      // flips zero rows above, still trips NOT_TERMINAL_EXISTS, and sits in
      // 'closing' forever — re-occupying the LIMIT 20 window on every sweep.
      const result = await maybeFinalizeClosure(eventId, { force: true });
      if (result) {
        logInfo('events.closure.auto_finalize', {
          eventId,
          autoSkipped: claimed.rows.length,
          commitments: result.commitments.length,
        });
        // Whoever started it is the one still waiting, so tell them it landed.
        const closure = await getClosureRow(eventId);
        const participants = await getParticipants(eventId);
        for (const p of participants) {
          if (p.status === 'submitted') {
            await notify(
              p.user_id,
              'event_closure_done',
              '你們的收尾先幫你們留著了',
              result.event.title,
              eventId,
              null
            );
          }
        }
        await writeClosureInsight(eventId, closure?.started_by || participants[0]?.user_id, { charge: false });
      }
    }
  } catch (err) {
    logWarn('sweepOverdueClosures failed', { err: err.message });
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// START — Screen 1's confirm. No LLM, no quota: opening 收尾 must never be
// gated by an exhausted AI budget, because it is a mandatory step.
router.post('/:id/closure/start', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await loadClosureContext(req, res, { requireClosing: false });
    if (!access) return;
    const userId = req.user.id;

    if (access.event.status === 'resolved') {
      return res.status(400).json({
        success: false,
        message: '你們已經完成這次收尾了。想再補上約定可以先重新開啟討論。',
        error_code: 'CLOSURE_ALREADY_FINALIZED',
      });
    }

    const { created } = await enterClosing(access, userId);
    logInfo('events.closure.start', { userId, eventId: access.event.id, created });

    if (created) {
      const nickname = await getNickname(userId);
      await notify(
        access.partnerId,
        'event_closing_started',
        `${nickname} 想和你一起想想下次怎麼做`,
        access.event.title,
        access.event.id,
        userId
      );
    }

    const fresh = await assertEventAccess(access.event.id, userId);
    const closure = await loadAndSerialize(fresh, userId);
    res.status(created ? 201 : 200).json({ success: true, closure });
  } catch (err) {
    logError('Closure start failed', { err: err.message, stack: err.stack, eventId: req.params.id });
    res.status(500).json({ success: false, message: '無法開始收尾，請稍後再試' });
  }
});

// GET — the whole panel state. No LLM.
router.get('/:id/closure', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await loadClosureContext(req, res, { requireClosing: false });
    if (!access) return;
    const closure = await loadAndSerialize(access, req.user.id);
    if (!closure) {
      return res.status(404).json({
        success: false,
        message: '這段對話還沒有收尾紀錄。按「一起收尾」就能開始。',
        error_code: 'CLOSURE_NOT_STARTED',
      });
    }
    res.json({ success: true, closure });
  } catch (err) {
    logError('Get closure failed', { err: err.message, stack: err.stack, eventId: req.params.id });
    res.status(500).json({ success: false, message: '無法載入收尾進度，請稍後再試' });
  }
});

// ASSIST — 幫我想一個. Opt-in, billable, and a 429 here is an ordinary expected
// state: the textarea stays editable and submitting still works.
router.post(
  '/:id/closure/assist',
  [param('id').isUUID(), body('field').optional().isIn(['commitment', 'decision'])],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const access = await loadClosureContext(req, res);
      if (!access) return;
      const userId = req.user.id;
      const field = isAssistField(req.body.field) ? req.body.field : 'commitment';

      const { tier, limit } = await resolveAiLimit(userId);
      const usedToday = await countTodayAiUsage(userId);
      const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
      if (!limitCheck.ok) {
        logInfo('events.closure.assist', {
          userId, eventId: access.event.id, field, blocked: true, used: usedToday, limit, tier,
        });
        return res.status(limitCheck.status).json(limitCheck.body);
      }

      logInfo('events.closure.assist', { userId, eventId: access.event.id, field, blocked: false });

      const [me, partner, companion] = await Promise.all([
        getNickname(userId),
        getNickname(access.partnerId),
        getUserCompanion(userId),
      ]);
      const thread = (await db.query(
        `SELECT m.content, m.is_ai, u.nickname AS speaker
           FROM event_messages m
           LEFT JOIN users u ON u.id = m.sender_id
          WHERE m.event_id = $1
          ORDER BY m.created_at DESC LIMIT 20`,
        [access.event.id]
      )).rows.reverse().map((m) => ({
        speaker: m.speaker || '某人',
        content: m.content,
        isAi: m.is_ai === true,
      }));

      const out = await llmService.generateClosureAssist({
        field,
        eventSummary: access.event.summary,
        messages: thread,
        therapyNote: access.event.therapy_note || null,
        me,
        partner,
        companion,
      });
      const meta = out._meta;
      await recordAiUsage(userId, 'closure_assist', access.event.summary || '收尾建議', meta);
      logInfo('events.closure.assist.cost', {
        userId, eventId: access.event.id, field,
        provider: meta?.provider, model: meta?.model, costUsd: meta?.costUsd, durationMs: meta?.durationMs,
        options: out.options.length,
      });

      res.json({ success: true, options: out.options });
    } catch (err) {
      logError('Closure assist failed', { err: err.message, stack: err.stack, eventId: req.params.id });
      res.status(500).json({ success: false, message: 'AI 暫時想不出來，你還是可以自己寫一句。' });
    }
  }
);

// SUBMIT — my commitment (+ optionally the shared decision). Re-submittable
// while the closure is still collecting: after seeing your partner's you must
// be able to revise your own.
router.post(
  '/:id/closure/submit',
  [
    param('id').isUUID(),
    body('commitment').isString().trim()
      .isLength({ min: MIN_COMMITMENT_CHARS, max: MAX_COMMITMENT_CHARS })
      .withMessage(`這個約定有點短。試著寫成一個看得見的行動，例如「即使很生氣，也不在人前責罵你」。`),
    body('sharedDecision').optional({ nullable: true }).isString().trim().isLength({ max: MAX_COMMITMENT_CHARS }),
  ],
  async (req, res) => {
    // A too-short commitment is an expected state on the way to writing a good
    // one, not a failure — the code lets the client show it as a warning.
    if (sendValidationError(req, res, 'COMMITMENT_TOO_SHORT')) return;
    try {
      const access = await loadClosureContext(req, res);
      if (!access) return;
      const userId = req.user.id;
      const eventId = access.event.id;

      const closure = await getClosureRow(eventId);
      if (!closure) {
        return res.status(400).json({
          success: false,
          message: '這段對話還沒有收尾紀錄。按「一起收尾」就能開始。',
          error_code: 'CLOSURE_NOT_STARTED',
        });
      }
      if (closure.status !== 'collecting') {
        return res.status(400).json({
          success: false,
          message: '這次收尾已經完成了。想調整約定可以先重新開啟討論。',
          error_code: 'CLOSURE_ALREADY_FINALIZED',
        });
      }

      const text = String(req.body.commitment).trim();
      const decision = req.body.sharedDecision ? String(req.body.sharedDecision).trim() : null;

      // Read the prior wording before the upsert overwrites it — a re-submit
      // that actually changes the text has to send the partner back to Screen 5
      // (see below), and afterwards there is no way to tell what it used to say.
      const priorText = (await db.query(
        `SELECT text FROM commitments
          WHERE event_id = $1 AND owner_id = $2 AND status IN ('draft','active')`,
        [eventId, userId]
      )).rows[0]?.text ?? null;

      // The partial unique index (event_id, owner_id) WHERE status IN
      // ('draft','active') makes this a clean upsert — a double-tap updates one
      // row instead of creating a second promise.
      const commitment = (await db.query(
        `INSERT INTO commitments (couple_id, event_id, owner_id, text)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (event_id, owner_id) WHERE status IN ('draft','active')
         DO UPDATE SET text = EXCLUDED.text,
                       review_status = 'pending_review',
                       review_note = NULL,
                       reviewed_at = NULL,
                       updated_at = NOW()
         RETURNING *`,
        [access.coupleId, eventId, userId, text]
      )).rows[0];

      if (decision) {
        // First writer proposes; a later edit by the same person keeps it
        // theirs. We never silently overwrite the other partner's proposal.
        await db.query(
          `UPDATE event_closures
              SET shared_decision = $2,
                  shared_decision_by = $3,
                  shared_decision_status = 'proposed',
                  updated_at = NOW()
            WHERE event_id = $1
              AND (shared_decision IS NULL OR shared_decision_by = $3)`,
          [eventId, decision, userId]
        );
      }

      const participant = (await db.query(
        `UPDATE event_closure_participants
            SET status = 'submitted', submitted_at = COALESCE(submitted_at, NOW()), updated_at = NOW()
          WHERE event_id = $1 AND user_id = $2
          RETURNING *`,
        [eventId, userId]
      )).rows[0];

      // The upsert above already reset MY commitment's review_status, but the
      // partner's own reviewed_at lives on a different table. Without clearing
      // it too, they stay terminal and the closure can finalize with them never
      // having seen the revised wording. Only on a real edit — re-sending the
      // same text must not drag them back to Screen 5.
      const textChanged = priorText !== null && priorText !== text;
      if (textChanged && access.partnerId) {
        await db.query(
          `UPDATE event_closure_participants
              SET reviewed_at = NULL, updated_at = NOW()
            WHERE event_id = $1 AND user_id = $2 AND reviewed_at IS NOT NULL`,
          [eventId, access.partnerId]
        );
      }

      logInfo('events.closure.submit', {
        userId, eventId, hasDecision: !!decision, resubmit: !!participant?.reviewed_at,
      });
      logInfo('events.commitment.created', { userId, eventId, commitmentId: commitment.id });

      // Tell the partner there is something to read — but only the first time,
      // so revising your own wording doesn't ping them again.
      const partnerRow = (await getParticipants(eventId)).find((p) => p.user_id === access.partnerId);
      if (partnerRow && partnerRow.status === 'pending') {
        const nickname = await getNickname(userId);
        await notify(
          access.partnerId,
          'event_closure_partner_ready',
          `${nickname} 寫好了下次願意做的事`,
          access.event.title,
          eventId,
          userId
        );
      }

      const finalized = await maybeFinalizeClosure(eventId);
      if (finalized) await afterFinalize(access, userId, finalized);

      const fresh = await assertEventAccess(eventId, userId);
      res.json({ success: true, closure: await loadAndSerialize(fresh, userId) });
    } catch (err) {
      logError('Closure submit failed', { err: err.message, stack: err.stack, eventId: req.params.id });
      res.status(500).json({ success: false, message: '無法送出你的約定，請稍後再試' });
    }
  }
);

// REVIEW — 對方檢視. 可以，就這樣 or 我想調整一下（附建議）. A change request is
// recorded and shown to the owner, who may 採納 or 維持原案. It never blocks
// finalize: you cannot veto someone else's promise, you can only be heard.
router.post(
  '/:id/closure/review',
  [
    param('id').isUUID(),
    body('target').isIn(['commitment', 'decision']),
    body('verdict').isIn(['agree', 'request_change']),
    body('note').optional({ nullable: true }).isString().trim().isLength({ max: 300 }),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const access = await loadClosureContext(req, res);
      if (!access) return;
      const userId = req.user.id;
      const eventId = access.event.id;
      const { target, verdict } = req.body;
      const note = req.body.note ? String(req.body.note).trim() : null;

      const me = (await getParticipants(eventId)).find((p) => p.user_id === userId);
      if (!me || me.status === 'pending') {
        return res.status(400).json({
          success: false,
          message: '先寫下你自己的約定，才看得到對方寫的。',
          error_code: 'CLOSURE_NEEDS_YOUR_PART',
        });
      }

      const reviewStatus = verdict === 'agree' ? 'agreed' : 'change_requested';
      if (target === 'commitment') {
        const updated = await db.query(
          `UPDATE commitments
              SET review_status = $3, review_note = $4, reviewed_at = NOW(), updated_at = NOW()
            WHERE event_id = $1 AND owner_id <> $2 AND status IN ('draft','active')
            RETURNING id`,
          [eventId, userId, reviewStatus, note]
        );
        if (updated.rows.length === 0) {
          return res.status(400).json({
            success: false,
            message: '對方還沒寫下他的約定，等他寫好你就能看到。',
            error_code: 'CLOSURE_NOT_STARTED',
          });
        }
      } else {
        const updated = await db.query(
          `UPDATE event_closures
              SET shared_decision_status = $2, shared_decision_note = $3, updated_at = NOW()
            WHERE event_id = $1 AND shared_decision IS NOT NULL
            RETURNING event_id`,
          [eventId, verdict === 'agree' ? 'agreed' : 'change_requested', note]
        );
        // The WHERE silently matched nothing when there is no shared decision,
        // and reviewed_at was set anyway below — so posting {target:'decision'}
        // on a decision-less closure marked you terminal without ever showing
        // you your partner's commitment. That is precisely what
        // CLOSURE_NEEDS_YOUR_PART exists to prevent, from the other side.
        if (updated.rows.length === 0) {
          return res.status(400).json({
            success: false,
            message: '這次收尾還沒有共同決定可以回應。',
            error_code: 'CLOSURE_NOT_STARTED',
          });
        }
      }

      await db.query(
        `UPDATE event_closure_participants
            SET reviewed_at = NOW(), updated_at = NOW()
          WHERE event_id = $1 AND user_id = $2`,
        [eventId, userId]
      );

      logInfo('events.closure.review', { userId, eventId, target, verdict, hasNote: !!note });

      const finalized = await maybeFinalizeClosure(eventId);
      if (finalized) await afterFinalize(access, userId, finalized);

      const fresh = await assertEventAccess(eventId, userId);
      res.json({ success: true, closure: await loadAndSerialize(fresh, userId) });
    } catch (err) {
      logError('Closure review failed', { err: err.message, stack: err.stack, eventId: req.params.id });
      res.status(500).json({ success: false, message: '無法送出你的回應，請稍後再試' });
    }
  }
);

// SKIP — real state, never a silent no-op, and never voids what the partner
// already wrote. Never charges.
router.post(
  '/:id/closure/skip',
  [param('id').isUUID(), body('reason').optional({ nullable: true }).isString().trim().isLength({ max: 100 })],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const access = await loadClosureContext(req, res);
      if (!access) return;
      const userId = req.user.id;
      const eventId = access.event.id;
      const reason = req.body.reason ? String(req.body.reason).trim() : null;

      await db.query(
        `UPDATE event_closure_participants
            SET status = 'skipped', skip_reason = $3, updated_at = NOW()
          WHERE event_id = $1 AND user_id = $2 AND status = 'pending'`,
        [eventId, userId, reason]
      );
      logInfo('events.closure.skip', { userId, eventId, reason });

      const finalized = await maybeFinalizeClosure(eventId);
      if (finalized) await afterFinalize(access, userId, finalized);

      const fresh = await assertEventAccess(eventId, userId);
      res.json({ success: true, closure: await loadAndSerialize(fresh, userId) });
    } catch (err) {
      logError('Closure skip failed', { err: err.message, stack: err.stack, eventId: req.params.id });
      res.status(500).json({ success: false, message: '無法跳過收尾，請稍後再試' });
    }
  }
);

// CANCEL — 我還想再聊一下. The answer to "one person put us into 收尾 mode and I
// wasn't ready", and the reason one-tap entry is safe. Allowed only while
// NOBODY has submitted, so it can never destroy something a partner wrote.
router.post('/:id/closure/cancel', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await loadClosureContext(req, res);
    if (!access) return;
    const userId = req.user.id;
    const eventId = access.event.id;

    const participants = await getParticipants(eventId);
    if (participants.some((p) => p.status !== 'pending')) {
      return res.status(400).json({
        success: false,
        message: '已經有人寫下約定了，不能取消這次收尾。你可以先跳過，或直接完成。',
        error_code: 'CLOSURE_ALREADY_STARTED',
      });
    }

    await db.transaction(async (client) => {
      await client.query(`DELETE FROM commitments WHERE event_id = $1 AND status = 'draft'`, [eventId]);
      await client.query(`DELETE FROM event_closure_participants WHERE event_id = $1`, [eventId]);
      await client.query(`DELETE FROM event_closures WHERE event_id = $1`, [eventId]);
      await client.query(
        `UPDATE events SET status = 'open', updated_at = NOW() WHERE id = $1 AND status = 'closing'`,
        [eventId]
      );
    });

    logInfo('events.closure.cancel', { userId, eventId });
    res.json({ success: true, message: '好，先繼續聊。想收尾的時候隨時可以再按一次。' });
  } catch (err) {
    logError('Closure cancel failed', { err: err.message, stack: err.stack, eventId: req.params.id });
    res.status(500).json({ success: false, message: '無法回到討論，請稍後再試' });
  }
});

// ABANDON — the same 取消收尾 intent as cancel, but for after someone has
// already written. Cancel refuses then (it would delete a partner's work is the
// fear), and the client used to fall back to POST /events/:id/reopen — which
// also nulls therapy_note, silently destroying the AI summary the couple had
// just earned. 取消收尾 and 重新開啟 are different intents, so they get different
// endpoints: this one drops only the DRAFT commitments (nothing is 'active'
// during closing, so nothing durable is lost) and leaves therapy_note and every
// resolved-* column alone.
router.post('/:id/closure/abandon', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await loadClosureContext(req, res);
    if (!access) return;
    const userId = req.user.id;
    const eventId = access.event.id;

    await db.transaction(async (client) => {
      await client.query(
        `UPDATE event_closures SET status = 'abandoned', updated_at = NOW()
          WHERE event_id = $1 AND status = 'collecting'`,
        [eventId]
      );
      await client.query(`DELETE FROM commitments WHERE event_id = $1 AND status = 'draft'`, [eventId]);
      await client.query(`DELETE FROM event_closure_participants WHERE event_id = $1`, [eventId]);
      await client.query(
        `UPDATE events SET status = 'open', updated_at = NOW() WHERE id = $1 AND status = 'closing'`,
        [eventId]
      );
    });

    logInfo('events.closure.abandon', { userId, eventId });
    res.json({ success: true, message: '好，先繼續聊。想收尾的時候隨時可以再按一次。' });
  } catch (err) {
    logError('Closure abandon failed', { err: err.message, stack: err.stack, eventId: req.params.id });
    res.status(500).json({ success: false, message: '無法回到討論，請稍後再試' });
  }
});

// FINALIZE — Screen 4's 「先這樣完成」 valve. Allowed only when my own part is
// done AND ≥24h have passed, so an impatient partner can't stampede the other
// within a day of asking, but also isn't held for three days.
router.post('/:id/closure/finalize', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await loadClosureContext(req, res);
    if (!access) return;
    const userId = req.user.id;
    const eventId = access.event.id;

    const closure = await getClosureRow(eventId);
    if (!closure) {
      return res.status(400).json({
        success: false,
        message: '這段對話還沒有收尾紀錄。按「一起收尾」就能開始。',
        error_code: 'CLOSURE_NOT_STARTED',
      });
    }

    const me = (await getParticipants(eventId)).find((p) => p.user_id === userId);
    if (!isTerminal(me)) {
      return res.status(400).json({
        success: false,
        message: '先寫下你自己的約定，才能完成這次收尾。',
        error_code: 'CLOSURE_NEEDS_YOUR_PART',
      });
    }

    const unlockAt = new Date(new Date(closure.started_at).getTime() + UNILATERAL_FINALIZE_AFTER_HOURS * 3600 * 1000);
    if (Date.now() < unlockAt.getTime()) {
      return res.status(400).json({
        success: false,
        message: `再給對方一點時間。${unlockAt.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 之後你就可以自己先完成這次收尾。`,
        error_code: 'CLOSURE_FINALIZE_TOO_EARLY',
        unlockAt: unlockAt.toISOString(),
      });
    }

    // The still-pending partner didn't decline, they just weren't here.
    await db.query(
      `UPDATE event_closure_participants
          SET status = 'auto_skipped', updated_at = NOW()
        WHERE event_id = $1 AND status = 'pending'`,
      [eventId]
    );

    const finalized = await maybeFinalizeClosure(eventId, { force: true });
    if (finalized) {
      logInfo('events.closure.finalize', { userId, eventId, commitments: finalized.commitments.length });
      await afterFinalize(access, userId, finalized);
    }

    const fresh = await assertEventAccess(eventId, userId);
    res.json({ success: true, closure: await loadAndSerialize(fresh, userId) });
  } catch (err) {
    logError('Closure finalize failed', { err: err.message, stack: err.stack, eventId: req.params.id });
    res.status(500).json({ success: false, message: '無法完成收尾，請稍後再試' });
  }
});

// INSIGHT — manual retry when the automatic one failed (quota, outage). Either
// partner may trigger it; it is billable because the user asked for it.
router.post('/:id/closure/insight', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await loadClosureContext(req, res, { requireClosing: false });
    if (!access) return;
    const userId = req.user.id;
    const eventId = access.event.id;

    const closure = await getClosureRow(eventId);
    if (!closure) {
      return res.status(400).json({
        success: false,
        message: '這段對話還沒有收尾紀錄。按「一起收尾」就能開始。',
        error_code: 'CLOSURE_NOT_STARTED',
      });
    }
    // Every other closure endpoint answers with the serialized closure and the
    // client re-renders from it wholesale. This one used to answer
    // { success, insight }, so a *successful* retry set closureSummary to
    // undefined and unmounted the whole summary card.
    if (closure.insight?.text) {
      return res.json({ success: true, closure: await loadAndSerialize(access, userId) });
    }

    const { tier, limit } = await resolveAiLimit(userId);
    const usedToday = await countTodayAiUsage(userId);
    const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
    if (!limitCheck.ok) {
      logInfo('events.closure.insight', { userId, eventId, blocked: true, used: usedToday, limit, tier });
      return res.status(limitCheck.status).json(limitCheck.body);
    }

    const insight = await writeClosureInsight(eventId, userId);
    if (!insight) {
      return res.status(503).json({
        success: false,
        message: `${(await getUserCompanion(userId)).name} 這次沒能整理出想法，晚點再試一次就好。你們的約定已經留下來了。`,
        error_code: 'CLOSURE_INSIGHT_UNAVAILABLE',
      });
    }
    res.json({ success: true, closure: await loadAndSerialize(access, userId) });
  } catch (err) {
    logError('Closure insight failed', { err: err.message, stack: err.stack, eventId: req.params.id });
    res.status(500).json({ success: false, message: '無法取得 AI 見解，請稍後再試' });
  }
});

module.exports = router;
// Used by routes/events.js: the 一起收尾 entry point (shared with the retired
// resolve-request/confirm endpoints) and the lazy 72h sweep.
module.exports.enterClosing = enterClosing;
module.exports.sweepOverdueClosures = sweepOverdueClosures;
module.exports.CLOSURE_DEADLINE_HOURS = CLOSURE_DEADLINE_HOURS;
