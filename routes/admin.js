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
const { optionalAuth } = require('../middleware/auth');

const publicRouter = express.Router();
const adminApiRouter = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// In-memory per-IP rate limit for the anonymous public beacons. Each beacon
// route gets its own bucket so a flood of one doesn't starve the other.
// Sliding 1-minute window per (route, IP). Cheap, no deps, GC'd in the
// background.
const RL_WINDOW_MS = 60_000;
const RL_DEFAULT_MAX = 6;
const rateBuckets = new Map(); // route key -> Map<ip, number[]>

function rateLimitExceeded(routeKey, ip, max = RL_DEFAULT_MAX) {
  if (!ip) return false;
  let bucket = rateBuckets.get(routeKey);
  if (!bucket) {
    bucket = new Map();
    rateBuckets.set(routeKey, bucket);
  }
  const now = Date.now();
  const cutoff = now - RL_WINDOW_MS;
  const hits = (bucket.get(ip) || []).filter((t) => t > cutoff);
  if (hits.length >= max) {
    bucket.set(ip, hits);
    return true;
  }
  hits.push(now);
  bucket.set(ip, hits);
  return false;
}

// Per-route caps. View beacons are higher because authenticated users can
// legitimately switch views a dozen times in a minute while exploring.
const RL_MAX_TRACK_VIEW = 30;

const rateGcTimer = setInterval(() => {
  const cutoff = Date.now() - RL_WINDOW_MS;
  for (const [route, bucket] of rateBuckets) {
    for (const [ip, hits] of bucket) {
      const live = hits.filter((t) => t > cutoff);
      if (live.length === 0) bucket.delete(ip);
      else bucket.set(ip, live);
    }
    if (bucket.size === 0) rateBuckets.delete(route);
  }
}, RL_WINDOW_MS);
rateGcTimer.unref();

// ──────────────────────────────────────────────────────────────────────────
// Public: anonymous landing visit beacon.
// ──────────────────────────────────────────────────────────────────────────

