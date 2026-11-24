const db = require('../database/db');
const emailService = require('../services/emailService');
const lineService = require('../services/lineService');
const { logWarn } = require('./logger');

const EVENT_PUSH_EMOJI = {
  event_created: '📣',
  event_reply: '💬',
  event_ai_comment: '🧑‍⚕️',
  event_resolve_request: '🤝',
  event_resolved: '✅',
  event_reopened: '🔄',
  event_nudge: '👋',
  event_closing_started: '🤝',
  event_closure_partner_ready: '📝',
  event_closure_done: '🌱',
  conflict_released: '💌',
  conflict_understood: '💛',
};

async function notify(userId, type, title, content, eventId, relatedUserId, priority = 2, messageContent = null, aiName = null) {
  try {
    await db.query(
      `INSERT INTO notifications (user_id, notification_type, title, content, event_id, related_user_id, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, type, title, content, eventId, relatedUserId || null, priority]
    );
  } catch (err) {
    logWarn('Event notification insert failed', { type, err: err.message });
  }

  const linePush = [
    `${EVENT_PUSH_EMOJI[type] || '🔔'} Twogether｜${title}`,
    `情境：${content}`,
    messageContent ? `「${lineService.excerpt(messageContent)}」` : null,
    eventId ? `👉 https://twogether.fun/?event=${eventId}` : '👉 https://twogether.fun',
  ].filter(Boolean).join('\n');
  lineService.pushToUserIfLinked(db, userId, linePush);

  sendEventEmail({ userId, type, content, relatedUserId, messageContent, aiName }).catch((err) => {
    logWarn('Event notification email failed', { type, err: err.message });
  });
}

async function sendEventEmail({ userId, type, content, relatedUserId, messageContent, aiName }) {
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
}

module.exports = { EVENT_PUSH_EMOJI, notify };
