// Partner-action notifications: the single seam for "let 另一半 know what I did".
//
// Historically each router hand-rolled its own 3-channel notify (in-app INSERT +
// LINE push + email); see routes/events.js `notify()` and routes/wall.js
// `notifyPartner()`. This module consolidates that pattern so every couple-shared
// action can notify the partner with one call and identical delivery semantics:
//
//   notifyPartnerAction({ actorId, type, content })
//
// The in-app `notifications` row is always written (best-effort); LINE and email
// are fire-and-forget mirrors gated by each user's opt-in. Nothing here ever
// throws to the caller — a notification failure must never fail the user's
// action. Unpaired / solo users have no partner, so every call no-ops silently.

const db = require('../database/db');
const lineService = require('./lineService');
const emailService = require('./emailService');
const { logInfo, logWarn } = require('../lib/logger');

// --- Copy catalog ----------------------------------------------------------
// One entry per action type: the emoji + the verb phrase that follows the
// actor's nickname, plus a default body used when the caller has no specific
// detail to pass (e.g. deletes). All copy is Traditional Chinese and specific —
// never a vague "有新通知" (see CLAUDE.md messaging rules). `priority`: 1 low
// (blue dot), 2 medium (yellow), 3 high (red) — matches NotificationInbox.tsx.
const CATALOG = {
  // 記錄時光 — love moments
  love_moment_created: { emoji: '💝', verb: '新增了一則愛的記錄', fallback: '打開 App 看看你們的甜蜜時光' },
  love_moment_updated: { emoji: '📝', verb: '更新了一則愛的記錄', fallback: '打開 App 看看更新後的記錄' },
  love_moment_deleted: { emoji: '🗑️', verb: '刪除了一則愛的記錄', fallback: '一則愛的記錄已被移除' },
  // 週期紀錄 — cycle records (notified normally, per product decision)
  cycle_record_created: { emoji: '🌸', verb: '新增了一筆週期紀錄', fallback: '打開 App 查看週期紀錄' },
  cycle_record_updated: { emoji: '🌸', verb: '更新了週期紀錄', fallback: '打開 App 查看最新的週期紀錄' },
  cycle_record_deleted: { emoji: '🌸', verb: '刪除了一筆週期紀錄', fallback: '一筆週期紀錄已被移除' },
  // 角色扮演 — custom scripts
  custom_script_created: { emoji: '🎭', verb: '建立了一個自訂劇本', fallback: '打開 App 看看新的劇本' },
  custom_script_updated: { emoji: '🎭', verb: '更新了一個自訂劇本', fallback: '打開 App 看看更新後的劇本' },
  custom_script_deleted: { emoji: '🎭', verb: '刪除了一個自訂劇本', fallback: '一個自訂劇本已被移除' },
  // 商店 — custom gifts
  custom_gift_created: { emoji: '🎁', verb: '新增了一個客製禮物', fallback: '打開 App 看看新的禮物' },
  custom_gift_updated: { emoji: '🎁', verb: '更新了一個客製禮物', fallback: '打開 App 看看更新後的禮物' },
  custom_gift_deleted: { emoji: '🎁', verb: '刪除了一個客製禮物', fallback: '一個客製禮物已被移除' },
  // 愛的語言 — assessments & love wishes
  assessment_saved: { emoji: '📋', verb: '更新了關係評估', fallback: '打開 App 看看 TA 的評估結果' },
  love_wish_created: { emoji: '💫', verb: '許下了一個愛的願望', fallback: '打開 App 看看 TA 的願望' },
  love_wish_deleted: { emoji: '💫', verb: '移除了一個愛的願望', fallback: '一個愛的願望已被移除' },
  // 婚姻健檢 — marriage checkups
  checkup_created: { emoji: '💑', verb: '發起了一次婚姻健檢', fallback: '打開 App 一起完成健檢', priority: 2 },
  checkup_response: { emoji: '💑', verb: '回覆了婚姻健檢', fallback: '打開 App 查看 TA 的回覆', priority: 2 },
  // 共同設定 / 個人資料
  couple_settings_updated: { emoji: '⚙️', verb: '更新了你們的共同設定', fallback: '打開 App 查看更新後的設定' },
  profile_updated: { emoji: '👤', verb: '更新了個人資料', fallback: '打開 App 看看 TA 的更新' },
};

