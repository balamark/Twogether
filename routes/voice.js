// 語音輸入 — POST a short voice clip, get back text for the user to edit.
//
//   POST /api/voice/transcribe        (signed in)  multipart: audio, duration_ms
//   POST /api/guest-ai/voice          (guest)      multipart: audio, duration_ms, guest_id
//
// The guest route lives under /api/guest-ai/ because that prefix is the one
// public AI surface the guest preview may reach (tests/guest-mode.spec.ts).
//
// Caps:
// - free: FEATURE_LIMITS.free.voice_seconds_per_day (10 min/day); premium unlimited.
// - guest: GUEST_VOICE_LIMIT clips per guest id (+ a per-IP daily backstop).
// - global ceilings for users and guests, so a bug or a bot can't run up the bill.
// The audio stays in memory, the transcript is returned and forgotten; only
// duration / size / cost are written to voice_usage.

const express = require('express');
const multer = require('multer');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { getCoupleIdForUser, getCoupleTier, getLimit, checkLimit } = require('../lib/entitlements');
const { transcribe, isAvailable, isAudioMime, MAX_CLIP_MS, MAX_BYTES } = require('../lib/transcribe');
const { _internals: guestAi } = require('./guest-ai');
const { logInfo, logWarn, logError } = require('../lib/logger');

const GUEST_VOICE_LIMIT = Number(process.env.GUEST_VOICE_LIMIT || 3);
const GUEST_VOICE_IP_DAILY = Number(process.env.GUEST_VOICE_IP_DAILY || 9);
const GUEST_VOICE_GLOBAL_DAILY = Number(process.env.GUEST_VOICE_GLOBAL_DAILY || 1500);
// ~200 hours/day across all signed-in users (≈ US$36 at mini-transcribe list price).
const VOICE_GLOBAL_DAILY_SECONDS = Number(process.env.VOICE_GLOBAL_DAILY_SECONDS || 720000);

const validGuestId = (v) => typeof v === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(v);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 4 },
});

const MSG = {
  noAudio: () => ({ success: false, error_code: 'VOICE_NO_AUDIO', message: '沒有收到錄音，請再按一次 🎤 重新錄' }),
  tooLong: () => ({ success: false, error_code: 'VOICE_TOO_LONG', message: '這段錄音太長了，每段最多 60 秒。請分成幾段說' }),
  badType: () => ({ success: false, error_code: 'VOICE_BAD_FORMAT', message: '這個瀏覽器的錄音格式無法辨識。請改用打字，或用手機鍵盤上的 🎤 聽寫' }),
  unavailable: () => ({ success: false, error_code: 'VOICE_UNAVAILABLE', message: '語音輸入暫時無法使用。可以先打字，或用手機鍵盤上的 🎤 聽寫' }),
  busy: () => ({ success: false, error_code: 'VOICE_BUSY', message: '語音輸入今天的使用量太大，暫時休息一下。可以先打字，或用手機鍵盤上的 🎤 聽寫，稍後再試' }),
  failed: () => ({ success: false, error_code: 'VOICE_FAILED', message: '語音轉文字沒有成功，這次不計入額度。請再錄一次，或改用打字' }),
  guestLimit: () => ({
    success: false,
    error_code: 'GUEST_VOICE_LIMIT',
    message: `試玩的 ${GUEST_VOICE_LIMIT} 次語音輸入已經用完了。可以繼續打字；免費註冊後每天都有語音額度`,
    limit: GUEST_VOICE_LIMIT,
    remaining: 0,
  }),
};

// Run multer and turn its errors into our messages instead of a generic 500.
function receiveAudio(req, res, next) {
  upload.single('audio')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      logInfo('voice.rejected', { reason: 'too_large', limitBytes: MAX_BYTES });
      return res.status(413).json(MSG.tooLong());
    }
    logWarn('voice.upload_error', { code: err.code, err: err.message });
    return res.status(400).json(MSG.noAudio());
  });
}

