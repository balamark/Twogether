// 專屬諮商空間 (Dedicated counseling space) — the shared channel between a
// couple and their dedicated therapist, plus the page they open DURING a session.
//
// One router, mounted twice by routes/therapists.js:
//   /api/therapists/dedicated/space            — a partner of the couple
//   /api/therapists/clients/:coupleId/space    — the couple's dedicated therapist
// Both resolve to the same couple_therapists link, so the couple and the
// therapist read and write the exact same messages / 下次要談 / session notes.
//
// Everything is scoped to the link (not just the couple): switching therapists
// starts a fresh space, and a revoked therapist loses access immediately.

const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/db');
const { logInfo, logWarn, logError } = require('../lib/logger');
const eventsRoutes = require('./events');

const router = express.Router({ mergeParams: true });

const MESSAGE_MAX = 2000;
const AGENDA_MAX = 300;
const NOTES_MAX = 20000;

// Validation → 400 with the FIRST field's specific message (not a vague 驗證失敗).
function sendValidationError(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({ success: false, error_code: 'VALIDATION_ERROR', message: errors.array()[0].msg });
  return true;
}

// Resolve the active link the caller may use, or respond and return null.
// Therapist path (req.params.coupleId): the caller must be that couple's active,
// approved dedicated therapist. Couple path: the caller's couple must have one.
async function resolveSpace(req, res) {
  const userId = req.user.id;
  if (req.params.coupleId) {
    const r = await db.query(
      `SELECT ct.id AS link_id, ct.couple_id, t.user_id AS therapist_user_id, t.display_name, t.title, t.photo_url
         FROM couple_therapists ct
         JOIN therapists t ON t.id = ct.therapist_id
        WHERE ct.couple_id = $1 AND t.user_id = $2 AND ct.status = 'active' AND t.status = 'approved'`,
      [req.params.coupleId, userId]
    );
    if (r.rows.length === 0) {
      res.status(403).json({
        success: false,
        error_code: 'NOT_DEDICATED_THERAPIST',
        message: '你目前不是這對伴侶的專屬心理師，無法進入諮商空間。若對方重新指定你，就能再次使用。',
      });
      return null;
    }
    return { ...r.rows[0], role: 'therapist', userId };
  }

  const r = await db.query(
    `SELECT ct.id AS link_id, ct.couple_id, t.user_id AS therapist_user_id, t.display_name, t.title, t.photo_url
       FROM couples c
       JOIN couple_therapists ct ON ct.couple_id = c.id AND ct.status = 'active'
       JOIN therapists t ON t.id = ct.therapist_id
      WHERE c.user1_id = $1 OR c.user2_id = $1
      LIMIT 1`,
    [userId]
  );
  if (r.rows.length === 0) {
    res.status(404).json({
      success: false,
      error_code: 'NO_DEDICATED_THERAPIST',
      message: '你們還沒有專屬心理師。從「心理諮商」名錄挑一位諮商師設為專屬，就能開始傳訊息與整理下次要談的事。',
    });
    return null;
  }
  return { ...r.rows[0], role: 'couple', userId };
}

// Everyone in the space except `exceptUserId` — both partners + the therapist.
async function participantIds(space) {
  const c = await db.query(`SELECT user1_id, user2_id FROM couples WHERE id = $1`, [space.couple_id]);
  const ids = c.rows[0] ? [c.rows[0].user1_id, c.rows[0].user2_id] : [];
  ids.push(space.therapist_user_id);
  return [...new Set(ids.filter(Boolean))];
}

// In-app notification. Therapists get a couple-scoped type so the inbox can
// deep-link to THIS couple in 我輔導的伴侶; partners land on 心理諮商.
async function notifyParticipants(space, { title, content }) {
  const ids = await participantIds(space);
  for (const uid of ids) {
    if (uid === space.userId) continue;
    const isTherapist = uid === space.therapist_user_id;
    try {
      await db.query(
        `INSERT INTO notifications (user_id, notification_type, title, content, related_user_id, priority, couple_id)
         VALUES ($1, $2, $3, $4, $5, 2, $6)`,
        [
          uid,
          isTherapist ? 'dedicated_client_message' : 'dedicated_message',
          title,
          (content || '').slice(0, 200),
          space.userId,
          space.couple_id,
        ]
      );
    } catch (err) {
      logWarn('dedicatedSpace.notify failed', { err: err.message });
    }
  }
}

const toMessage = (r, space) => ({
  id: r.id,
  senderId: r.sender_id,
  senderName: r.is_therapist ? space.display_name : (r.sender_nickname || null),
  isTherapist: r.is_therapist === true,
  isMine: r.sender_id === space.userId,
  content: r.content,
  createdAt: r.created_at,
});