publicRouter.post('/track/landing', (req, res) => {
  const ip = req.ip || null;

  // Drop excess beacons silently — 204 either way so an attacker can't tell
  // they're being throttled. Real users with one tab session can't trip this.
  if (rateLimitExceeded('landing', ip)) {
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
// Public: page-view beacon. Called by usePageTracking on view exit (and via
// navigator.sendBeacon on tab close). optionalAuth attaches req.user when a
// JWT is present so the row is attributed to the authenticated user.
// ──────────────────────────────────────────────────────────────────────────

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

publicRouter.post('/track/view', express.json({ type: '*/*' }), optionalAuth, (req, res) => {
  const ip = req.ip || null;
  if (rateLimitExceeded('view', ip, RL_MAX_TRACK_VIEW)) {
    return res.status(204).end();
  }

  const body = req.body || {};
  const view = typeof body.view === 'string' ? body.view.slice(0, 64) : null;
  const viewType = body.view_type === 'modal' ? 'modal' : 'view';
  const sessionId = typeof body.session_id === 'string' && UUID_RE.test(body.session_id)
    ? body.session_id : null;
  const enteredAt = typeof body.entered_at === 'string' ? new Date(body.entered_at) : null;
  const durationMs = Number.isFinite(body.duration_ms) ? Math.floor(body.duration_ms) : null;

  if (!view) return res.status(204).end();
  if (!enteredAt || Number.isNaN(enteredAt.getTime())) return res.status(204).end();
  // Clamp pathological client clocks: drop entries claiming to be from > 2
  // days ago / in the future, and durations longer than a day.
  const skewMs = Date.now() - enteredAt.getTime();
  if (skewMs < -ONE_DAY_MS || skewMs > 2 * ONE_DAY_MS) return res.status(204).end();
  const safeDuration = durationMs !== null && durationMs >= 0 && durationMs <= ONE_DAY_MS
    ? durationMs : null;

  const userId = (req.user && req.user.id) || null;

  db.query(
    `INSERT INTO page_views (user_id, view, view_type, session_id, entered_at, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, view, viewType, sessionId, enteredAt.toISOString(), safeDuration]
  ).catch((err) => {
    logError('page_views insert failed', { err: err.message });
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
// Admin: per-view stats (Pages tab).
// ──────────────────────────────────────────────────────────────────────────

adminApiRouter.get('/page-stats', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const thirtyAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const from = parseDateOr(req.query.from, thirtyAgo);
    const to = parseDateOr(req.query.to, today);

    if (from === null || to === null) {
      return res.status(400).json({ error: 'invalid date; expected YYYY-MM-DD calendar date' });
    }
    if (from > to) {
      return res.status(400).json({ error: 'from must be <= to' });
    }

    // Active users in window = anyone with a login OR a page-view in the
    // range. Used as the denominator for reach_pct so "% of users who saw
    // this view" is comparable across views.
    const result = await db.query(
      `WITH active AS (
         SELECT DISTINCT user_id FROM (
           SELECT user_id FROM login_events
            WHERE logged_at >= $1::date AND logged_at < ($2::date + INTERVAL '1 day')
              AND user_id IS NOT NULL
           UNION
           SELECT user_id FROM page_views
            WHERE entered_at >= $1::date AND entered_at < ($2::date + INTERVAL '1 day')
              AND user_id IS NOT NULL
         ) t
       ),
       total AS (SELECT COUNT(*)::int AS n FROM active)
       SELECT
         pv.view,
         pv.view_type,
         COUNT(DISTINCT pv.user_id)::int AS unique_users,
         COUNT(*)::int                   AS total_views,
         COALESCE(AVG(NULLIF(pv.duration_ms, 0))::int, 0) AS avg_duration_ms,
         CASE WHEN total.n > 0
              THEN (COUNT(DISTINCT pv.user_id)::numeric / total.n)::float
              ELSE NULL END AS reach_pct
         FROM page_views pv, total
        WHERE pv.entered_at >= $1::date AND pv.entered_at < ($2::date + INTERVAL '1 day')
          AND pv.user_id IS NOT NULL
        GROUP BY pv.view, pv.view_type, total.n
        ORDER BY unique_users DESC, total_views DESC`,
      [from, to]
    );

    res.json({ window: { from, to }, views: result.rows });
  } catch (err) {
    logError('Admin page-stats query failed', { err: err.message, stack: err.stack });
    res.status(500).json({ error: 'page-stats query failed' });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// Admin: retention KPIs (Retention tab). D1/D7/D30 from a signup cohort,
// plus DAU/WAU/MAU + stickiness and a 30-day DAU trend.
// ──────────────────────────────────────────────────────────────────────────

adminApiRouter.get('/retention', async (req, res) => {
  try {
    // D30 needs the cohort to have had at least 30 days to come back, so the
    // default cohort window ends 31 days ago. Override via query for any
    // historical look-back.
    const today = new Date().toISOString().slice(0, 10);
    const cohortDefaultEnd = new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 10);
    const cohortDefaultStart = new Date(Date.now() - 61 * 86_400_000).toISOString().slice(0, 10);
    const cohortFrom = parseDateOr(req.query.cohortFrom, cohortDefaultStart);
    const cohortTo = parseDateOr(req.query.cohortTo, cohortDefaultEnd);

    if (cohortFrom === null || cohortTo === null) {
      return res.status(400).json({ error: 'invalid date; expected YYYY-MM-DD calendar date' });
    }
    if (cohortFrom > cohortTo) {
      return res.status(400).json({ error: 'cohortFrom must be <= cohortTo' });
    }

    const [retentionRow, activeRow, trendRows] = await Promise.all([
      db.query(
        `WITH cohort AS (
           SELECT id, (created_at AT TIME ZONE 'UTC')::date AS signup_day
             FROM users
            WHERE created_at >= $1::date
              AND created_at <  ($2::date + INTERVAL '1 day')
         ),
         activity AS (
           SELECT user_id, (logged_at AT TIME ZONE 'UTC')::date AS d
             FROM login_events WHERE user_id IS NOT NULL
           UNION
           SELECT user_id, (entered_at AT TIME ZONE 'UTC')::date AS d
             FROM page_views   WHERE user_id IS NOT NULL
         )
         SELECT
           (SELECT COUNT(*)::int FROM cohort) AS signups,
           (SELECT COUNT(DISTINCT c.id)::int FROM cohort c
             JOIN activity a ON a.user_id = c.id
            WHERE a.d = c.signup_day + 1) AS d1,
           (SELECT COUNT(DISTINCT c.id)::int FROM cohort c
             JOIN activity a ON a.user_id = c.id
            WHERE a.d = c.signup_day + 7) AS d7,
           (SELECT COUNT(DISTINCT c.id)::int FROM cohort c
             JOIN activity a ON a.user_id = c.id
            WHERE a.d = c.signup_day + 30) AS d30`,
        [cohortFrom, cohortTo]
      ),
      db.query(
        `WITH activity AS (
           SELECT user_id, logged_at AS t FROM login_events WHERE user_id IS NOT NULL
           UNION ALL
           SELECT user_id, entered_at AS t FROM page_views  WHERE user_id IS NOT NULL
         )
         SELECT
           COUNT(DISTINCT user_id) FILTER (WHERE t >= NOW() - INTERVAL '1 day')::int  AS dau,
           COUNT(DISTINCT user_id) FILTER (WHERE t >= NOW() - INTERVAL '7 day')::int  AS wau,
           COUNT(DISTINCT user_id) FILTER (WHERE t >= NOW() - INTERVAL '30 day')::int AS mau
         FROM activity
         WHERE t >= NOW() - INTERVAL '30 day'`
      ),
      db.query(
        `WITH activity AS (
           SELECT user_id, (logged_at AT TIME ZONE 'UTC')::date AS d
             FROM login_events
            WHERE user_id IS NOT NULL AND logged_at >= NOW() - INTERVAL '30 day'
           UNION
           SELECT user_id, (entered_at AT TIME ZONE 'UTC')::date AS d
             FROM page_views
            WHERE user_id IS NOT NULL AND entered_at >= NOW() - INTERVAL '30 day'
         )
         SELECT d AS day, COUNT(DISTINCT user_id)::int AS count
           FROM activity GROUP BY d ORDER BY d`
      ),
    ]);

    const r = retentionRow.rows[0];
    const a = activeRow.rows[0];
    const signups = r.signups || 0;
    const pct = (n) => signups > 0 ? (n / signups) : null;

    res.json({
      cohort: { from: cohortFrom, to: cohortTo, signups },
      dayN: {
        d1: pct(r.d1 || 0),
        d7: pct(r.d7 || 0),
        d30: pct(r.d30 || 0),
        absolute: { d1: r.d1 || 0, d7: r.d7 || 0, d30: r.d30 || 0 },
      },
      active: {
        dau: a.dau || 0,
        wau: a.wau || 0,
        mau: a.mau || 0,
        stickiness: a.mau > 0 ? a.dau / a.mau : null,
      },
      dauTrend: trendRows.rows.map((row) => ({ date: row.day, count: row.count })),
    });
  } catch (err) {
    logError('Admin retention query failed', { err: err.message, stack: err.stack });
    res.status(500).json({ error: 'retention query failed' });
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
    .tabs { display: flex; gap: 4px; border-bottom: 1px solid #ece6e1; margin: 20px 0 16px; }
    .tab {
      padding: 8px 16px; border: 0; background: transparent; cursor: pointer;
      font: inherit; color: #8a807c; border-bottom: 2px solid transparent;
      margin-bottom: -1px;
    }
    .tab.active { color: #2a2422; border-bottom-color: #2a2422; font-weight: 500; }
    .tab:hover { color: #2a2422; }
    .panel { display: none; }
    .panel.active { display: block; }
    .bar-wrap { display: flex; align-items: center; gap: 10px; }
    .bar { flex: 1; height: 8px; background: #f1ebe6; border-radius: 4px; overflow: hidden; max-width: 240px; }
    .bar-fill { height: 100%; background: #d4a5a5; }
    .pill { display: inline-block; padding: 1px 6px; border-radius: 6px; background: #f1ebe6; color: #8a807c; font-size: 10px; margin-left: 6px; vertical-align: middle; }
    .sparkline { width: 100%; max-width: 480px; height: 60px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Twogether 後台</h1>
    <p class="sub">轉換漏斗、頁面使用、回訪指標。</p>

    <div class="controls">
      <label>From <input type="date" id="from"></label>
      <label>To <input type="date" id="to"></label>
      <button id="apply">套用</button>
      <span class="muted" id="status"></span>
    </div>

    <div id="error" class="error" hidden></div>

    <div class="tabs">
      <button class="tab active" data-panel="funnel">漏斗</button>
      <button class="tab" data-panel="pages">頁面</button>
      <button class="tab" data-panel="retention">回訪</button>
      <button class="tab" data-panel="therapists">諮商師</button>
    </div>

    <!-- Panel: Funnel (default) -->
    <div class="panel active" id="panel-funnel">
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

    <!-- Panel: Pages -->
    <div class="panel" id="panel-pages">
      <p class="sub">每個頁面在此區間內的觸及人數、停留時間，以及被多少比例的活躍使用者打開過。冷門頁面（觸及 &lt; 5%）在最下方。</p>
      <div style="overflow-x:auto">
        <table id="pagesTable">
          <thead>
            <tr>
              <th>頁面</th>
              <th class="num">不重複使用者</th>
              <th class="num">總瀏覽次數</th>
              <th class="num">平均停留</th>
              <th>觸及率</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <!-- Panel: Retention -->
    <div class="panel" id="panel-retention">
      <p class="sub">本期區間用於 DAU/WAU/MAU。Day-N 回訪以下方 cohort 計算。</p>
      <h3 style="margin:16px 0 6px;font-weight:500;font-size:14px">Day-N 回訪（cohort）</h3>
      <p class="sub" id="cohortMeta"></p>
      <div class="funnel" id="dayNCards"></div>

      <h3 style="margin:20px 0 6px;font-weight:500;font-size:14px">活躍使用者（最近 30 天）</h3>
      <div class="funnel" id="activeCards"></div>

      <h3 style="margin:20px 0 6px;font-weight:500;font-size:14px">DAU 趨勢（30 天）</h3>
      <svg id="dauSpark" class="sparkline" viewBox="0 0 480 60" preserveAspectRatio="none"></svg>
    </div>

    <!-- Panel: Therapists (approval queue) -->
    <div class="panel" id="panel-therapists">
      <p class="sub">諮商師申請審核。通過後檔案才會出現在使用者的諮商師列表中。</p>
      <div class="controls">
        <label>狀態
          <select id="therapistStatus">
            <option value="pending">待審核</option>
            <option value="approved">已通過</option>
            <option value="suspended">已暫停</option>
            <option value="rejected">未通過</option>
          </select>
        </label>
        <button id="therapistRefresh">重新整理</button>
        <span class="muted" id="therapistStatusMsg"></span>
      </div>
      <div style="overflow-x:auto">
        <table id="therapistsTable">
          <thead>
            <tr>
              <th>姓名 / 職稱</th>
              <th>專長</th>
              <th class="num">費率</th>
              <th>聯絡 / 證照</th>
              <th>驗證 / 文件</th>
              <th>申請時間</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
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
        const [funnelRes, usersRes, pagesRes, retRes] = await Promise.all([
          fetch('/api/admin/funnel?' + qs.toString()),
          fetch('/api/admin/recent-users?limit=100'),
          fetch('/api/admin/page-stats?' + qs.toString()),
          fetch('/api/admin/retention'),
        ]);
        if (!funnelRes.ok) throw new Error('funnel ' + funnelRes.status);
        if (!usersRes.ok) throw new Error('users ' + usersRes.status);
        if (!pagesRes.ok) throw new Error('pages ' + pagesRes.status);
        if (!retRes.ok) throw new Error('retention ' + retRes.status);
        const funnel = await funnelRes.json();
        const usersBody = await usersRes.json();
        const pages = await pagesRes.json();
        const retention = await retRes.json();
        renderFunnel(funnel);
        renderUsers(usersBody.users || []);
        renderPages(pages);
        renderRetention(retention);
        $('status').textContent = '更新於 ' + new Date().toLocaleTimeString('zh-TW');
      } catch (e) {
        $('status').textContent = '';
        $('error').hidden = false;
        $('error').textContent = '載入失敗: ' + e.message;
      }
    }

    function fmtDuration(ms) {
      if (!ms || ms < 1000) return (ms || 0) + ' ms';
      const s = Math.round(ms / 1000);
      if (s < 60) return s + ' 秒';
      const m = Math.floor(s / 60), rs = s % 60;
      return m + ' 分 ' + rs + ' 秒';
    }

    function renderPages(body) {
      const tbody = document.querySelector('#pagesTable tbody');
      const rows = body.views || [];
      if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="muted">沒有資料 — 等使用者開始操作後再回來看。</td></tr>';
        return;
      }
      const dead = rows.filter((r) => r.reach_pct !== null && r.reach_pct < 0.05);
      const live = rows.filter((r) => !dead.includes(r));
      const renderRow = (r, isDead) => {
        const pct = r.reach_pct === null ? 0 : r.reach_pct;
        const widthPct = Math.min(100, pct * 100);
        const label = (r.view + '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
        const typePill = r.view_type === 'modal' ? '<span class="pill">modal</span>' : '';
        return '<tr' + (isDead ? ' style="opacity:0.55"' : '') + '>' +
          '<td>' + label + typePill + '</td>' +
          '<td class="num">' + r.unique_users + '</td>' +
          '<td class="num">' + r.total_views + '</td>' +
          '<td class="num">' + fmtDuration(r.avg_duration_ms) + '</td>' +
          '<td><div class="bar-wrap"><div class="bar"><div class="bar-fill" style="width:' + widthPct.toFixed(1) + '%"></div></div>' +
          '<span class="muted" style="font-size:11px">' + (pct * 100).toFixed(1) + '%</span></div></td>' +
          '</tr>';
      };
      let html = live.map((r) => renderRow(r, false)).join('');
      if (dead.length > 0) {
        html += '<tr><td colspan="5" class="muted" style="padding-top:14px;font-size:11px">— 冷門頁面（觸及 &lt; 5%）—</td></tr>';
        html += dead.map((r) => renderRow(r, true)).join('');
      }
      tbody.innerHTML = html;
    }

    function renderRetention(r) {
      const cohortRange = r.cohort.from + ' → ' + r.cohort.to;
      $('cohortMeta').textContent = cohortRange + ' 的 ' + r.cohort.signups + ' 位註冊使用者';
      $('dayNCards').innerHTML = [
        ['D1', r.dayN.d1, r.dayN.absolute.d1],
        ['D7', r.dayN.d7, r.dayN.absolute.d7],
        ['D30', r.dayN.d30, r.dayN.absolute.d30],
      ].map(([label, p, abs]) => (
        '<div class="card"><div class="label">' + label + ' 回訪率</div>' +
        '<div class="value">' + fmtPct(p) + '</div>' +
        '<div class="delta">' + abs + ' / ' + r.cohort.signups + ' 人</div>' +
        '</div>'
      )).join('');
      $('activeCards').innerHTML = [
        ['DAU', r.active.dau, '過去 24 小時'],
        ['WAU', r.active.wau, '過去 7 天'],
        ['MAU', r.active.mau, '過去 30 天'],
        ['黏著度', fmtPct(r.active.stickiness), 'DAU / MAU'],
      ].map(([label, val, delta]) => (
        '<div class="card"><div class="label">' + label + '</div>' +
        '<div class="value">' + (typeof val === 'number' ? val.toLocaleString() : val) + '</div>' +
        '<div class="delta">' + delta + '</div>' +
        '</div>'
      )).join('');

      renderSparkline(r.dauTrend || []);
    }

    function renderSparkline(points) {
      const svg = $('dauSpark');
      if (points.length === 0) { svg.innerHTML = ''; return; }
      const W = 480, H = 60, pad = 4;
      const max = Math.max(1, ...points.map((p) => p.count));
      const stepX = points.length > 1 ? (W - pad * 2) / (points.length - 1) : 0;
      const path = points.map((p, i) => {
        const x = pad + i * stepX;
        const y = H - pad - (p.count / max) * (H - pad * 2);
        return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
      }).join(' ');
      const lastX = pad + (points.length - 1) * stepX;
      const lastY = H - pad - (points[points.length - 1].count / max) * (H - pad * 2);
      svg.innerHTML =
        '<path d="' + path + '" stroke="#d4a5a5" stroke-width="2" fill="none"/>' +
        '<circle cx="' + lastX.toFixed(1) + '" cy="' + lastY.toFixed(1) + '" r="3" fill="#b7635a"/>';
    }

    // Tab switching
    document.querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
        const panel = btn.getAttribute('data-panel');
        document.querySelectorAll('.panel').forEach((p) => {
          p.classList.toggle('active', p.id === 'panel-' + panel);
        });
      });
    });

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

    // ── Therapists approval queue ──────────────────────────────────────────
    var THERAPIST_FOCUS = {
      couple: '伴侶關係', family: '家庭', childhood: '童年/原生家庭',
      individual: '個人成長', sexuality: '性與親密', parenting: '親職教養',
      grief: '悲傷失落', anxiety: '焦慮憂鬱', depression: '憂鬱情緒',
      trauma: '創傷', addiction: '成癮', lgbtq: '性別與多元認同',
      career: '職涯/工作壓力', self_esteem: '自我價值'
    };
    var IDENTITY_STATUS = {
      unverified: '未提交', submitted: '待審核', verified: '已驗證', rejected: '已退回'
    };
    function esc(s) {
      return (s == null ? '' : String(s)).replace(/[<>&]/g, function (c) {
        return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c];
      });
    }

    async function loadTherapists() {
      var status = $('therapistStatus').value;
      $('therapistStatusMsg').textContent = '載入中…';
      try {
        var res = await fetch('/api/admin/therapists?status=' + encodeURIComponent(status));
        if (!res.ok) throw new Error('therapists ' + res.status);
        var body = await res.json();
        renderTherapists(body.therapists || [], status);
        $('therapistStatusMsg').textContent = '更新於 ' + new Date().toLocaleTimeString('zh-TW');
      } catch (e) {
        $('therapistStatusMsg').textContent = '載入失敗: ' + e.message;
      }
    }

    function renderTherapists(rows, status) {
      var tbody = document.querySelector('#therapistsTable tbody');
      if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="muted">沒有資料</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(function (t) {
        var focus = (t.focus_areas || []).map(function (f) {
          return '<span class="pill">' + esc(THERAPIST_FOCUS[f] || f) + '</span>';
        }).join(' ');
        var custom = (t.custom_specialties || []).map(function (f) {
          return '<span class="pill">' + esc(f) + '</span>';
        }).join(' ');
        var contact = esc(t.contact_email || '—') +
          (t.license_no ? '<div class="muted" style="font-size:11px">證照: ' + esc(t.license_no) + '</div>' : '');

        // Email verification + uploaded credential documents.
        var emailBadge = t.email_verified
          ? '<span class="badge yes">Email 已驗證</span>'
          : '<span class="badge no">Email 未驗證</span>';
        var docs = (t.identity_documents || []).map(function (u, i) {
          return '<a href="' + esc(u) + '" target="_blank" rel="noopener">文件' + (i + 1) + '</a>';
        }).join(' · ');
        var idStatus = '<div class="muted" style="font-size:11px;margin-top:3px">身分: ' +
          esc(IDENTITY_STATUS[t.identity_status] || t.identity_status || '—') + '</div>';
        var idActions = (t.identity_documents && t.identity_documents.length)
          ? '<div style="margin-top:4px"><button data-idact="verify" data-id="' + t.id + '">驗證身分</button> ' +
            '<button data-idact="reject" data-id="' + t.id + '">退回文件</button></div>'
          : '';
        var verifyCell = emailBadge + '<div style="font-size:11px;margin-top:3px">' + (docs || '<span class="muted">無文件</span>') + '</div>' + idStatus + idActions;

        // Status-dependent moderation actions. Approved → suspend/delete;
        // suspended → reactivate/delete; pending → approve/reject; rejected →
        // approve (give a second chance) / delete.
        var actions;
        if (status === 'pending') {
          actions = '<button data-act="approve" data-id="' + t.id + '">通過</button> ' +
            '<button data-act="reject" data-id="' + t.id + '">退回</button>';
        } else if (status === 'approved') {
          actions = '<button data-act="suspend" data-id="' + t.id + '">暫停</button> ' +
            '<button data-act="delete" data-id="' + t.id + '" data-name="' + esc(t.display_name) + '">刪除</button>';
        } else if (status === 'suspended') {
          actions = '<button data-act="reactivate" data-id="' + t.id + '">恢復上架</button> ' +
            '<button data-act="delete" data-id="' + t.id + '" data-name="' + esc(t.display_name) + '">刪除</button>';
        } else { // rejected
          actions = '<button data-act="approve" data-id="' + t.id + '">通過</button> ' +
            '<button data-act="delete" data-id="' + t.id + '" data-name="' + esc(t.display_name) + '">刪除</button>';
        }
        return '<tr>' +
          '<td><div>' + esc(t.display_name) + '</div><div class="muted" style="font-size:11px">' + esc(t.title || '') + '</div></td>' +
          '<td>' + focus + (custom ? '<div style="margin-top:4px">' + custom + '</div>' : '') + '</td>' +
          '<td class="num">NT$' + (t.rate_twd || 0).toLocaleString() + ' / ' + (t.session_minutes || 50) + '分</td>' +
          '<td>' + contact + '</td>' +
          '<td>' + verifyCell + '</td>' +
          '<td>' + fmtDate(t.created_at) + '</td>' +
          '<td>' + actions + '</td>' +
          '</tr>';
      }).join('');

      tbody.querySelectorAll('button[data-act]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var act = btn.getAttribute('data-act');
          if (act === 'delete') {
            deleteTherapist(btn.getAttribute('data-id'), btn.getAttribute('data-name'), btn);
          } else {
            reviewTherapist(btn.getAttribute('data-id'), act, btn);
          }
        });
      });
      tbody.querySelectorAll('button[data-idact]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          verifyIdentity(btn.getAttribute('data-id'), btn.getAttribute('data-idact'), btn);
        });
      });
    }

    async function reviewTherapist(id, act, btn) {
      btn.disabled = true;
      try {
        var res = await fetch('/api/admin/therapists/' + id + '/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: act })
        });
        if (!res.ok) throw new Error('review ' + res.status);
        await loadTherapists();
      } catch (e) {
        btn.disabled = false;
        $('therapistStatusMsg').textContent = '操作失敗: ' + e.message;
      }
    }

    async function verifyIdentity(id, act, btn) {
      btn.disabled = true;
      try {
        var res = await fetch('/api/admin/therapists/' + id + '/verify-identity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: act })
        });
        if (!res.ok) throw new Error('verify ' + res.status);
        await loadTherapists();
      } catch (e) {
        btn.disabled = false;
        $('therapistStatusMsg').textContent = '操作失敗: ' + e.message;
      }
    }

    async function deleteTherapist(id, name, btn) {
      if (!window.confirm('確定要永久刪除諮商師「' + (name || '') + '」嗎？此動作無法復原。\n（若只是想暫時下架，請改用「暫停」。）')) return;
      btn.disabled = true;
      try {
        var res = await fetch('/api/admin/therapists/' + id, { method: 'DELETE' });
        if (!res.ok) throw new Error('delete ' + res.status);
        await loadTherapists();
      } catch (e) {
        btn.disabled = false;
        $('therapistStatusMsg').textContent = '刪除失敗: ' + e.message;
      }
    }

    $('therapistRefresh').addEventListener('click', loadTherapists);
    $('therapistStatus').addEventListener('change', loadTherapists);
    // Lazy-load the queue the first time the tab is opened.
    var therapistsLoaded = false;
    document.querySelectorAll('.tab').forEach(function (btn) {
      if (btn.getAttribute('data-panel') === 'therapists') {
        btn.addEventListener('click', function () {
          if (!therapistsLoaded) { therapistsLoaded = true; loadTherapists(); }
        });
      }
    });

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

  // page_views shares the same retention setting — we keep raw per-view rows
  // for the analytics window, then drop. Aggregates that need longer history
  // can be precomputed before the purge runs.
  try {
    const result = await db.query(
      `DELETE FROM page_views
        WHERE entered_at < NOW() - ($1 || ' days')::interval`,
      [String(LANDING_VISITS_RETENTION_DAYS)]
    );
    if (result.rowCount > 0) {
      logInfo('page_views retention purge', {
        deleted: result.rowCount,
        retentionDays: LANDING_VISITS_RETENTION_DAYS,
      });
    }
  } catch (err) {
    logWarn('page_views retention purge failed', { err: err.message });
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
