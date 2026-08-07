// Event notification fan-out: in-app row + LINE push + email mirror.
//
// Extracted out of routes/events.js so routes/event-closure.js can notify a
// partner without requiring the 2500-line events router (which would be a
// require cycle the moment events.js wanted anything back). Every dependency
// here is a leaf module, so this file stays cycle-free.

const db = require('../database/db');
const emailService = require('../services/emailService');
const lineService = require('../services/lineService');
const { logWarn } = require('./logger');

// Emoji prefix for the LINE push, per notification type. Keep in sync with the
// `meta` map in services/emailService.js and the switch in
// src/components/NotificationInbox.tsx — a type missing from any of the three
// silently degrades to a generic 「有新的對話更新」.
const EVENT_PUSH_EMOJI = {
  event_created: '📣',
  event_reply: '💬',
  event_ai_comment: '🧑‍⚕️',
  event_resolve_request: '🤝',
  event_resolved: '✅',
  event_reopened: '🔄',
  // 一起收尾 (migration 083). Tone is invitation, never verdict.
  event_closing_started: '🤝',
  event_closure_partner_ready: '📝',
  event_closure_done: '🌱',
};

async function ensureNotificationsTable() {
  // Mirrors the lazy creation in routes/intimacy-requests.js but adds an
  // optional event_id column so we can wire event notifications to a row.
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        notification_type VARCHAR(50) NOT NULL,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        intimacy_request_id UUID REFERENCES intimacy_requests(id) ON DELETE CASCADE,
        related_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        read_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        priority INTEGER NOT NULL DEFAULT 1
      );
    `);
    await db.query(`
      ALTER TABLE notifications
        ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE CASCADE
    `);
  } catch (err) {
    logWarn('ensureNotificationsTable failed', { err: err.message });
  }
}

async function notify(userId, type, title, content, eventId, relatedUserId, priority = 2, messageContent = null, aiName = null) {
  try {
    await ensureNotificationsTable();
    await db.query(
      `INSERT INTO notifications (user_id, notification_type, title, content, event_id, related_user_id, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, type, title, content, eventId, relatedUserId || null, priority]
    );
  } catch (err) {
    logWarn('Event notification insert failed', { type, err: err.message });
  }

  // Mirror to LINE (no-ops unless the recipient linked + opted in). Carry the
  // actual message content so the push alone tells the story; users only open
  // the app when the text exceeds the excerpt.
  const linePush = [
    `${EVENT_PUSH_EMOJI[type] || '🔔'} Twogether｜${title}`,
    `情境：${content}`,
    messageContent ? `「${lineService.excerpt(messageContent)}」` : null,
    '👉 https://twogether.fun',
  ].filter(Boolean).join('\n');
  lineService.pushToUserIfLinked(db, userId, linePush);

  // Fire-and-forget email mirroring the in-app notification. Skips silently
  // when the recipient is opted out, unconfigured, or unreachable.
  try {
    const recipient = await emailService.getUserEmailIfOptedIn(db, userId);
    if (!recipient) return;
    let senderName = null;
    if (relatedUserId) {
      const r = await db.query(`SELECT nickname FROM users WHERE id = $1`, [relatedUserId]);
      senderName = r.rows[0]?.nickname || null;
    }
    await emailService.sendEventNotification({
      senderName,
      recipientEmail: recipient.email,
      recipientUserId: recipient.id,
      eventTitle: content,
      type,
      messageContent,
      aiName,
    });
  } catch (err) {
    logWarn('Event notification email failed', { type, err: err.message });
  }
}

module.exports = { EVENT_PUSH_EMOJI, ensureNotificationsTable, notify };
