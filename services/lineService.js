// LINE Messaging API integration: mirror in-app notifications to a user's LINE.
// The channel access token is minted from LINE_CHANNEL_ID + LINE_CHANNEL_SECRET
// (client_credentials, 30-day token) and cached in memory, so only the secret
// needs to live in the environment.
//
// Observability (see memory: log every new feature): every push and webhook
// path emits a structured `line.*` log via lib/logger so delivery and binding
// are diagnosable from gcloud.

const crypto = require('crypto');
const { logInfo, logWarn, logError } = require('../lib/logger');

const CHANNEL_ID = process.env.LINE_CHANNEL_ID || '';
const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || '';
const TOKEN_URL = 'https://api.line.me/v2/oauth/accessToken';
const PUSH_URL = 'https://api.line.me/v2/bot/message/push';

function isConfigured() {
  return !!(CHANNEL_ID && CHANNEL_SECRET);
}

// In-memory token cache. Tokens last 30 days; refresh a day early.
let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getChannelAccessToken() {
  if (!isConfigured()) return null;
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAt) return cachedToken;
  try {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CHANNEL_ID,
      client_secret: CHANNEL_SECRET,
    });
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      logError('line.token.failed', { status: res.status, err: data.error || data.message || 'no token' });
      return null;
    }
    cachedToken = data.access_token;
    // expires_in is seconds; refresh 1 day early.
    cachedTokenExpiresAt = now + (Number(data.expires_in || 2592000) - 86400) * 1000;
    logInfo('line.token.issued', { expiresInSec: data.expires_in });
    return cachedToken;
  } catch (err) {
    logError('line.token.error', { err: err.message });
    return null;
  }
}

// Verify the X-Line-Signature header on an incoming webhook (HMAC-SHA256 of the
// raw body with the channel secret, base64).
function verifySignature(rawBody, signature) {
  if (!CHANNEL_SECRET || !signature) return false;
  const expected = crypto.createHmac('sha256', CHANNEL_SECRET).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// Low-level push to a known LINE userId. Returns true on delivery.
async function pushMessage(lineUserId, text) {
  const token = await getChannelAccessToken();
  if (!token || !lineUserId) return false;
  try {
    const res = await fetch(PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: 'text', text: text.slice(0, 4900) }],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      logWarn('line.push.failed', { status: res.status, err: errBody.slice(0, 300) });
      return false;
    }
    logInfo('line.push.sent', { chars: text.length });
    return true;
  } catch (err) {
    logError('line.push.error', { err: err.message });
    return false;
  }
}

const REPLY_URL = 'https://api.line.me/v2/bot/message/reply';

// Reply to a webhook event using its short-lived replyToken (free, immediate).
async function replyMessage(replyToken, text) {
  const token = await getChannelAccessToken();
  if (!token || !replyToken) return false;
  try {
    const res = await fetch(REPLY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ replyToken, messages: [{ type: 'text', text: text.slice(0, 4900) }] }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      logWarn('line.reply.failed', { status: res.status, err: errBody.slice(0, 300) });
      return false;
    }
    return true;
  } catch (err) {
    logError('line.reply.error', { err: err.message });
    return false;
  }
}

// Fire-and-forget mirror of an in-app notification to a user's LINE, gated by
// linkage + the per-user opt-in. Safe to call unconditionally at notification
// sites: it no-ops silently when LINE isn't configured or the user isn't
// linked / opted out.
async function pushToUserIfLinked(db, userId, text) {
  if (!isConfigured() || !userId || !text) return;
  try {
    const r = await db.query(
      `SELECT line_user_id, line_notifications_enabled FROM users WHERE id = $1`,
      [userId]
    );
    const row = r.rows[0];
    if (!row || !row.line_user_id) {
      logInfo('line.push.skip', { userId, reason: 'not_linked' });
      return;
    }
    if (row.line_notifications_enabled === false) {
      logInfo('line.push.skip', { userId, reason: 'opted_out' });
      return;
    }
    const ok = await pushMessage(row.line_user_id, text);
    logInfo('line.push.result', { userId, ok });
  } catch (err) {
    logWarn('line.push.mirror_failed', { userId, err: err.message });
  }
}

module.exports = {
  isConfigured,
  getChannelAccessToken,
  verifySignature,
  pushMessage,
  replyMessage,
  pushToUserIfLinked,
};
