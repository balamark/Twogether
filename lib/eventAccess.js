// Shared access checks and serializers for anything that touches an 事件.
//
// Extracted from routes/events.js so routes/event-closure.js (and later the
// Playbook / follow-up routers) can authorize a request without requiring the
// events router itself. Authorization for these tables is entirely
// application-level — the DB has RLS enabled with no policies — so
// assertEventAccess is the single gate every event endpoint must pass through.

const { validationResult } = require('express-validator');
const db = require('../database/db');

// The caller's paired couple, or null when solo. `user2_id IS NOT NULL` is what
// distinguishes a real pairing from a half-created invite row.
async function getCoupleForUser(userId) {
  const result = await db.query(
    `SELECT c.id AS couple_id,
            CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END AS partner_id
     FROM couples c
     WHERE (c.user1_id = $1 OR c.user2_id = $1) AND c.user2_id IS NOT NULL`,
    [userId]
  );
  return result.rows[0] || null;
}

// Returns null when the event does not exist OR the caller is not in its
// couple — callers deliberately collapse both into one 404 so an outsider
// cannot probe for event ids.
async function assertEventAccess(eventId, userId) {
  const result = await db.query(
    `SELECT e.*,
            CASE WHEN c.user1_id = $2 THEN c.user2_id ELSE c.user1_id END AS partner_id
     FROM events e
     JOIN couples c ON c.id = e.couple_id
     WHERE e.id = $1
       AND (c.user1_id = $2 OR c.user2_id = $2)`,
    [eventId, userId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return { event: row, coupleId: row.couple_id, partnerId: row.partner_id };
}

function serializeEvent(row, extras = {}) {
  return {
    id: row.id,
    couple_id: row.couple_id,
    created_by: row.created_by,
    title: row.title,
    summary: row.summary,
    emotions: row.emotions || [],
    tags: row.tags || [],
    toxicity_flags: row.toxicity_flags || [],
    versions: {
      neutral: row.ai_neutral,
      firm: row.ai_firm,
      warm: row.ai_warm,
    },
    selected_version: row.selected_version,
    is_private: row.is_private,
    content_edited_at: row.content_edited_at || null,
    public_status: row.public_status || 'private',
    public_title: row.public_title || null,
    status: row.status,
    translation_enabled: row.translation_enabled === true,
    therapy_note: row.therapy_note || null,
    resolve_requested_by: row.resolve_requested_by,
    resolve_requested_at: row.resolve_requested_at,
    resolved_at: row.resolved_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    // Only the list query computes this. Emitting `false` for every other
    // caller would be a lie the 輪到你了 chip could act on, so stay absent.
    ...(row.closure_pending_me === undefined
      ? {}
      : { closure_pending_me: row.closure_pending_me === true }),
    ...extras,
  };
}

function serializeMessage(row) {
  return {
    id: row.id,
    event_id: row.event_id,
    sender_id: row.sender_id,
    content: row.content,
    is_ai: row.is_ai === true,
    is_therapist: row.is_therapist === true,
    ai_therapist: row.ai_therapist || null,
    facilitation: row.facilitation || null,
    created_at: row.created_at,
    read_at: row.read_at,
    edited_at: row.edited_at || null,
  };
}

// `errorCode` is optional but matters: CLAUDE.md requires the frontend to be
// able to branch on an expected validation state (too-short commitment) and
// render it as a `warning` with a next step rather than a red failure. Without
// a code every validation rejection collapses into the generic error toast.
function sendValidationError(req, res, errorCode = null) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Prefer a validator's own .withMessage() text so the user learns what is
    // actually wrong (e.g. an over-length reply) instead of a bare "驗證失敗".
    const list = errors.array();
    const specific = list.find((e) => e.msg && e.msg !== 'Invalid value');
    res.status(400).json({
      success: false,
      message: specific ? specific.msg : '驗證失敗',
      errors: list,
      ...(errorCode ? { error_code: errorCode } : {}),
    });
    return true;
  }
  return false;
}

module.exports = {
  getCoupleForUser,
  assertEventAccess,
  serializeEvent,
  serializeMessage,
  sendValidationError,
};
