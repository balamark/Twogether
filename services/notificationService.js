const db = require('../database/db');
const lineService = require('./lineService');
const emailService = require('./emailService');
const { logInfo, logWarn } = require('../lib/logger');

const CATALOG = {
  love_moment_created: { emoji: '💝', verb: '新增了一則愛的記錄', fallback: '打開 App 看看你們的甜蜜時光' },
  love_moment_updated: { emoji: '📝', verb: '更新了一則愛的記錄', fallback: '打開 App 看看更新後的記錄' },
  love_moment_deleted: { emoji: '🗑️', verb: '刪除了一則愛的記錄', fallback: '一則愛的記錄已被移除' },
  cycle_record_created: { emoji: '🌸', verb: '新增了一筆週期紀錄', fallback: '打開 App 查看週期紀錄' },
  cycle_record_updated: { emoji: '🌸', verb: '更新了週期紀錄', fallback: '打開 App 查看最新的週期紀錄' },
  cycle_record_deleted: { emoji: '🌸', verb: '刪除了一筆週期紀錄', fallback: '一筆週期紀錄已被移除' },
  custom_script_created: { emoji: '🎭', verb: '建立了一個自訂劇本', fallback: '打開 App 看看新的劇本' },
  custom_script_updated: { emoji: '🎭', verb: '更新了一個自訂劇本', fallback: '打開 App 看看更新後的劇本' },
  custom_script_deleted: { emoji: '🎭', verb: '刪除了一個自訂劇本', fallback: '一個自訂劇本已被移除' },
  negotiation_accepted: { emoji: '💬', verb: '願意和你一起討論替代方案', fallback: '打開 App，一起提出彼此都喜歡的方式', priority: 2 },
  negotiation_later: { emoji: '🕊️', verb: '想晚一點再討論替代方案', fallback: '對方記得這件事，等彼此都方便時再聊就好' },
  negotiation_declined: { emoji: '🕊️', verb: '目前還不想討論替代方案', fallback: '謝謝你願意開口。這是對方此刻的步調，你們的共同方案清單會一直保留著' },
  alt_plan_proposed: { emoji: '🤝', verb: '提出了一個替代方案', fallback: '打開 App 看看，認可、修改或先放著都可以' },
  alt_plan_updated: { emoji: '🤝', verb: '修改了一個替代方案', fallback: '內容有變動，請看過新內容再決定是否認可' },
  alt_plan_approved: { emoji: '✅', verb: '認可了一個替代方案', fallback: '打開 App 查看你們的共同方案清單' },
  alt_plan_disabled: { emoji: '⏸️', verb: '停用了一個替代方案', fallback: '方案已移出共同清單，隨時可以再一起討論' },
  alt_plan_reactivated: { emoji: '🤝', verb: '重新啟用了一個替代方案', fallback: '需要你們再次確認，才會回到共同清單' },
  custom_gift_created: { emoji: '🎁', verb: '新增了一個客製禮物', fallback: '打開 App 看看新的禮物' },
  custom_gift_updated: { emoji: '🎁', verb: '更新了一個客製禮物', fallback: '打開 App 看看更新後的禮物' },
  custom_gift_deleted: { emoji: '🎁', verb: '刪除了一個客製禮物', fallback: '一個客製禮物已被移除' },
  deposit_thanks: { emoji: '💝', verb: '為你存入了一筆感謝存款', fallback: '打開「感情存款」看看 TA 謝謝你什麼' },
  deposit_requested: { emoji: '🙋', verb: '申請了一筆存款，等你確認', fallback: '打開「感情存款」確認或婉拒', priority: 2 },
  deposit_confirmed: { emoji: '✅', verb: '確認了你的存款申請', fallback: '感情存款已存入你的帳戶' },
  deposit_declined: { emoji: '🕊️', verb: '婉拒了你的存款申請', fallback: '可以聊聊這件事對彼此的意義' },
  redemption_requested: { emoji: '🎁', verb: '想用感情存款兌換你的禮物，等你同意', fallback: '打開「感情存款」同意或婉拒', priority: 2 },
  redemption_approved: { emoji: '🎁', verb: '同意了你的禮物兌換', fallback: '感情存款已扣除，記得一起兌現這份心意' },
  redemption_declined: { emoji: '🕊️', verb: '婉拒了你的禮物兌換', fallback: '感情存款沒有被扣除，可以換個時間或換個禮物再試' },
  assessment_saved: { emoji: '📋', verb: '更新了關係評估', fallback: '打開 App 看看 TA 的評估結果' },
  love_wish_created: { emoji: '💫', verb: '許下了一個愛的願望', fallback: '打開 App 看看 TA 的願望' },
  love_wish_deleted: { emoji: '💫', verb: '移除了一個愛的願望', fallback: '一個愛的願望已被移除' },
  checkup_created: { emoji: '💑', verb: '發起了一次婚姻健檢', fallback: '打開 App 一起完成健檢', priority: 2 },
  checkup_response: { emoji: '💑', verb: '回覆了婚姻健檢', fallback: '打開 App 查看 TA 的回覆', priority: 2 },
  deep_dive_shared: { emoji: '💌', verb: '想讓你更了解 TA 的感受', fallback: '打開 App，先花點時間讀完 TA 想分享的', priority: 2 },
  deep_dive_partner_responded: { emoji: '💛', verb: '回應了你分享的感受', fallback: '打開 App 看看 TA 的理解與回應', priority: 2 },
  couple_settings_updated: { emoji: '⚙️', verb: '更新了你們的共同設定', fallback: '打開 App 查看更新後的設定' },
  profile_updated: { emoji: '👤', verb: '更新了個人資料', fallback: '打開 App 看看 TA 的更新' },
};

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

async function notifyPartnerAction({ actorId, type, content = null, priority, targetId = null } = {}) {
  const entry = CATALOG[type];
  if (!entry) {
    logWarn('notifyPartnerAction unknown type', { type });
    return;
  }
  try {
    const partnerId = await getPartnerId(actorId);
    if (!partnerId) return;

    const actorNickname = (await getNickname(actorId)) || '你的另一半';
    const title = `${entry.emoji} ${actorNickname}${entry.verb}`;
    const body = (content && String(content).trim()) || entry.fallback;
    const prio = priority || entry.priority || 1;

    try {
      await db.query(
        `INSERT INTO notifications (user_id, notification_type, title, content, related_user_id, priority, target_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [partnerId, type, title.slice(0, 200), body.slice(0, 2000), actorId, prio, targetId ? String(targetId) : null]
      );
    } catch (err) {
      logWarn('partner_notification.insert_failed', { type, err: err.message });
    }

    lineService.pushToUserIfLinked(
      db,
      partnerId,
      `${entry.emoji} Twogether｜${actorNickname}${entry.verb}\n「${lineService.excerpt(body)}」\n👉 https://twogether.fun`
    );

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
    logWarn('notifyPartnerAction failed', { type, err: err.message });
  }
}

module.exports = {
  notifyPartnerAction,
  getPartnerId,
  CATALOG,
};
