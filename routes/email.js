const express = require('express');
const db = require('../database/db');
const { logInfo, logWarn, logError } = require('../lib/logger');
const { renderEmailPage } = require('../lib/emailPage');
const { verifyUnsubscribeToken } = require('../lib/emailUnsubscribe');

const router = express.Router();

// Turn off the recipient's notification emails. Shared by both verbs below.
// Returns the user's nickname on success, or null when the token doesn't
// resolve to a real user.
async function optOut(token, via) {
  const userId = verifyUnsubscribeToken(token);
  if (!userId) {
    logWarn('Unsubscribe rejected: invalid token', { kind: 'email_unsubscribe', via });
    return null;
  }
  const result = await db.query(
    `UPDATE users SET email_notifications_enabled = false
      WHERE id = $1
      RETURNING nickname`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) {
    logWarn('Unsubscribe rejected: user not found', { kind: 'email_unsubscribe', via, userId });
    return null;
  }
  logInfo('Email notifications disabled via unsubscribe link', { kind: 'email_unsubscribe', via, userId });
  return row.nickname || '';
}

// POST /api/email/unsubscribe?t=... — the RFC 8058 one-click target. Mail
// clients fire this in the background with no session and expect a bare 200;
// nothing here may redirect or ask for confirmation.
router.post('/unsubscribe', async (req, res) => {
  const token = typeof req.query.t === 'string' ? req.query.t : (req.body && req.body.t);
  try {
    const ok = await optOut(token, 'one_click');
    // Always 200: a mail client retrying a stale link shouldn't surface an
    // error to the user, and the outcome is already in the logs.
    return res.status(200).type('text/plain').send(ok === null ? 'invalid token' : 'unsubscribed');
  } catch (error) {
    logError('One-click unsubscribe failed', { kind: 'email_unsubscribe', err: error.message });
    return res.status(500).type('text/plain').send('error');
  }
});

// GET /api/email/unsubscribe?t=... — the human-visible version, linked from
// the mail footer. Renders the same page shell as the verification links.
router.get('/unsubscribe', async (req, res) => {
  const token = typeof req.query.t === 'string' ? req.query.t : '';
  try {
    const nickname = await optOut(token, 'link');
    if (nickname === null) {
      return renderEmailPage(res, {
        ok: false,
        status: 400,
        title: '無法退訂',
        message: '這個退訂連結無效或已失效。你也可以登入後到「設定 → 通知」直接關閉 Email 通知。',
        body: '<a class="btn" href="/">回到 Twogether</a>',
      });
    }
    return renderEmailPage(res, {
      ok: true,
      emoji: '📭',
      title: '已為你關閉通知信',
      message: '之後不會再收到伴侶動態的通知信。帳號安全相關的信件（驗證、重設密碼、購買收據）仍會寄出。想再打開的話，登入後到「設定 → 通知」隨時可以改回來。',
      body: '<a class="btn" href="/">回到 Twogether</a>',
    });
  } catch (error) {
    logError('Unsubscribe page failed', { kind: 'email_unsubscribe', err: error.message });
    return renderEmailPage(res, {
      ok: false,
      status: 500,
      title: '退訂失敗',
      message: '處理退訂時發生錯誤，請稍後再試，或登入後到「設定 → 通知」關閉 Email 通知。',
      body: '<a class="btn" href="/">回到 Twogether</a>',
    });
  }
});

module.exports = router;
