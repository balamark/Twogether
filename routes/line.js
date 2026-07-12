// LINE 通知整合 routes: the (unauthenticated, signature-verified) webhook that
// binds a user's LINE account via a one-time code, plus the authenticated
// endpoints Settings uses to link / check status / toggle / unlink.
//
// Observability: every path logs a structured `line.*` event (see memory:
// log every new feature) so binding + delivery are diagnosable in gcloud.

const express = require('express');
const crypto = require('crypto');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const lineService = require('../services/lineService');
const { logInfo, logWarn, logError } = require('../lib/logger');

const router = express.Router();

const LINK_CODE_TTL_MIN = 15;
const OA_ADD_URL = process.env.LINE_OA_ADD_URL || 'https://line.me/R/ti/p/@twogether';

// Unambiguous code alphabet (no 0/O/1/I) so users can type it reliably.
function makeLinkCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) s += alphabet[bytes[i] % alphabet.length];
  return s;
}

// ---------------------------------------------------------------------------
// Webhook (no auth; verified by X-Line-Signature). Mounted with a raw body
// parser in server.js so the signature can be checked against the exact bytes.
// ---------------------------------------------------------------------------
async function webhookHandler(req, res) {
  const signature = req.get('X-Line-Signature');
  const raw = req.rawBody || (Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {})));
  if (!lineService.verifySignature(raw, signature)) {
    logWarn('line.webhook.bad_signature', {});
    return res.status(401).send('bad signature');
  }
  // Respond 200 immediately; LINE retries on non-2xx.
  res.status(200).end();

  let payload;
  try {
    payload = typeof req.body === 'object' && !Buffer.isBuffer(req.body)
      ? req.body
      : JSON.parse(raw.toString('utf8') || '{}');
  } catch {
    payload = {};
  }
  const events = Array.isArray(payload.events) ? payload.events : [];
  logInfo('line.webhook.received', { events: events.length });

  for (const ev of events) {
    try {
      const lineUserId = ev.source && ev.source.userId;
      if (ev.type === 'follow') {
        logInfo('line.webhook.follow', { hasUser: !!lineUserId });
        if (ev.replyToken) {
          await lineService.replyMessage(
            ev.replyToken,
            '歡迎加入 Twogether 通知！\n請回到 App 的「設定 → LINE 通知」取得綁定碼，把它傳給我就能開始接收通知。'
          );
        }
        continue;
      }
      if (ev.type === 'message' && ev.message && ev.message.type === 'text' && lineUserId) {
        const text = (ev.message.text || '').trim().toUpperCase();
        const code = text.replace(/\s+/g, '');
        const found = await db.query(
          `SELECT code, user_id FROM line_link_codes
            WHERE code = $1 AND used_at IS NULL AND expires_at > NOW()`,
          [code]
        );
        if (found.rows.length === 0) {
          logInfo('line.webhook.code_miss', { codeLen: code.length });
          if (ev.replyToken) {
            await lineService.replyMessage(
              ev.replyToken,
              '這組綁定碼無效或已過期。請到 App 的「設定 → LINE 通知」重新取得綁定碼。'
            );
          }
          continue;
        }
        const userId = found.rows[0].user_id;
        // Bind: clear this LINE id from any other user, then set it here.
        await db.query(`UPDATE users SET line_user_id = NULL WHERE line_user_id = $1`, [lineUserId]);
        await db.query(
          `UPDATE users SET line_user_id = $1, line_notifications_enabled = TRUE WHERE id = $2`,
          [lineUserId, userId]
        );
        await db.query(`UPDATE line_link_codes SET used_at = NOW() WHERE code = $1`, [code]);
        logInfo('line.webhook.bound', { userId });
        if (ev.replyToken) {
          await lineService.replyMessage(
            ev.replyToken,
            '✅ 綁定成功！之後伴侶的重要通知（事件回覆、親密邀請等）都會傳到這裡。\n想關閉可到「設定 → LINE 通知」。'
          );
        }
      }
    } catch (err) {
      logError('line.webhook.event_error', { err: err.message, stack: err.stack });
    }
  }
}

// ---------------------------------------------------------------------------
// Authenticated: linking + settings
// ---------------------------------------------------------------------------

// Issue a fresh binding code for the current user. Invalidates their old codes.
router.post('/link-code', authenticateToken, async (req, res) => {
  try {
    if (!lineService.isConfigured()) {
      return res.status(503).json({ success: false, message: 'LINE 通知尚未啟用', error_code: 'LINE_NOT_CONFIGURED' });
    }
    await db.query(`UPDATE line_link_codes SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`, [req.user.id]);
    const code = makeLinkCode();
    await db.query(
      `INSERT INTO line_link_codes (code, user_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '${LINK_CODE_TTL_MIN} minutes')`,
      [code, req.user.id]
    );
    logInfo('line.linkcode.issued', { userId: req.user.id });
    res.json({ success: true, code, ttlMinutes: LINK_CODE_TTL_MIN, addFriendUrl: OA_ADD_URL });
  } catch (err) {
    logError('line.linkcode.failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '無法產生綁定碼，請稍後再試' });
  }
});

router.get('/status', authenticateToken, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT line_user_id, line_notifications_enabled FROM users WHERE id = $1`,
      [req.user.id]
    );
    const row = r.rows[0] || {};
    res.json({
      success: true,
      configured: lineService.isConfigured(),
      linked: !!row.line_user_id,
      notificationsEnabled: row.line_notifications_enabled !== false,
    });
  } catch (err) {
    logError('line.status.failed', { err: err.message });
    res.status(500).json({ success: false, message: '無法取得 LINE 綁定狀態' });
  }
});

router.put('/notifications', authenticateToken, async (req, res) => {
  try {
    const enabled = !!req.body.enabled;
    await db.query(`UPDATE users SET line_notifications_enabled = $1 WHERE id = $2`, [enabled, req.user.id]);
    logInfo('line.notifications.toggle', { userId: req.user.id, enabled });
    res.json({ success: true, notificationsEnabled: enabled });
  } catch (err) {
    logError('line.notifications.failed', { err: err.message });
    res.status(500).json({ success: false, message: '無法更新 LINE 通知設定' });
  }
});

router.post('/unlink', authenticateToken, async (req, res) => {
  try {
    await db.query(`UPDATE users SET line_user_id = NULL WHERE id = $1`, [req.user.id]);
    logInfo('line.unlinked', { userId: req.user.id });
    res.json({ success: true, message: '已解除 LINE 綁定' });
  } catch (err) {
    logError('line.unlink.failed', { err: err.message });
    res.status(500).json({ success: false, message: '無法解除綁定' });
  }
});

module.exports = { router, webhookHandler };