const toAgenda = (r, space) => ({
  id: r.id,
  content: r.content,
  source: r.source,
  sourceMessageId: r.source_message_id || null,
  sourceRef: r.source_ref || null,
  status: r.status,
  sessionId: r.session_id || null,
  createdBy: r.created_by || null,
  createdByName: displayName(r.created_by, r.creator_nickname, space),
  createdAt: r.created_at,
});

const toSession = (r, space) => ({
  id: r.id,
  notes: r.notes || '',
  startedAt: r.started_at,
  updatedAt: r.updated_at,
  updatedByName: displayName(r.updated_by, r.updater_nickname, space),
  endedAt: r.ended_at || null,
});

const MESSAGE_SELECT = `
  SELECT m.id, m.sender_id, m.is_therapist, m.content, m.created_at, u.nickname AS sender_nickname
    FROM dedicated_messages m
    LEFT JOIN users u ON u.id = m.sender_id`;

// The display name of whoever created/updated something — the therapist shows
// as their directory name, partners as their nickname.
const displayName = (userId, nickname, space) =>
  (userId && userId === space.therapist_user_id ? space.display_name : nickname || null);

async function getOpenSession(space) {
  const r = await db.query(
    `SELECT s.*, u.nickname AS updater_nickname
       FROM dedicated_sessions s LEFT JOIN users u ON u.id = s.updated_by
      WHERE s.link_id = $1 AND s.ended_at IS NULL`,
    [space.link_id]
  );
  return r.rows[0] || null;
}

// Start (or return) the open session. Concurrent starts race on the partial
// unique index; the loser just reads the winner's row.
async function startSession(space) {
  const existing = await getOpenSession(space);
  if (existing) return { session: existing, started: false };
  try {
    await db.query(
      `INSERT INTO dedicated_sessions (link_id, couple_id, started_by, updated_by) VALUES ($1, $2, $3, $3)`,
      [space.link_id, space.couple_id, space.userId]
    );
  } catch (err) {
    if (err.code !== '23505') throw err;
  }
  return { session: await getOpenSession(space), started: true };
}

// Topics the couple has from 話題建議: every non-dismissed AI topic (picked
// ones first) plus library topics they picked or saved. ref de-dupes 下次要談.
async function loadTopics(coupleId) {
  try {
    const latest = await eventsRoutes.getLatestTherapyTopicsForCouple(coupleId);
    const rank = { selected: 0, saved: 1 };
    const out = [];
    (latest.topics?.topics || []).forEach((t, idx) => {
      const sel = latest.selections?.[idx];
      if (sel?.status === 'dismissed') return;
      out.push({
        ref: `topic:${t.title}`.slice(0, 200),
        kind: 'ai',
        title: t.title,
        why: t.whySuggested || '',
        status: sel?.status || null,
        notes: sel?.notes || null,
      });
    });
    for (const t of latest.library || []) {
      const sel = latest.librarySelections?.[t.id];
      if (sel?.status !== 'selected' && sel?.status !== 'saved') continue;
      out.push({
        ref: `lib:${t.id}`,
        kind: 'library',
        title: t.title,
        why: t.description || '',
        status: sel.status,
        notes: sel.notes || null,
      });
    }
    return out.sort((a, b) => (rank[a.status] ?? 2) - (rank[b.status] ?? 2));
  } catch (err) {
    logWarn('dedicatedSpace.loadTopics failed', { coupleId, err: err.message });
    return [];
  }
}