// Validate the clip; returns { audioMs } or sends the error response and returns null.
// duration_ms comes from the client's recorder; it's clamped to what one clip can
// be, and the byte cap above bounds what a lying client can send.
function readClip(req, res, who) {
  if (!isAvailable()) {
    logError('voice.unavailable', { reason: 'OPENAI_API_KEY missing', ...who });
    res.status(503).json(MSG.unavailable());
    return null;
  }
  const file = req.file;
  if (!file || !file.buffer || file.size === 0) {
    res.status(400).json(MSG.noAudio());
    return null;
  }
  if (!isAudioMime(file.mimetype)) {
    logInfo('voice.rejected', { reason: 'bad_type', mimetype: file.mimetype, ...who });
    res.status(415).json(MSG.badType());
    return null;
  }
  const claimed = Number(req.body.duration_ms);
  if (Number.isFinite(claimed) && claimed > MAX_CLIP_MS + 2000) {
    logInfo('voice.rejected', { reason: 'too_long', claimedMs: claimed, ...who });
    res.status(413).json(MSG.tooLong());
    return null;
  }
  // Unknown / tiny claims bill as a full second at least; never more than a clip.
  const audioMs = Math.min(MAX_CLIP_MS, Math.max(1000, Number.isFinite(claimed) ? Math.round(claimed) : MAX_CLIP_MS));
  return { audioMs };
}

