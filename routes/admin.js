// Admin funnel dashboard.
//
// Three pieces:
//   - publicRouter:    POST /track/landing  (anonymous beacon from frontend)
//   - adminApiRouter:  GET  /funnel, GET /recent-users  (Basic-Auth gated)
//   - htmlHandler:     GET  /admin  (Basic-Auth gated, inline HTML page)
//
// Mounted from server.js. The Basic Auth middleware is applied by the mount
// site, not here, so the public beacon route can stay anonymous.

const express = require('express');
const db = require('../database/db');
const { logInfo, logError, logWarn } = require('../lib/logger');

const publicRouter = express.Router();
const adminApiRouter = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// In-memory per-IP rate limit for the anonymous landing beacon. Since the
// beacon writes to the DB unauthenticated, an unthrottled flood would (a)
// fill the table and (b) pollute the funnel's distinct-IP counts. A sliding
// 1-minute window with a per-IP cap is enough to take the edge off without
// pulling in a dependency. Bucket is cleared periodically to bound memory.
const BEACON_WINDOW_MS = 60_000;
const BEACON_MAX_PER_WINDOW = 6; // 6 beacons/min per IP is plenty for any real visitor
const beaconHits = new Map(); // ip -> [timestamps...]

function beaconRateLimitExceeded(ip) {
  if (!ip) return false; // can't bucket what we can't identify; rely on table cap below
  const now = Date.now();
  const cutoff = now - BEACON_WINDOW_MS;
  const hits = (beaconHits.get(ip) || []).filter((t) => t > cutoff);
  if (hits.length >= BEACON_MAX_PER_WINDOW) {
    beaconHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  beaconHits.set(ip, hits);
  return false;
}

// Periodically GC the bucket so a long-running process doesn't leak memory
// from one-off IPs. Runs in test/dev too — cheap and side-effect-free.
const beaconGcTimer = setInterval(() => {
  const cutoff = Date.now() - BEACON_WINDOW_MS;
  for (const [ip, hits] of beaconHits) {
    const live = hits.filter((t) => t > cutoff);
    if (live.length === 0) beaconHits.delete(ip);
    else beaconHits.set(ip, live);
  }
}, BEACON_WINDOW_MS);
beaconGcTimer.unref(); // don't keep the event loop alive just for GC

// ──────────────────────────────────────────────────────────────────────────
// Public: anonymous landing visit beacon.
// ──────────────────────────────────────────────────────────────────────────

publicRouter.post('/track/landing', (req, res) => {
  const ip = req.ip || null;

  // Drop excess beacons silently — 204 either way so an attacker can't tell
  // they're being throttled. Real users with one tab session can't trip this.
  if (beaconRateLimitExceeded(ip)) {
    return res.status(204).end();
  }

  const ua = (req.body && typeof req.body.ua === 'string') ? req.body.ua.slice(0, 512) : null;

  // Fire-and-forget: don't await the insert, so render isn't blocked by DB
  // latency. Errors are swallowed into the structured logger.
  db.query(
    'INSERT INTO landing_visits (ip, user_agent) VALUES ($1, $2)',
    [ip, ua]
  ).catch((err) => {
    logError('landing_visits insert failed', { err: err.message });
  });

  res.status(204).end();
});

// ──────────────────────────────────────────────────────────────────────────
// Admin: funnel summary.
// ──────────────────────────────────────────────────────────────────────────

// Parse YYYY-MM-DD into a real calendar date or fall back. Returns the same
// YYYY-MM-DD string when valid, or null when the input was provided but
// malformed (so the caller can return 400 instead of silently substituting
// the fallback). When no value is provided at all, returns the fallback.
function parseDateOr(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  // Reject impossible dates like 2025-13-45 (regex shape only catches digits).
  const d = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  // Round-trip check: Date silently shifts overflow (2025-02-30 → 2025-03-02).
  if (d.toISOString().slice(0, 10) !== value) return null;
  return value;
}

adminApiRouter.get('/funnel', async (req, res) => {
  try {
    // Default window: last 30 days, inclusive.
    const today = new Date().toISOString().slice(0, 10);
    const thirtyAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const from = parseDateOr(req.query.from, thirtyAgo);
    // 'to' is inclusive — we add a day in SQL via `< to+1`.
    const to = parseDateOr(req.query.to, today);

    if (from === null || to === null) {
      return res.status(400).json({ error: 'invalid date; expected YYYY-MM-DD calendar date' });
    }
    if (from > to) {
      return res.status(400).json({ error: 'from must be <= to' });
    }

    const [visitsRow, signupsRow, returnedRow] = await Promise.all([
      db.query(
        `SELECT COUNT(DISTINCT ip)::int AS distinct_ips,
                COUNT(*)::int            AS total_visits
           FROM landing_visits
          WHERE visited_at >= $1::date
            AND visited_at <  ($2::date + INTERVAL '1 day')`,
        [from, to]
      ),
      db.query(
        `SELECT COUNT(*)::int AS signups
           FROM users
          WHERE created_at >= $1::date
            AND created_at <  ($2::date + INTERVAL '1 day')`,
        [from, to]
      ),
      // "Returned" = a user created in the window who has >=2 distinct login
      // days overall. Login days come from login_events (added in migration 038),
      // so this count only reflects logins captured after that migration ran.
      db.query(
        `WITH new_users AS (
           SELECT id FROM users
            WHERE created_at >= $1::date
              AND created_at <  ($2::date + INTERVAL '1 day')
         )
         SELECT COUNT(*)::int AS returned_users
           FROM (
             SELECT le.user_id
               FROM login_events le
               JOIN new_users nu ON nu.id = le.user_id
              GROUP BY le.user_id
             HAVING COUNT(DISTINCT date_trunc('day', le.logged_at)) >= 2
           ) t`,
        [from, to]
      ),
    ]);

    const distinctIps = visitsRow.rows[0].distinct_ips || 0;
    const totalVisits = visitsRow.rows[0].total_visits || 0;
    const signups = signupsRow.rows[0].signups || 0;
    const returnedUsers = returnedRow.rows[0].returned_users || 0;

    const ipToSignupRate = distinctIps > 0 ? signups / distinctIps : null;
    const signupToReturnRate = signups > 0 ? returnedUsers / signups : null;

    res.json({
      window: { from, to },
      distinctIps,
      totalVisits,
      signups,
      returnedUsers,
      ipToSignupRate,
      signupToReturnRate,
    });
  } catch (err) {
    logError('Admin funnel query failed', { err: err.message, stack: err.stack });
    res.status(500).json({ error: 'funnel query failed' });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// Admin: recent users + usage rollup.
// ──────────────────────────────────────────────────────────────────────────

adminApiRouter.get('/recent-users', async (req, res) => {
  try {
    // Clamp to [1, 200]. parseInt('abc') is NaN → falls back to 50; negatives
    // would otherwise produce a Postgres error on `LIMIT -5`.
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50), 200);

    // Single query: users LEFT JOIN their couple (membership) and aggregate
    // counts from couple-scoped tables. moments_count uses recorded_by so it
    // reflects the user's own contributions; photos_count is couple-scoped
    // (photos table has no user column).
    //
    // The couples join is a LATERAL with explicit ordering and LIMIT 1 to
    // guarantee one row per user even if stale data leaves a user in both a
    // draft (user2_id IS NULL) and a complete couple. We prefer the complete
    // one (user2_id IS NOT NULL first), then the most recently created.
    const result = await db.query(
      `SELECT
         u.id,
         u.email,
         u.nickname,
         u.created_at,
         u.last_login,
         c.id              AS couple_id,
         c.created_at      AS paired_at_candidate,
         c.paired          AS paired,
         COALESCE(lm.cnt, 0)::int  AS moments_count,
         COALESCE(ph.cnt, 0)::int  AS photos_count,
         COALESCE(le.login_days, 0)::int AS login_days
       FROM users u
       LEFT JOIN LATERAL (
         SELECT id, created_at, (user2_id IS NOT NULL) AS paired
           FROM couples
          WHERE user1_id = u.id OR user2_id = u.id
          ORDER BY (user2_id IS NOT NULL) DESC, created_at DESC
          LIMIT 1
       ) c ON true
       LEFT JOIN (
         SELECT recorded_by, COUNT(*)::int AS cnt
           FROM love_moments GROUP BY recorded_by
       ) lm ON lm.recorded_by = u.id
       LEFT JOIN (
         SELECT couple_id, COUNT(*)::int AS cnt
           FROM photos GROUP BY couple_id
       ) ph ON ph.couple_id = c.id
       LEFT JOIN (
         SELECT user_id,
                COUNT(DISTINCT date_trunc('day', logged_at))::int AS login_days
           FROM login_events GROUP BY user_id
       ) le ON le.user_id = u.id
       ORDER BY u.created_at DESC
       LIMIT $1`,
      [limit]
    );

    const users = result.rows.map((r) => ({
      id: r.id,
      email: r.email,
      nickname: r.nickname,
      created_at: r.created_at,
      last_login: r.last_login,
      paired: !!r.paired,
      // Only expose paired_at when actually paired, so unpaired rows aren't
      // misleadingly stamped with the solo-couple creation date.
      paired_at: r.paired ? r.paired_at_candidate : null,
      moments_count: r.moments_count,
      photos_count: r.photos_count,
      login_days: r.login_days,
    }));

    res.json({ users });
  } catch (err) {
    logError('Admin recent-users query failed', { err: err.message, stack: err.stack });
    res.status(500).json({ error: 'recent users query failed' });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// Admin: HTML dashboard.
// ──────────────────────────────────────────────────────────────────────────

const ADMIN_HTML = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Twogether 後台 · Funnel</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, "PingFang TC", "Noto Sans TC", sans-serif;
      margin: 0;
      padding: 32px 24px 64px;
      background: #faf7f4;
      color: #2a2422;
    }
    h1 { font-weight: 500; margin: 0 0 8px; font-size: 22px; }
    .sub { color: #8a807c; margin: 0 0 24px; font-size: 13px; }
    .container { max-width: 1080px; margin: 0 auto; }
    .controls {
      display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
      margin-bottom: 24px;
    }
    .controls label { font-size: 13px; color: #564f4c; }
    .controls input[type=date] {
      font: inherit; padding: 6px 8px; border: 1px solid #d8cfca; border-radius: 6px; background: #fff;
    }
    .controls button {
      font: inherit; padding: 7px 14px; border: 0; border-radius: 6px;
      background: #2a2422; color: #faf7f4; cursor: pointer;
    }
    .controls button:hover { background: #4a3f3b; }
    .funnel { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 32px; }
    .card {
      background: #fff; border: 1px solid #ece6e1; border-radius: 10px; padding: 16px;
    }
    .card .label { color: #8a807c; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    .card .value { font-size: 26px; font-weight: 500; margin-top: 6px; }
    .card .delta { color: #b7635a; font-size: 12px; margin-top: 4px; }
    .arrows { display: flex; gap: 6px; align-items: center; margin: 12px 0 28px; color: #8a807c; font-size: 13px; flex-wrap: wrap; }
    .arrows span.rate { color: #2a2422; font-weight: 500; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #ece6e1; border-radius: 10px; overflow: hidden; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #f1ebe6; font-size: 13px; }
    th { background: #f6f1ec; color: #564f4c; font-weight: 500; }
    tr:last-child td { border-bottom: 0; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .badge { display: inline-block; padding: 2px 7px; border-radius: 999px; font-size: 11px; }
    .badge.yes { background: #e7f3eb; color: #2c6a3e; }
    .badge.no  { background: #f6eceb; color: #8a4640; }
    .error { color: #b7635a; margin: 12px 0; }
    .muted { color: #b6ada8; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Twogether 後台 · 漏斗轉換</h1>
    <p class="sub">從不重複 IP 進站到註冊、再到回訪的轉換率。最近註冊帳號清單在下方。</p>

    <div class="controls">
      <label>From <input type="date" id="from"></label>
      <label>To <input type="date" id="to"></label>
      <button id="apply">套用</button>
      <span class="muted" id="status"></span>
    </div>

    <div id="error" class="error" hidden></div>

    <div class="funnel" id="funnelCards"></div>
    <div class="arrows" id="funnelRates"></div>

    <h1 style="margin-top:24px">最近註冊帳號</h1>
    <p class="sub">依註冊時間倒序。情侶配對狀態、登入天數、互動次數。</p>
    <div style="overflow-x:auto">
      <table id="usersTable">
        <thead>
          <tr>
            <th>Email / 暱稱</th>
            <th>註冊時間</th>
            <th>上次登入</th>
            <th>配對</th>
            <th class="num">登入天數</th>
            <th class="num">紀錄</th>
            <th class="num">照片</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  </div>

  <script>
    const $ = (id) => document.getElementById(id);
    function fmtDate(s) {
      if (!s) return '—';
      const d = new Date(s);
      if (isNaN(d.getTime())) return s;
      return d.toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' });
    }
    function fmtPct(x) {
      if (x === null || x === undefined) return '—';
      return (x * 100).toFixed(1) + '%';
    }
    function todayStr() { return new Date().toISOString().slice(0, 10); }
    function daysAgoStr(n) {
      return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    }

    $('from').value = daysAgoStr(30);
    $('to').value = todayStr();

    async function load() {
      $('status').textContent = '載入中…';
      $('error').hidden = true;
      try {
        const qs = new URLSearchParams({ from: $('from').value, to: $('to').value });
        const [funnelRes, usersRes] = await Promise.all([
          fetch('/api/admin/funnel?' + qs.toString()),
          fetch('/api/admin/recent-users?limit=100'),
        ]);
        if (!funnelRes.ok) throw new Error('funnel ' + funnelRes.status);
        if (!usersRes.ok) throw new Error('users ' + usersRes.status);
        const funnel = await funnelRes.json();
        const usersBody = await usersRes.json();
        renderFunnel(funnel);
        renderUsers(usersBody.users || []);
        $('status').textContent = '更新於 ' + new Date().toLocaleTimeString('zh-TW');
      } catch (e) {
        $('status').textContent = '';
        $('error').hidden = false;
        $('error').textContent = '載入失敗: ' + e.message;
      }
    }

    function renderFunnel(f) {
      $('funnelCards').innerHTML = [
        ['不重複 IP 進站', f.distinctIps, f.totalVisits + ' 次造訪'],
        ['本期新註冊帳號', f.signups, ''],
        ['本期新註冊中回訪者', f.returnedUsers, '本期新註冊且至少 2 個不同日期登入'],
      ].map(([label, value, delta]) => (
        '<div class="card"><div class="label">' + label + '</div>' +
        '<div class="value">' + (value ?? 0).toLocaleString() + '</div>' +
        (delta ? '<div class="delta">' + delta + '</div>' : '') +
        '</div>'
      )).join('');

      $('funnelRates').innerHTML =
        'IP → 註冊 <span class="rate">' + fmtPct(f.ipToSignupRate) + '</span>' +
        '<span>·</span>' +
        '本期新註冊中回訪比例 <span class="rate">' + fmtPct(f.signupToReturnRate) + '</span>';
    }

    function renderUsers(rows) {
      const tbody = document.querySelector('#usersTable tbody');
      if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="muted">沒有資料</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map((u) => {
        const paired = u.paired
          ? '<span class="badge yes">已配對</span>' +
            (u.paired_at ? '<div class="muted" style="font-size:11px;margin-top:2px">' + fmtDate(u.paired_at) + '</div>' : '')
          : '<span class="badge no">未配對</span>';
        const nickname = (u.nickname || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
        const email = (u.email || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
        return '<tr>' +
          '<td><div>' + email + '</div><div class="muted" style="font-size:11px">' + nickname + '</div></td>' +
          '<td>' + fmtDate(u.created_at) + '</td>' +
          '<td>' + fmtDate(u.last_login) + '</td>' +
          '<td>' + paired + '</td>' +
          '<td class="num">' + u.login_days + '</td>' +
          '<td class="num">' + u.moments_count + '</td>' +
          '<td class="num">' + u.photos_count + '</td>' +
          '</tr>';
      }).join('');
    }

    $('apply').addEventListener('click', load);
    load();
  </script>
</body>
</html>`;

function htmlHandler(req, res) {
  logInfo('Admin dashboard loaded', { ip: req.ip });
  res.type('html').send(ADMIN_HTML);
}

// ──────────────────────────────────────────────────────────────────────────
// Retention: purge old landing_visits rows once per day so the table doesn't
// grow without bound. Default 180 days, overridable via env. Login events
// are kept indefinitely since they're 1:1 with user activity (small volume).
// ──────────────────────────────────────────────────────────────────────────
const LANDING_VISITS_RETENTION_DAYS =
  parseInt(process.env.LANDING_VISITS_RETENTION_DAYS, 10) || 180;
const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function purgeOldLandingVisits() {
  try {
    const result = await db.query(
      `DELETE FROM landing_visits
        WHERE visited_at < NOW() - ($1 || ' days')::interval`,
      [String(LANDING_VISITS_RETENTION_DAYS)]
    );
    if (result.rowCount > 0) {
      logInfo('landing_visits retention purge', {
        deleted: result.rowCount,
        retentionDays: LANDING_VISITS_RETENTION_DAYS,
      });
    }
  } catch (err) {
    logWarn('landing_visits retention purge failed', { err: err.message });
  }
}

// Skip in test to keep test runs deterministic. Production/dev both run it.
if (process.env.NODE_ENV !== 'test') {
  const retentionTimer = setInterval(purgeOldLandingVisits, RETENTION_INTERVAL_MS);
  retentionTimer.unref();
  // Kick once at startup, but delayed so it doesn't race the DB connection.
  setTimeout(purgeOldLandingVisits, 30_000).unref();
}

module.exports = { publicRouter, adminApiRouter, htmlHandler, purgeOldLandingVisits };