// GET / — everything the space needs in one round trip: messages, 下次要談,
// the open session, past sessions (with what was covered), 話題建議 and the
// most recent AI 諮商摘要 snapshots. Never triggers AI generation.
router.get('/', async (req, res) => {
  try {
    const space = await resolveSpace(req, res);
    if (!space) return;

    const [messages, agenda, openSession, past, topics, summaries] = await Promise.all([
      db.query(`${MESSAGE_SELECT} WHERE m.link_id = $1 ORDER BY m.created_at DESC LIMIT 200`, [space.link_id]),
      db.query(
        `SELECT a.*, u.nickname AS creator_nickname
           FROM dedicated_agenda_items a LEFT JOIN users u ON u.id = a.created_by
          WHERE a.link_id = $1
            AND (a.status = 'open'
                 OR a.session_id IS NULL
                 OR a.session_id IN (SELECT id FROM dedicated_sessions WHERE link_id = $1 AND ended_at IS NULL))
          ORDER BY a.created_at ASC`,
        [space.link_id]
      ),
      getOpenSession(space),
      db.query(
        `SELECT s.*, u.nickname AS updater_nickname,
                COALESCE(
                  (SELECT json_agg(a.content ORDER BY a.created_at)
                     FROM dedicated_agenda_items a WHERE a.session_id = s.id AND a.status = 'discussed'),
                  '[]'::json
                ) AS discussed
           FROM dedicated_sessions s LEFT JOIN users u ON u.id = s.updated_by
          WHERE s.link_id = $1 AND s.ended_at IS NOT NULL
          ORDER BY s.started_at DESC LIMIT 30`,
        [space.link_id]
      ),
      loadTopics(space.couple_id),
      eventsRoutes.listTherapySummariesForCouple(space.couple_id).catch(() => []),
    ]);

    res.json({
      success: true,
      role: space.role,
      therapist: { displayName: space.display_name, title: space.title || null, photoUrl: space.photo_url || null },
      messages: messages.rows.reverse().map((r) => toMessage(r, space)),
      agenda: agenda.rows.map((r) => toAgenda(r, space)),
      session: openSession ? toSession(openSession, space) : null,
      pastSessions: past.rows.map((r) => ({ ...toSession(r, space), discussed: r.discussed || [] })),
      sessionCount: past.rows.length + (openSession ? 1 : 0),
      topics,
      summaries: summaries.slice(0, 5),
    });
  } catch (error) {
    logError('dedicatedSpace.overview failed', { userId: req.user?.id, err: error.message });
    res.status(500).json({ success: false, message: '無法載入諮商空間，請重新整理頁面後再試' });
  }
});

// POST /messages — post to the shared thread; notify the other two.
router.post('/messages', [
  body('content').isString().trim().isLength({ min: 1, max: MESSAGE_MAX }).withMessage(`訊息需在 1-${MESSAGE_MAX} 字之間`),
], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const space = await resolveSpace(req, res);
    if (!space) return;
    const content = req.body.content.trim();
    const inserted = await db.query(
      `INSERT INTO dedicated_messages (link_id, couple_id, sender_id, is_therapist, content)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [space.link_id, space.couple_id, space.userId, space.role === 'therapist', content]
    );
    const row = await db.query(`${MESSAGE_SELECT} WHERE m.id = $1`, [inserted.rows[0].id]);
    logInfo('dedicatedSpace.message', { userId: space.userId, coupleId: space.couple_id, role: space.role, length: content.length });

    notifyParticipants(space, {
      title: space.role === 'therapist' ? '專屬心理師傳了訊息給你們' : '諮商空間有新訊息',
      content,
    }).catch(() => {});

    res.status(201).json({ success: true, message: toMessage(row.rows[0], space) });
  } catch (error) {
    logError('dedicatedSpace.message failed', { userId: req.user?.id, err: error.message });
    res.status(500).json({ success: false, message: '訊息沒有送出，請檢查網路後再傳一次' });
  }
});

// POST /agenda — add a 下次要談 item (by hand, from a message, or from a topic).
// Re-adding the same message/topic while it's still open returns the existing
// item (duplicate: true) instead of a second copy.
router.post('/agenda', [
  body('content').isString().trim().isLength({ min: 1, max: AGENDA_MAX }).withMessage(`要談的事需在 1-${AGENDA_MAX} 字之間`),
  body('source').optional().isIn(['manual', 'message', 'topic']).withMessage('來源無效'),
  body('sourceMessageId').optional({ nullable: true }).isUUID().withMessage('訊息 id 無效'),
  body('sourceRef').optional({ nullable: true }).isString().isLength({ max: 200 }),
], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const space = await resolveSpace(req, res);
    if (!space) return;
    const source = req.body.source || 'manual';
    const sourceMessageId = source === 'message' ? req.body.sourceMessageId || null : null;
    const sourceRef = source === 'topic' ? req.body.sourceRef || null : null;

    if (sourceMessageId) {
      const m = await db.query(`SELECT 1 FROM dedicated_messages WHERE id = $1 AND link_id = $2`, [sourceMessageId, space.link_id]);
      if (m.rows.length === 0) {
        return res.status(404).json({ success: false, error_code: 'MESSAGE_NOT_FOUND', message: '找不到這則訊息，可能已被移除。請重新整理後再試' });
      }
    }
    if (sourceMessageId || sourceRef) {
      const dup = await db.query(
        `SELECT * FROM dedicated_agenda_items
          WHERE link_id = $1 AND status = 'open'
            AND (($2::uuid IS NOT NULL AND source_message_id = $2) OR ($3::text IS NOT NULL AND source_ref = $3))
          LIMIT 1`,
        [space.link_id, sourceMessageId, sourceRef]
      );
      if (dup.rows.length > 0) {
        return res.json({ success: true, duplicate: true, message: '這件事已經在「下次要談」裡了', item: toAgenda(dup.rows[0], space) });
      }
    }

    const r = await db.query(
      `INSERT INTO dedicated_agenda_items (link_id, couple_id, content, source, source_message_id, source_ref, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [space.link_id, space.couple_id, req.body.content.trim(), source, sourceMessageId, sourceRef, space.userId]
    );
    logInfo('dedicatedSpace.agenda.add', { userId: space.userId, coupleId: space.couple_id, role: space.role, source });
    res.status(201).json({ success: true, item: toAgenda(r.rows[0], space) });
  } catch (error) {
    logError('dedicatedSpace.agenda.add failed', { userId: req.user?.id, err: error.message });
    res.status(500).json({ success: false, message: '沒能加入「下次要談」，請稍後再試一次' });
  }
});