async function record({ userId = null, guestId = null, ipHash = null, audioMs, bytes, meta }) {
  try {
    await db.query(
      `INSERT INTO voice_usage (user_id, guest_id, ip_hash, audio_ms, bytes, provider, model, latency_ms, cost_usd)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [userId, guestId, ipHash, audioMs, bytes, meta.provider, meta.model, meta.latencyMs ?? null, meta.costUsd ?? null]
    );
  } catch (err) {
    // The user already got their text; a ledger miss only under-counts.
    logWarn('voice.record_failed', { err: err.message });
  }
}

// ─── signed-in users ────────────────────────────────────────────────────────
const router = express.Router();

router.post('/transcribe', authenticateToken, receiveAudio, async (req, res) => {
  const userId = req.user.id;
  const clip = readClip(req, res, { userId });
  if (!clip) return;
  try {
    const coupleId = await getCoupleIdForUser(userId);
    const tier = await getCoupleTier(coupleId);
    const usedRow = await db.query(
      `SELECT
         COALESCE(SUM(audio_ms) FILTER (WHERE user_id = $1), 0)::bigint AS mine,
         COALESCE(SUM(audio_ms) FILTER (WHERE user_id IS NOT NULL), 0)::bigint AS everyone
       FROM voice_usage
       WHERE created_at >= DATE_TRUNC('day', NOW())`,
      [userId]
    );
    const usedSeconds = Math.ceil(Number(usedRow.rows[0]?.mine || 0) / 1000);
    const globalSeconds = Math.ceil(Number(usedRow.rows[0]?.everyone || 0) / 1000);

    const check = checkLimit({ tier, key: 'voice_seconds_per_day', used: usedSeconds });
    if (!check.ok) {
      logInfo('voice.limit', { userId, coupleId, tier, usedSeconds, blocked: true });
      return res.status(check.status).json(check.body);
    }
    if (globalSeconds >= VOICE_GLOBAL_DAILY_SECONDS) {
      logWarn('voice.global_cap', { userId, globalSeconds, cap: VOICE_GLOBAL_DAILY_SECONDS });
      return res.status(503).json(MSG.busy());
    }

    logInfo('voice.attempt', { userId, tier, audioMs: clip.audioMs, bytes: req.file.size, mimetype: req.file.mimetype });
    const { text, meta } = await transcribe({ buffer: req.file.buffer, mimetype: req.file.mimetype, audioMs: clip.audioMs });
    await record({ userId, audioMs: clip.audioMs, bytes: req.file.size, meta });

    const limit = getLimit(tier, 'voice_seconds_per_day');
    const usedAfter = usedSeconds + Math.ceil(clip.audioMs / 1000);
    const remainingSeconds = Number.isFinite(limit) ? Math.max(0, limit - usedAfter) : null;
    logInfo('voice.call', { userId, tier, audioMs: clip.audioMs, provider: meta.provider, costUsd: meta.costUsd, latencyMs: meta.latencyMs, mix: meta.mix, remainingSeconds });
    res.json({
      success: true,
      text,
      usage: { tier, limitSeconds: Number.isFinite(limit) ? limit : null, usedSeconds: usedAfter, remainingSeconds },
    });
  } catch (err) {
    const unavailable = err.code === 'VOICE_UNAVAILABLE';
    logError('voice.call failed', { userId, code: err.code, status: err.status, err: err.message });
    res.status(unavailable ? 503 : 502).json(unavailable ? MSG.unavailable() : MSG.failed());
  }
});

// ─── guests (訪客模式) ──────────────────────────────────────────────────────
const guestRouter = express.Router();

async function guestUsage(guestId, ipHash) {
  const r = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE guest_id = $1)::int AS guest_used,
       COUNT(*) FILTER (WHERE ip_hash = $2 AND created_at >= NOW() - INTERVAL '24 hours')::int AS ip_used
     FROM voice_usage
     WHERE user_id IS NULL AND (guest_id = $1 OR (ip_hash = $2 AND created_at >= NOW() - INTERVAL '24 hours'))`,
    [guestId, ipHash]
  );
  const guestUsed = r.rows[0]?.guest_used || 0;
  const ipUsed = r.rows[0]?.ip_used || 0;
  const remaining = Math.max(0, Math.min(GUEST_VOICE_LIMIT - guestUsed, GUEST_VOICE_IP_DAILY - ipUsed));
  return { guestUsed, ipUsed, remaining };
}

guestRouter.post('/', receiveAudio, async (req, res) => {
  const guestId = req.body.guest_id;
  if (!validGuestId(guestId)) {
    return res.status(400).json({ success: false, message: '訪客編號格式不正確，請重新整理頁面再試', error_code: 'GUEST_ID_INVALID' });
  }
  const ipHash = guestAi.hashIp(req.ip);
  const clip = readClip(req, res, { guestId });
  if (!clip) return;
  try {
    const before = await guestUsage(guestId, ipHash);
    if (before.remaining <= 0) {
      logInfo('guest_voice.limit', { guestId, guestUsed: before.guestUsed, ipUsed: before.ipUsed, blocked: true });
      return res.status(429).json(MSG.guestLimit());
    }
    const global = await db.query(
      `SELECT COUNT(*)::int AS c FROM voice_usage WHERE user_id IS NULL AND created_at >= NOW() - INTERVAL '24 hours'`
    );
    if ((global.rows[0]?.c || 0) >= GUEST_VOICE_GLOBAL_DAILY) {
      logWarn('guest_voice.global_cap', { cap: GUEST_VOICE_GLOBAL_DAILY });
      return res.status(429).json(MSG.guestLimit());
    }

    const { text, meta } = await transcribe({ buffer: req.file.buffer, mimetype: req.file.mimetype, audioMs: clip.audioMs });
    await record({ guestId, ipHash, audioMs: clip.audioMs, bytes: req.file.size, meta });
    const remaining = Math.max(0, before.remaining - 1);
    logInfo('guest_voice.call', { guestId, audioMs: clip.audioMs, provider: meta.provider, costUsd: meta.costUsd, latencyMs: meta.latencyMs, mix: meta.mix, remaining });
    res.json({
      success: true,
      text,
      usage: { tier: 'guest', limit: GUEST_VOICE_LIMIT, used: GUEST_VOICE_LIMIT - remaining, remaining },
    });
  } catch (err) {
    const unavailable = err.code === 'VOICE_UNAVAILABLE';
    logError('guest_voice.call failed', { guestId, code: err.code, status: err.status, err: err.message });
    res.status(unavailable ? 503 : 502).json(unavailable ? MSG.unavailable() : MSG.failed());
  }
});

module.exports = { router, guestRouter, _internals: { GUEST_VOICE_LIMIT, MSG } };