// Lazy-ensure the notifications table exists. Mirrors the defensive creation in
// routes/events.js / routes/intimacy-requests.js so this service works even on
// an environment where migration 009 hasn't run. Runs its DDL once per process.
let tableEnsured = false;
async function ensureNotificationsTable() {
  if (tableEnsured) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        notification_type VARCHAR(50) NOT NULL,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        intimacy_request_id UUID,
        related_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        read_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        priority INTEGER NOT NULL DEFAULT 1
      );
    `);
    tableEnsured = true;
  } catch (err) {
    logWarn('ensureNotificationsTable failed', { err: err.message });
  }
}

// Resolve the acting user's partner id via the standard couples CASE idiom.
// Returns null for solo / unpaired couples (user2_id IS NULL) → callers no-op.
async function getPartnerId(userId) {
  if (!userId) return null;
  try {
    const r = await db.query(
      `SELECT CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END AS partner_id
         FROM couples c
        WHERE (c.user1_id = $1 OR c.user2_id = $1) AND c.user2_id IS NOT NULL
        LIMIT 1`,
      [userId]
    );
    return r.rows[0]?.partner_id || null;
  } catch (err) {
    logWarn('getPartnerId failed', { err: err.message });
    return null;
  }
}

async function getNickname(userId) {
  try {
    const r = await db.query(`SELECT nickname FROM users WHERE id = $1`, [userId]);
    return r.rows[0]?.nickname || null;
  } catch {
    return null;
  }
}

// Core entry point. Notifies the actor's partner that `type` happened.
//   actorId  – the user who performed the action (req.user.id)
//   type     – a key in CATALOG
//   content  – optional specific detail (the moment's note, the gift name…);
//              falls back to the catalog's generic line when omitted
//   priority – overrides the catalog/default priority when provided
// Fire-and-forget: safe to call without await at an action site.
async function notifyPartnerAction({ actorId, type, content = null, priority } = {}) {
  const entry = CATALOG[type];
  if (!entry) {
    logWarn('notifyPartnerAction unknown type', { type });
    return;
  }
  try {
    const partnerId = await getPartnerId(actorId);
    if (!partnerId) return; // solo / unpaired → nobody to notify

    const actorNickname = (await getNickname(actorId)) || '你的另一半';
    const title = `${entry.emoji} ${actorNickname}${entry.verb}`;
    const body = (content && String(content).trim()) || entry.fallback;
    const prio = priority || entry.priority || 1;

    // 1) In-app notification row (always written, best-effort).
    await ensureNotificationsTable();
    try {
      await db.query(
        `INSERT INTO notifications (user_id, notification_type, title, content, related_user_id, priority)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [partnerId, type, title.slice(0, 200), body.slice(0, 2000), actorId, prio]
      );
    } catch (err) {
      logWarn('partner_notification.insert_failed', { type, err: err.message });
    }

    // 2) LINE mirror (no-ops unless partner linked + opted in).
    lineService.pushToUserIfLinked(
      db,
      partnerId,
      `${entry.emoji} Twogether｜${actorNickname}${entry.verb}\n「${lineService.excerpt(body)}」\n👉 https://twogether.fun`
    );

    // 3) Email mirror (best-effort, honors per-user opt-out).
    try {
      const recipient = await emailService.getUserEmailIfOptedIn(db, partnerId);
      if (recipient) {
        await emailService.sendPartnerActionNotification({
          senderName: actorNickname,
          recipientEmail: recipient.email,
          recipientUserId: recipient.id,
          title,
          content: body,
        });
      }
    } catch (err) {
      logWarn('partner_notification.email_failed', { type, err: err.message });
    }

    logInfo('partner_notification.sent', { type, actorId, partnerId });
  } catch (err) {
    // Never let a notification failure bubble into the user's action.
    logWarn('notifyPartnerAction failed', { type, err: err.message });
  }
}

module.exports = {
  notifyPartnerAction,
  getPartnerId,
  ensureNotificationsTable,
  CATALOG,
};