// PATCH /agenda/:itemId — check off (discussed) / reopen / edit text. Checking
// off during an open session stamps it to that session so the record shows it.
router.patch('/agenda/:itemId', [
  body('status').optional().isIn(['open', 'discussed']).withMessage('狀態無效'),
  body('content').optional().isString().trim().isLength({ min: 1, max: AGENDA_MAX }).withMessage(`要談的事需在 1-${AGENDA_MAX} 字之間`),
], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const space = await resolveSpace(req, res);
    if (!space) return;
    const open = req.body.status === 'discussed' ? await getOpenSession(space) : null;
    const r = await db.query(
      `UPDATE dedicated_agenda_items
          SET status = COALESCE($3, status),
              content = COALESCE($4, content),
              session_id = CASE WHEN $3 = 'discussed' THEN $5::uuid WHEN $3 = 'open' THEN NULL ELSE session_id END,
              updated_at = NOW()
        WHERE id = $1 AND link_id = $2
        RETURNING *`,
      [req.params.itemId, space.link_id, req.body.status || null, req.body.content?.trim() || null, open?.id || null]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, error_code: 'AGENDA_NOT_FOUND', message: '找不到這個項目，可能已被另一位刪除。請重新整理後再試' });
    }
    logInfo('dedicatedSpace.agenda.update', { userId: space.userId, coupleId: space.couple_id, status: req.body.status || null });
    res.json({ success: true, item: toAgenda(r.rows[0], space) });
  } catch (error) {
    logError('dedicatedSpace.agenda.update failed', { userId: req.user?.id, err: error.message });
    res.status(500).json({ success: false, message: '更新失敗，請稍後再試一次' });
  }
});

router.delete('/agenda/:itemId', async (req, res) => {
  try {
    const space = await resolveSpace(req, res);
    if (!space) return;
    const r = await db.query(`DELETE FROM dedicated_agenda_items WHERE id = $1 AND link_id = $2 RETURNING id`, [req.params.itemId, space.link_id]);
    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, error_code: 'AGENDA_NOT_FOUND', message: '找不到這個項目，可能已被另一位刪除。請重新整理後再試' });
    }
    logInfo('dedicatedSpace.agenda.delete', { userId: space.userId, coupleId: space.couple_id });
    res.json({ success: true });
  } catch (error) {
    logError('dedicatedSpace.agenda.delete failed', { userId: req.user?.id, err: error.message });
    res.status(500).json({ success: false, message: '刪除失敗，請稍後再試一次' });
  }
});

// POST /session — start today's session (idempotent: returns the open one).
router.post('/session', async (req, res) => {
  try {
    const space = await resolveSpace(req, res);
    if (!space) return;
    const { session, started } = await startSession(space);
    if (started) logInfo('dedicatedSpace.session.start', { userId: space.userId, coupleId: space.couple_id, role: space.role });
    res.status(started ? 201 : 200).json({ success: true, session: toSession(session, space) });
  } catch (error) {
    logError('dedicatedSpace.session.start failed', { userId: req.user?.id, err: error.message });
    res.status(500).json({ success: false, message: '沒能開始這次諮商紀錄，請稍後再試一次' });
  }
});

// PATCH /session — save the open session's 本次摘要 (last write wins; the UI
// shows who saved last so a parallel edit is visible).
router.patch('/session', [
  body('notes').isString().isLength({ max: NOTES_MAX }).withMessage(`摘要最多 ${NOTES_MAX} 字，請精簡後再存`),
], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const space = await resolveSpace(req, res);
    if (!space) return;
    const r = await db.query(
      `UPDATE dedicated_sessions SET notes = $2, updated_by = $3, updated_at = NOW()
        WHERE link_id = $1 AND ended_at IS NULL RETURNING id`,
      [space.link_id, req.body.notes, space.userId]
    );
    if (r.rows.length === 0) {
      return res.status(409).json({
        success: false,
        error_code: 'NO_OPEN_SESSION',
        message: '這次諮商已經結束了，摘要沒有存到。請按「開始今天的諮商」開一份新紀錄，再把內容貼上',
      });
    }
    logInfo('dedicatedSpace.session.notes', { userId: space.userId, coupleId: space.couple_id, role: space.role, length: req.body.notes.length });
    res.json({ success: true, session: toSession(await getOpenSession(space), space) });
  } catch (error) {
    logError('dedicatedSpace.session.notes failed', { userId: req.user?.id, err: error.message });
    res.status(500).json({ success: false, message: '摘要沒有存到，請檢查網路後再試一次（內容還留在畫面上）' });
  }
});

// POST /session/append — turn a message into a line of 本次摘要. Starts
// today's session if none is open (the UI says so) so one tap always works.
router.post('/session/append', [
  body('messageId').isUUID().withMessage('訊息 id 無效'),
], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const space = await resolveSpace(req, res);
    if (!space) return;
    const m = await db.query(`${MESSAGE_SELECT} WHERE m.id = $1 AND m.link_id = $2`, [req.body.messageId, space.link_id]);
    if (m.rows.length === 0) {
      return res.status(404).json({ success: false, error_code: 'MESSAGE_NOT_FOUND', message: '找不到這則訊息，可能已被移除。請重新整理後再試' });
    }
    const msg = toMessage(m.rows[0], space);
    const { session, started } = await startSession(space);
    const line = `• ${msg.content.replace(/\s*\n\s*/g, ' ')}${msg.senderName ? `（${msg.senderName}）` : ''}`;
    const notes = session.notes ? `${session.notes.replace(/\s+$/, '')}\n${line}` : line;
    if (notes.length > NOTES_MAX) {
      return res.status(400).json({ success: false, error_code: 'NOTES_TOO_LONG', message: `本次摘要已接近 ${NOTES_MAX} 字上限，請先精簡摘要再加入訊息` });
    }
    await db.query(
      `UPDATE dedicated_sessions SET notes = $2, updated_by = $3, updated_at = NOW() WHERE id = $1`,
      [session.id, notes, space.userId]
    );
    logInfo('dedicatedSpace.session.append', { userId: space.userId, coupleId: space.couple_id, role: space.role, startedSession: started });
    res.json({ success: true, startedSession: started, session: toSession(await getOpenSession(space), space) });
  } catch (error) {
    logError('dedicatedSpace.session.append failed', { userId: req.user?.id, err: error.message });
    res.status(500).json({ success: false, message: '沒能加進摘要，請稍後再試一次' });
  }
});

// POST /session/end — close the open session. Checked-off items stay in its
// record; anything still open carries over to the next 下次要談.
router.post('/session/end', async (req, res) => {
  try {
    const space = await resolveSpace(req, res);
    if (!space) return;
    const r = await db.query(
      `UPDATE dedicated_sessions SET ended_at = NOW(), updated_at = NOW()
        WHERE link_id = $1 AND ended_at IS NULL RETURNING id`,
      [space.link_id]
    );
    if (r.rows.length === 0) {
      return res.status(409).json({ success: false, error_code: 'NO_OPEN_SESSION', message: '目前沒有進行中的諮商紀錄，可能已被另一位結束。請重新整理看看' });
    }
    // Items checked off before the session was opened belong to this one too.
    await db.query(
      `UPDATE dedicated_agenda_items SET session_id = $2
        WHERE link_id = $1 AND status = 'discussed' AND session_id IS NULL`,
      [space.link_id, r.rows[0].id]
    );
    logInfo('dedicatedSpace.session.end', { userId: space.userId, coupleId: space.couple_id, role: space.role });
    notifyParticipants(space, { title: '這次諮商的紀錄已整理好', content: '本次摘要與談過的項目已存進「過往紀錄」，沒談完的會留在下次要談' }).catch(() => {});
    res.json({ success: true });
  } catch (error) {
    logError('dedicatedSpace.session.end failed', { userId: req.user?.id, err: error.message });
    res.status(500).json({ success: false, message: '沒能結束這次諮商，請稍後再試一次' });
  }
});

module.exports = router;
