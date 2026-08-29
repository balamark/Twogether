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
const featureFlags = require('../lib/featureFlags');
// For ensureAiFeedbackTable() — guarantees the curation columns exist before the
// AI down-vote endpoints read/update them (no cycle: ai-feedback never requires admin).
const aiFeedbackRoutes = require('./ai-feedback');

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
// Public: client diagnostics beacon. The frontend posts structured events here
// (render crashes, swallowed load failures, key successes) so they land in
// Cloud Logging as `client.<event>` entries — making frontend issues
// diagnosable with `gcloud logging read` instead of guesswork. optionalAuth
// attributes the event to a logged-in user when a JWT is present. The client
// echoes the backend `X-Request-Id` it last saw, so a UI failure links to the
// exact backend trace that served it.
// ──────────────────────────────────────────────────────────────────────────

const RL_MAX_CLIENT_LOG = 60;
const CLIENT_LOG_LEVELS = new Set(['info', 'warn', 'error']);

publicRouter.post('/track/client-log', express.json({ type: '*/*' }), optionalAuth, (req, res) => {
  const ip = req.ip || null;
  if (rateLimitExceeded('client-log', ip, RL_MAX_CLIENT_LOG)) {
    return res.status(204).end();
  }

  const body = req.body || {};
  const event = typeof body.event === 'string' ? body.event.slice(0, 80) : null;
  if (!event) return res.status(204).end();

  const level = CLIENT_LOG_LEVELS.has(body.level) ? body.level : 'info';
  const clientRequestId = typeof body.requestId === 'string' ? body.requestId.slice(0, 128) : null;

  // Keep `data` small and string-bounded so a client can't bloat logs.
  let data = {};
  if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
    for (const [k, v] of Object.entries(body.data).slice(0, 20)) {
      data[String(k).slice(0, 40)] = typeof v === 'string' ? v.slice(0, 500) : v;
    }
  }

  const fields = {
    userId: (req.user && req.user.id) || null,
    ip,
    clientRequestId,
    userAgent: req.get('User-Agent'),
    ...data,
  };

  const log = level === 'error' ? logError : level === 'warn' ? logWarn : logInfo;
  log(`client.${event}`, fields);

  res.status(204).end();
});

// ──────────────────────────────────────────────────────────────────────────
// Public: feature flags. The frontend reads this on load to decide which
// admin-gated UI experiments to show. No auth — it only exposes on/off bits,
// never anything sensitive. Cached server-side (lib/featureFlags) so frequent
// polling is cheap.
// ──────────────────────────────────────────────────────────────────────────
publicRouter.get('/feature-flags', async (req, res) => {
  try {
    const flags = await featureFlags.getPublicFlags();
    // Short cache so a flag flip propagates within ~30s without re-querying
    // the DB on every page load.
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ flags });
  } catch (err) {
    logWarn('public feature-flags read failed', { err: err.message });
    res.json({ flags: {} });
  }
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

// Roleplay invitation insights: per-script generation cache + thumb feedback,
// plus a recent-feedback feed. Resilient to a not-yet-migrated DB (returns
// empty rather than 500 if the tables don't exist).
adminApiRouter.get('/roleplay-invitations', async (req, res) => {
  try {
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50), 200);

    // Per-script roll-up: cached generation + up/down feedback counts. FULL OUTER
    // JOIN so scripts that only have feedback (no cache row) still appear.
    const scriptsQ = await db.query(
      `WITH fb AS (
         SELECT script_id,
                MAX(script_title) AS script_title,
                COUNT(*) FILTER (WHERE rating = 'up')::int   AS ups,
                COUNT(*) FILTER (WHERE rating = 'down')::int AS downs,
                COUNT(*) FILTER (WHERE feedback_text IS NOT NULL AND feedback_text <> '')::int AS comments,
                MAX(created_at) AS last_feedback_at
           FROM roleplay_message_feedback
          GROUP BY script_id
       )
       SELECT
         COALESCE(c.script_id, fb.script_id)        AS script_id,
         COALESCE(c.script_title, fb.script_title)  AS script_title,
         c.category                                 AS category,
         COALESCE(c.gen_count, 0)::int              AS gen_count,
         c.updated_at                               AS generated_at,
         COALESCE(fb.ups, 0)::int                   AS ups,
         COALESCE(fb.downs, 0)::int                 AS downs,
         COALESCE(fb.comments, 0)::int              AS comments,
         fb.last_feedback_at                        AS last_feedback_at,
         c.summary                                  AS summary,
         c.messages                                 AS messages
       FROM roleplay_message_cache c
       FULL OUTER JOIN fb ON fb.script_id = c.script_id
       ORDER BY COALESCE(c.updated_at, fb.last_feedback_at) DESC NULLS LAST
       LIMIT $1`,
      [limit]
    );

    const feedbackQ = await db.query(
      `SELECT f.script_id, f.script_title, f.level, f.message_text, f.rating,
              f.feedback_text, f.created_at, u.nickname, u.email
         FROM roleplay_message_feedback f
         LEFT JOIN users u ON u.id = f.user_id
        ORDER BY f.created_at DESC
        LIMIT $1`,
      [limit]
    );

    res.json({ scripts: scriptsQ.rows, feedback: feedbackQ.rows });
  } catch (err) {
    // Tables may not exist yet on a fresh DB — surface as empty, not an error.
    logWarn('Admin roleplay-invitations query failed', { err: err.message });
    res.json({ scripts: [], feedback: [] });
  }
});

// AI/LLM usage + estimated cost across ALL scenarios (icebreaker, reply
// rewrite, roleplay messages, wall counselor, and any future kind). Aggregated
// from event_ai_usage; cost_usd is the estimated cost computed at call time.
adminApiRouter.get('/ai-usage', async (req, res) => {
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

    // Shared range filter: created_at in [from, to] inclusive. The aliased
    // variant is for the topUsers query, which joins users (also has a
    // created_at column) so the bare name would be ambiguous.
    const range = `created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')`;
    const rangeE = `e.created_at >= $1::date AND e.created_at < ($2::date + INTERVAL '1 day')`;
    const params = [from, to];

    const [totalsQ, byKindQ, byModelQ, dailyQ, topUsersQ] = await Promise.all([
      db.query(
        `SELECT
           COUNT(*)::int                       AS calls,
           COALESCE(SUM(cost_usd), 0)::float8  AS total_cost_usd,
           COALESCE(SUM(input_tokens), 0)::int  AS input_tokens,
           COALESCE(SUM(output_tokens), 0)::int AS output_tokens,
           COUNT(DISTINCT user_id)::int         AS unique_users
         FROM event_ai_usage WHERE ${range}`,
        params
      ),
      db.query(
        `SELECT
           kind,
           COUNT(*)::int                        AS calls,
           COALESCE(SUM(cost_usd), 0)::float8   AS total_cost_usd,
           COALESCE(SUM(input_tokens), 0)::int  AS input_tokens,
           COALESCE(SUM(output_tokens), 0)::int AS output_tokens,
           COALESCE(AVG(duration_ms), 0)::int   AS avg_duration_ms,
           COUNT(DISTINCT user_id)::int         AS unique_users
         FROM event_ai_usage WHERE ${range}
         GROUP BY kind
         ORDER BY total_cost_usd DESC, calls DESC`,
        params
      ),
      db.query(
        `SELECT
           COALESCE(provider, '—')             AS provider,
           COALESCE(model, '—')                AS model,
           COUNT(*)::int                        AS calls,
           COALESCE(SUM(cost_usd), 0)::float8   AS total_cost_usd
         FROM event_ai_usage WHERE ${range}
         GROUP BY provider, model
         ORDER BY total_cost_usd DESC, calls DESC`,
        params
      ),
      db.query(
        `SELECT
           (created_at AT TIME ZONE 'UTC')::date AS day,
           COUNT(*)::int                          AS calls,
           COALESCE(SUM(cost_usd), 0)::float8     AS daily_cost_usd
         FROM event_ai_usage WHERE ${range}
         GROUP BY day
         ORDER BY day DESC`,
        params
      ),
      db.query(
        `SELECT
           u.email, u.nickname,
           COUNT(*)::int                        AS calls,
           COALESCE(SUM(e.cost_usd), 0)::float8 AS total_cost_usd,
           MAX(e.created_at)                    AS last_call
         FROM event_ai_usage e
         JOIN users u ON u.id = e.user_id
         WHERE ${rangeE}
         GROUP BY u.id, u.email, u.nickname
         ORDER BY total_cost_usd DESC, calls DESC
         LIMIT 20`,
        params
      ),
    ]);

    res.json({
      window: { from, to },
      totals: totalsQ.rows[0] || {},
      byKind: byKindQ.rows,
      byModel: byModelQ.rows,
      daily: dailyQ.rows,
      topUsers: topUsersQ.rows,
    });
  } catch (err) {
    // Table may not exist on a fresh DB — surface as empty, not an error.
    logWarn('Admin ai-usage query failed', { err: err.message });
    res.json({ window: {}, totals: {}, byKind: [], byModel: [], daily: [], topUsers: [] });
  }
});

// ── User feedback ("用戶心得") moderation ────────────────────────────────────
// GET /api/admin/feedback?status=pending — moderation queue.
adminApiRouter.get('/feedback', async (req, res) => {
  const status = ['pending', 'approved', 'hidden'].includes(req.query.status)
    ? req.query.status
    : 'pending';
  try {
    const result = await db.query(
      `SELECT f.id, f.display_name, f.rating, f.body, f.status, f.created_at,
              u.email AS user_email
         FROM user_feedback f
         LEFT JOIN users u ON u.id = f.user_id
        WHERE f.status = $1
        ORDER BY f.created_at DESC
        LIMIT 200`,
      [status]
    );
    res.json({ feedback: result.rows });
  } catch (err) {
    // Table may not exist yet on a fresh DB — surface as empty, not an error.
    logWarn('Admin feedback query failed', { err: err.message });
    res.json({ feedback: [] });
  }
});

// POST /api/admin/feedback/:id/moderate { action: 'approve' | 'hide' }
adminApiRouter.post('/feedback/:id/moderate', express.json(), async (req, res) => {
  const { action } = req.body || {};
  const nextStatus = action === 'approve' ? 'approved' : action === 'hide' ? 'hidden' : null;
  if (!nextStatus) {
    return res.status(400).json({ error: "action must be 'approve' or 'hide'" });
  }
  try {
    const result = await db.query(
      `UPDATE user_feedback
          SET status = $1, reviewed_at = NOW()
        WHERE id = $2
        RETURNING id, status`,
      [nextStatus, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'feedback not found' });
    }
    res.json({ success: true, feedback: result.rows[0] });
  } catch (err) {
    logError('Admin feedback moderate failed', { err: err.message, id: req.params.id });
    res.status(500).json({ error: 'moderate failed' });
  }
});

// ── AI response down-votes → judge curation ("AI 負評") ──────────────────────
// List recent 👎 on AI responses (情緒翻譯 / AI 諮商師) so an admin can confirm
// which are genuine bad cases and promote them into the reflection judge's
// negative examples (Phase 2). GET /api/admin/ai-downvotes?surface=&limit=
adminApiRouter.get('/ai-downvotes', async (req, res) => {
  const surface = ['emotion_translation', 'counselor'].includes(req.query.surface)
    ? req.query.surface
    : null;
  const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 100), 200);
  try {
    await aiFeedbackRoutes.ensureAiFeedbackTable();
    const params = [];
    let where = "f.rating = 'down'";
    if (surface) {
      params.push(surface);
      where += ` AND f.surface = $${params.length}`;
    }
    params.push(limit);
    const result = await db.query(
      `SELECT f.id, f.surface, f.reference_id, f.message_text, f.feedback_text,
              f.context_snapshot, f.curated_negative, f.curated_note, f.curated_at,
              f.created_at, u.email AS user_email
         FROM ai_response_feedback f
         LEFT JOIN users u ON u.id = f.user_id
        WHERE ${where}
        ORDER BY f.created_at DESC
        LIMIT $${params.length}`,
      params
    );
    res.json({ downvotes: result.rows });
  } catch (err) {
    // Table may not exist yet on a fresh DB — surface as empty, not an error.
    logWarn('Admin ai-downvotes query failed', { err: err.message });
    res.json({ downvotes: [] });
  }
});

// POST /api/admin/ai-downvotes/:id/curate { curated: boolean, note?: string }
// Promote (or un-promote) a down-vote as a negative example for the judge. Only
// the admin-authored `note` (never the raw user feedback_text) can reach the
// judge prompt, so this endpoint is the trust boundary for that loop.
adminApiRouter.post('/ai-downvotes/:id/curate', express.json(), async (req, res) => {
  const id = req.params.id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: 'invalid id' });
  }
  const { curated } = req.body || {};
  if (typeof curated !== 'boolean') {
    return res.status(400).json({ error: 'curated must be a boolean' });
  }
  const note =
    curated && typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 200) : null;
  try {
    await aiFeedbackRoutes.ensureAiFeedbackTable();
    const result = await db.query(
      `UPDATE ai_response_feedback
          SET curated_negative = $1,
              curated_note = $2,
              curated_at = CASE WHEN $1 THEN NOW() ELSE NULL END
        WHERE id = $3
        RETURNING id, curated_negative, curated_note`,
      [curated, note, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'down-vote not found' });
    }
    logInfo('admin.ai_downvote.curated', { id, curated });
    res.json({ success: true, downvote: result.rows[0] });
  } catch (err) {
    logError('Admin ai-downvote curate failed', { err: err.message, id });
    res.status(500).json({ error: 'curate failed' });
  }
});

// GET /api/admin/feature-flags — list every known flag with its label +
// description + current on/off state for the dashboard toggles.
adminApiRouter.get('/feature-flags', async (req, res) => {
  try {
    const flags = await featureFlags.listFlags();
    res.json({ flags });
  } catch (err) {
    logError('Admin feature-flags list failed', { err: err.message });
    res.status(500).json({ error: 'feature-flags list failed' });
  }
});

// POST /api/admin/feature-flags/:key { enabled: boolean } — flip a flag.
adminApiRouter.post('/feature-flags/:key', express.json(), async (req, res) => {
  const key = req.params.key;
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled (boolean) is required' });
  }
  try {
    const next = await featureFlags.setFlag(key, enabled);
    res.json({ success: true, key, enabled: next });
  } catch (err) {
    if (err.code === 'UNKNOWN_FLAG') {
      return res.status(404).json({ error: 'unknown feature flag: ' + key });
    }
    logError('Admin feature-flag update failed', { err: err.message, key });
    res.status(500).json({ error: 'feature-flag update failed' });
  }
});

// DELETE /api/admin/users/:id — permanently delete an account (e.g. a stray test
// account) so it stops polluting the dashboard. Cascades to the user's couple +
// all couple-scoped data via the ON DELETE CASCADE foreign keys. Irreversible.
adminApiRouter.delete('/users/:id', async (req, res) => {
  const id = req.params.id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: 'invalid user id' });
  }
  try {
    const result = await db.query(`DELETE FROM users WHERE id = $1 RETURNING email`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'user not found' });
    }
    logInfo('admin.user.deleted', { id, email: result.rows[0].email });
    res.json({ success: true, email: result.rows[0].email });
  } catch (err) {
    logError('Admin delete user failed', { err: err.message, id });
    res.status(500).json({ error: 'delete failed' });
  }
});

// ── Coupons ("優惠碼") ──────────────────────────────────────────────────────
// Free-Premium coupon codes (see database/migrations/043_coupons.sql). Full
// CRUD for the admin dashboard: list every coupon (including inactive/expired
// ones, so nothing is hidden), create, edit any field, and delete.

const COUPON_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COUPON_FIELDS =
  'id, code, days, max_redemptions, redeemed_count, expires_at, active, note, created_at';

// GET /api/admin/coupons — every coupon, newest first.
adminApiRouter.get('/coupons', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ${COUPON_FIELDS} FROM coupons ORDER BY created_at DESC`
    );
    res.json({ coupons: result.rows });
  } catch (err) {
    // Table may not exist yet on a fresh DB — surface as empty, not an error.
    logWarn('Admin coupons list failed', { err: err.message });
    res.json({ coupons: [] });
  }
});

// POST /api/admin/coupons { code, days, max_redemptions?, expires_at?, note? }
adminApiRouter.post('/coupons', express.json(), async (req, res) => {
  const body = req.body || {};
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase().slice(0, 40) : '';
  const days = parseInt(body.days, 10);
  if (!code) return res.status(400).json({ error: '請輸入優惠碼代碼' });
  if (!Number.isFinite(days) || days <= 0) return res.status(400).json({ error: '天數需為正整數' });

  const maxRedemptions =
    body.max_redemptions === '' || body.max_redemptions === null || body.max_redemptions === undefined
      ? null
      : parseInt(body.max_redemptions, 10);
  if (maxRedemptions !== null && (!Number.isFinite(maxRedemptions) || maxRedemptions < 0)) {
    return res.status(400).json({ error: '兌換上限需為非負整數' });
  }

  const expiresAt = body.expires_at ? new Date(body.expires_at) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return res.status(400).json({ error: '到期日格式錯誤' });
  }

  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null;

  try {
    const result = await db.query(
      `INSERT INTO coupons (code, days, max_redemptions, expires_at, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${COUPON_FIELDS}`,
      [code, days, maxRedemptions, expiresAt, note]
    );
    logInfo('admin.coupon.created', { id: result.rows[0].id, code, days });
    res.json({ success: true, coupon: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: '這組優惠碼代碼已經存在' });
    }
    logError('Admin coupon create failed', { err: err.message, code });
    res.status(500).json({ error: '建立失敗，請稍後再試' });
  }
});

// PATCH /api/admin/coupons/:id — partial update; only provided fields change.
adminApiRouter.patch('/coupons/:id', express.json(), async (req, res) => {
  const id = req.params.id;
  if (!COUPON_ID_RE.test(id)) {
    return res.status(400).json({ error: 'invalid coupon id' });
  }
  const body = req.body || {};
  const sets = [];
  const params = [];
  let idx = 1;

  if (body.code !== undefined) {
    const code = String(body.code).trim().toUpperCase().slice(0, 40);
    if (!code) return res.status(400).json({ error: '優惠碼代碼不可為空' });
    sets.push('code = $' + idx++);
    params.push(code);
  }
  if (body.days !== undefined) {
    const days = parseInt(body.days, 10);
    if (!Number.isFinite(days) || days <= 0) return res.status(400).json({ error: '天數需為正整數' });
    sets.push('days = $' + idx++);
    params.push(days);
  }
  if (body.max_redemptions !== undefined) {
    const mr = body.max_redemptions === '' || body.max_redemptions === null ? null : parseInt(body.max_redemptions, 10);
    if (mr !== null && (!Number.isFinite(mr) || mr < 0)) {
      return res.status(400).json({ error: '兌換上限需為非負整數' });
    }
    sets.push('max_redemptions = $' + idx++);
    params.push(mr);
  }
  if (body.expires_at !== undefined) {
    const exp = body.expires_at === '' || body.expires_at === null ? null : new Date(body.expires_at);
    if (exp && Number.isNaN(exp.getTime())) return res.status(400).json({ error: '到期日格式錯誤' });
    sets.push('expires_at = $' + idx++);
    params.push(exp);
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') return res.status(400).json({ error: 'active 需為布林值' });
    sets.push('active = $' + idx++);
    params.push(body.active);
  }
  if (body.note !== undefined) {
    const note = body.note === null || body.note === '' ? null : String(body.note).trim().slice(0, 500);
    sets.push('note = $' + idx++);
    params.push(note);
  }

  if (sets.length === 0) {
    return res.status(400).json({ error: '沒有可更新的欄位' });
  }
  params.push(id);

  try {
    const result = await db.query(
      `UPDATE coupons SET ${sets.join(', ')} WHERE id = $${idx} RETURNING ${COUPON_FIELDS}`,
      params
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'coupon not found' });
    }
    logInfo('admin.coupon.updated', { id, fields: Object.keys(body) });
    res.json({ success: true, coupon: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: '這組優惠碼代碼已經存在' });
    }
    logError('Admin coupon update failed', { err: err.message, id });
    res.status(500).json({ error: '更新失敗，請稍後再試' });
  }
});

// DELETE /api/admin/coupons/:id — cascades to coupon_redemptions (ON DELETE
// CASCADE) but never touches couple_entitlements, so Premium time already
// granted from a past redemption is unaffected. Irreversible.
adminApiRouter.delete('/coupons/:id', async (req, res) => {
  const id = req.params.id;
  if (!COUPON_ID_RE.test(id)) {
    return res.status(400).json({ error: 'invalid coupon id' });
  }
  try {
    const result = await db.query(`DELETE FROM coupons WHERE id = $1 RETURNING code`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'coupon not found' });
    }
    logInfo('admin.coupon.deleted', { id, code: result.rows[0].code });
    res.json({ success: true, code: result.rows[0].code });
  } catch (err) {
    logError('Admin coupon delete failed', { err: err.message, id });
    res.status(500).json({ error: 'delete failed' });
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
    button.danger {
      font: inherit; padding: 4px 10px; border: 0; border-radius: 6px;
      background: #b7635a; color: #fff; cursor: pointer;
    }
    button.danger:hover { background: #9c5049; }
    button.danger:disabled { opacity: .5; cursor: default; }
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
    .tabs { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid #ece6e1; margin: 20px 0 16px; }
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
      <button class="tab" data-panel="reviews">評價</button>
      <button class="tab" data-panel="feedback">用戶心得</button>
      <button class="tab" data-panel="stories">真實故事</button>
      <button class="tab" data-panel="polls">投票心聲</button>
      <button class="tab" data-panel="pool">分潤</button>
      <button class="tab" data-panel="coupons">優惠碼</button>
      <button class="tab" data-panel="roleplay">邀請劇本</button>
      <button class="tab" data-panel="ai-usage">AI 用量</button>
      <button class="tab" data-panel="ai-downvotes">AI 負評</button>
      <button class="tab" data-panel="flags">功能開關</button>
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
            <th>操作</th>
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

    <!-- Panel: Reviews (moderation) -->
    <div class="panel" id="panel-reviews">
      <p class="sub">客戶評價審核。通過後才會顯示在諮商師的公開檔案。</p>
      <div class="controls">
        <label>狀態
          <select id="reviewStatus">
            <option value="pending">待審核</option>
            <option value="approved">已通過</option>
            <option value="hidden">已隱藏</option>
          </select>
        </label>
        <button id="reviewRefresh">重新整理</button>
        <span class="muted" id="reviewStatusMsg"></span>
      </div>
      <div style="overflow-x:auto">
        <table id="reviewsTable">
          <thead>
            <tr><th>諮商師</th><th>評價者</th><th class="num">評分</th><th>內容</th><th>時間</th><th>操作</th></tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <!-- Panel: User feedback ("用戶心得") -->
    <div class="panel" id="panel-feedback">
      <p class="sub">使用者意見回饋審核。通過後才會顯示在未登入首頁「聽聽其他用戶怎麼說」區塊。</p>
      <div class="controls">
        <label>狀態
          <select id="feedbackStatus">
            <option value="pending">待審核</option>
            <option value="approved">已通過</option>
            <option value="hidden">已隱藏</option>
          </select>
        </label>
        <button id="feedbackRefresh">重新整理</button>
        <span class="muted" id="feedbackStatusMsg"></span>
      </div>
      <div style="overflow-x:auto">
        <table id="feedbackTable">
          <thead>
            <tr><th>顯示名稱</th><th>帳號</th><th class="num">評分</th><th>內容</th><th>時間</th><th>操作</th></tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <!-- Panel: AI 負評 → reflection judge curation -->
    <div class="panel" id="panel-ai-downvotes">
      <p class="sub">使用者對 AI 回應（情緒翻譯 / AI 諮商師）按 👎 的紀錄。確認是真的不好的案例後，設為「判官負例」，第二層 AI 判官會把它當成負面示例，之後更會抓同類錯誤。只有你填的「問題說明」會進入判官提示，使用者原文不會。</p>
      <div class="controls">
        <label>類型
          <select id="downvoteSurface">
            <option value="">全部</option>
            <option value="emotion_translation">情緒翻譯</option>
            <option value="counselor">AI 諮商師</option>
          </select>
        </label>
        <button id="downvoteRefresh">重新整理</button>
        <span class="muted" id="downvoteStatusMsg"></span>
      </div>
      <div style="overflow-x:auto">
        <table id="downvoteTable">
          <thead>
            <tr><th>類型</th><th>AI 輸出</th><th>使用者說明</th><th>時間</th><th>問題說明（給判官）</th><th>操作</th></tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <!-- Panel: 真實故事 moderation -->
    <div class="panel" id="panel-stories">
      <p class="sub">真實故事採先發後審：這裡處理檢舉與 AI 毒性標記。隱藏後前台立即 404，可還原。</p>
      <div class="controls">
        <button id="storiesRefresh">重新整理</button>
        <span class="muted" id="storiesStatusMsg"></span>
      </div>
      <h3 style="margin:12px 0 6px">待處理檢舉</h3>
      <div style="overflow-x:auto">
        <table id="storyReportsTable">
          <thead>
            <tr><th>對象</th><th>內容摘錄</th><th>原因</th><th>檢舉者</th><th>時間</th><th>操作</th></tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      <h3 style="margin:16px 0 6px">AI 標記待覆核（已發表）</h3>
      <div style="overflow-x:auto">
        <table id="storyFlaggedTable">
          <thead>
            <tr><th>標題</th><th>標記</th><th>時間</th><th>操作</th></tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <!-- Panel: 投票心聲 moderation -->
    <div class="panel" id="panel-polls">
      <p class="sub">社群投票的「心聲」留言檢舉。隱藏後前台立即消失，可還原。</p>
      <div class="controls">
        <button id="pollsRefresh">重新整理</button>
        <span class="muted" id="pollsStatusMsg"></span>
      </div>
      <div style="overflow-x:auto">
        <table id="pollVoiceReportsTable">
          <thead>
            <tr><th>投票題目</th><th>心聲內容</th><th>原因</th><th>檢舉者</th><th>時間</th><th>操作</th></tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <!-- Panel: Q&A revenue pool -->
    <div class="panel" id="panel-pool">
      <p class="sub">每月問答分潤池。設定金額後計算各諮商師分潤，結算後逐一標記撥款（平台不會自動轉帳）。</p>
      <div class="controls">
        <label>月份 <input type="month" id="poolMonth"></label>
        <label>金額 (NT$) <input type="number" id="poolAmount" min="0" step="1" style="width:120px"></label>
        <label>分配方式
          <select id="poolStrategy">
            <option value="even">平均分配</option>
            <option value="volume">依回覆量</option>
            <option value="engagement">依參與度</option>
          </select>
        </label>
        <button id="poolCreate">建立／更新</button>
        <span class="muted" id="poolStatusMsg"></span>
      </div>
      <div style="overflow-x:auto">
        <table id="poolsTable">
          <thead>
            <tr><th>月份</th><th class="num">金額</th><th>分配方式</th><th>狀態</th><th class="num">人數</th><th class="num">已分配</th><th>操作</th></tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      <div id="poolDetail" hidden style="margin-top:20px">
        <h3 style="margin:0 0 8px;font-weight:500;font-size:14px" id="poolDetailTitle">分潤明細</h3>
        <div style="overflow-x:auto">
          <table id="sharesTable">
            <thead>
              <tr><th>諮商師</th><th class="num">回覆</th><th class="num">公開</th><th class="num">讚</th><th class="num">權重</th><th class="num">分潤</th><th>撥款</th><th>操作</th></tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Panel: Coupons ("優惠碼") -->
    <div class="panel" id="panel-coupons">
      <p class="sub">優惠碼可讓情侶免費兌換一段時間的 Premium（見 database/migrations/043_coupons.sql）。停用或刪除不影響已發放的 Premium 天數，只是讓代碼無法再被兌換。</p>
      <div class="controls" style="align-items:flex-end">
        <label>代碼<br><input type="text" id="couponCode" placeholder="WELCOME30" style="text-transform:uppercase" maxlength="40"></label>
        <label>天數<br><input type="number" id="couponDays" min="1" step="1" value="30" style="width:90px"></label>
        <label>兌換上限<br><input type="number" id="couponMax" min="0" step="1" placeholder="不限" style="width:100px"></label>
        <label>到期日<br><input type="date" id="couponExpires"></label>
        <label>備註<br><input type="text" id="couponNote" placeholder="選填" style="width:200px"></label>
        <button id="couponSubmit">建立</button>
        <button id="couponCancelEdit" hidden>取消編輯</button>
        <span class="muted" id="couponStatusMsg"></span>
      </div>
      <div style="overflow-x:auto">
        <table id="couponsTable">
          <thead>
            <tr>
              <th>代碼</th>
              <th class="num">天數</th>
              <th class="num">已兌換 / 上限</th>
              <th>到期日</th>
              <th>狀態</th>
              <th>備註</th>
              <th>建立時間</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <!-- Panel: Roleplay invitations -->
    <div class="panel" id="panel-roleplay">
      <p class="sub">每個劇本被 AI 生成幾次邀請訊息、收到多少 👍 / 👎，以及最近的訊息回饋。</p>
      <div style="overflow-x:auto">
        <table id="roleplayScriptsTable">
          <thead>
            <tr>
              <th>劇本</th>
              <th>分類</th>
              <th class="num">生成次數</th>
              <th class="num">👍</th>
              <th class="num">👎</th>
              <th class="num">文字回饋</th>
              <th>最後更新</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>

      <h3 style="margin:20px 0 6px;font-weight:500;font-size:14px">最近訊息回饋</h3>
      <p class="sub">使用者對單一 AI 訊息的 👍 / 👎 與文字回饋（最新在前）。</p>
      <div style="overflow-x:auto">
        <table id="roleplayFeedbackTable">
          <thead>
            <tr>
              <th>時間</th>
              <th>劇本</th>
              <th>強度</th>
              <th>評價</th>
              <th>訊息</th>
              <th>文字回饋</th>
              <th>使用者</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <!-- Panel: AI usage (estimated cost, all scenarios) -->
    <div class="panel" id="panel-ai-usage">
      <p class="sub">所有 AI 場景的呼叫量與<strong>估算成本</strong>（USD）。估算成本依各模型定價於呼叫當下計算；mock 供應商為 $0。套用上方日期區間後重新整理。</p>
      <div class="funnel" id="aiUsageCards"></div>

      <h3 style="margin:24px 0 6px;font-weight:500;font-size:14px">各場景用量</h3>
      <div style="overflow-x:auto">
        <table id="aiUsageKindTable">
          <thead>
            <tr>
              <th>場景</th>
              <th class="num">呼叫次數</th>
              <th class="num">估算成本</th>
              <th class="num">輸入 tokens</th>
              <th class="num">輸出 tokens</th>
              <th class="num">平均耗時</th>
              <th class="num">不重複使用者</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>

      <h3 style="margin:20px 0 6px;font-weight:500;font-size:14px">供應商 / 模型</h3>
      <div style="overflow-x:auto">
        <table id="aiUsageModelTable">
          <thead>
            <tr>
              <th>供應商</th>
              <th>模型</th>
              <th class="num">呼叫次數</th>
              <th class="num">估算成本</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>

      <h3 style="margin:20px 0 6px;font-weight:500;font-size:14px">每日趨勢</h3>
      <div style="overflow-x:auto">
        <table id="aiUsageDailyTable">
          <thead>
            <tr>
              <th>日期</th>
              <th class="num">呼叫次數</th>
              <th class="num">估算成本</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>

      <h3 style="margin:20px 0 6px;font-weight:500;font-size:14px">用量最高的使用者（前 20）</h3>
      <div style="overflow-x:auto">
        <table id="aiUsageUsersTable">
          <thead>
            <tr>
              <th>Email / 暱稱</th>
              <th class="num">呼叫次數</th>
              <th class="num">估算成本</th>
              <th>最後呼叫</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <div class="panel" id="panel-flags">
      <p class="sub">功能開關 — 把實驗性的 UI 藏在開關後面，在這裡即時開啟 / 關閉，不必重新部署。前端約 30 秒內生效。</p>
      <div id="flagsStatusMsg" class="muted" style="font-size:12px;margin-bottom:10px"></div>
      <div style="overflow-x:auto">
        <table id="flagsTable">
          <thead>
            <tr>
              <th>功能</th>
              <th>說明</th>
              <th class="num">狀態</th>
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
    function fmtUsd(x) {
      if (x === null || x === undefined) return '—';
      var n = Number(x);
      if (!isFinite(n)) return '—';
      // Sub-cent costs are common with Haiku — show 4 dp so they don't vanish.
      return '$' + n.toFixed(4);
    }
    var AI_KIND_LABELS = {
      icebreaker: '破冰整理',
      reply_rewrite: '回覆改寫',
      roleplay_messages: '邀請劇本',
      wall_counselor: '牆 · AI 諮商',
      reconciliation_opener: '和解開場白',
    };
    function kindLabel(k) { return AI_KIND_LABELS[k] || (k || '—'); }
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
        tbody.innerHTML = '<tr><td colspan="8" class="muted">沒有資料</td></tr>';
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
          '<td><button class="danger" data-del-user data-id="' + u.id + '" data-email="' + email + '">刪除</button></td>' +
          '</tr>';
      }).join('');
      tbody.querySelectorAll('button[data-del-user]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          deleteUser(btn.getAttribute('data-id'), btn.getAttribute('data-email'), btn);
        });
      });
    }

    async function deleteUser(id, email, btn) {
      if (!confirm('永久刪除帳號「' + email + '」？\\n\\n會一併刪除其配對、紀錄、訊息等所有資料，且無法復原。')) return;
      btn.disabled = true;
      btn.textContent = '刪除中…';
      try {
        const res = await fetch('/api/admin/users/' + id, { method: 'DELETE' });
        if (!res.ok) throw new Error('delete ' + res.status);
        load(); // refresh funnel + the recent-users table
      } catch (e) {
        btn.disabled = false;
        btn.textContent = '刪除';
        alert('刪除失敗：' + e.message);
      }
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
      if (!window.confirm('確定要永久刪除諮商師「' + (name || '') + '」嗎？此動作無法復原。\\n（若只是想暫時下架，請改用「暫停」。）')) return;
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

    // ── Reviews moderation ─────────────────────────────────────────────────
    async function loadReviews() {
      var status = $('reviewStatus').value;
      $('reviewStatusMsg').textContent = '載入中…';
      try {
        var res = await fetch('/api/admin/therapists/reviews?status=' + encodeURIComponent(status));
        if (!res.ok) throw new Error('reviews ' + res.status);
        var body = await res.json();
        renderReviews(body.reviews || [], status);
        $('reviewStatusMsg').textContent = '更新於 ' + new Date().toLocaleTimeString('zh-TW');
      } catch (e) { $('reviewStatusMsg').textContent = '載入失敗: ' + e.message; }
    }
    function renderReviews(rows, status) {
      var tbody = document.querySelector('#reviewsTable tbody');
      if (rows.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="muted">沒有資料</td></tr>'; return; }
      tbody.innerHTML = rows.map(function (r) {
        var actions = status === 'approved'
          ? '<button data-rev="hide" data-id="' + r.id + '">隱藏</button>'
          : '<button data-rev="approve" data-id="' + r.id + '">通過</button>' +
            (status === 'pending' ? ' <button data-rev="hide" data-id="' + r.id + '">隱藏</button>' : '');
        return '<tr>' +
          '<td>' + esc(r.therapist_name) + '</td>' +
          '<td>' + esc(r.reviewer_display) + '</td>' +
          '<td class="num">' + (r.rating != null ? r.rating + ' ★' : '—') + '</td>' +
          '<td style="max-width:340px">' + esc(r.body) + '</td>' +
          '<td>' + fmtDate(r.created_at) + '</td>' +
          '<td>' + actions + '</td>' +
          '</tr>';
      }).join('');
      tbody.querySelectorAll('button[data-rev]').forEach(function (btn) {
        btn.addEventListener('click', function () { moderateReview(btn.getAttribute('data-id'), btn.getAttribute('data-rev'), btn); });
      });
    }
    async function moderateReview(id, action, btn) {
      btn.disabled = true;
      try {
        var res = await fetch('/api/admin/therapists/reviews/' + id + '/moderate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: action })
        });
        if (!res.ok) throw new Error('moderate ' + res.status);
        await loadReviews();
      } catch (e) { btn.disabled = false; $('reviewStatusMsg').textContent = '操作失敗: ' + e.message; }
    }
    $('reviewRefresh').addEventListener('click', loadReviews);
    $('reviewStatus').addEventListener('change', loadReviews);

    // ── User feedback ("用戶心得") moderation ───────────────────────────────
    async function loadFeedback() {
      var status = $('feedbackStatus').value;
      $('feedbackStatusMsg').textContent = '載入中…';
      try {
        var res = await fetch('/api/admin/feedback?status=' + encodeURIComponent(status));
        if (!res.ok) throw new Error('feedback ' + res.status);
        var body = await res.json();
        renderFeedback(body.feedback || [], status);
        $('feedbackStatusMsg').textContent = '更新於 ' + new Date().toLocaleTimeString('zh-TW');
      } catch (e) { $('feedbackStatusMsg').textContent = '載入失敗: ' + e.message; }
    }
    function renderFeedback(rows, status) {
      var tbody = document.querySelector('#feedbackTable tbody');
      if (rows.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="muted">沒有資料</td></tr>'; return; }
      tbody.innerHTML = rows.map(function (r) {
        var actions = status === 'approved'
          ? '<button data-fb="hide" data-id="' + r.id + '">隱藏</button>'
          : '<button data-fb="approve" data-id="' + r.id + '">通過</button>' +
            (status === 'pending' ? ' <button data-fb="hide" data-id="' + r.id + '">隱藏</button>' : '');
        return '<tr>' +
          '<td>' + esc(r.display_name) + '</td>' +
          '<td>' + esc(r.user_email || '—') + '</td>' +
          '<td class="num">' + (r.rating != null ? r.rating + ' ★' : '—') + '</td>' +
          '<td style="max-width:340px">' + esc(r.body) + '</td>' +
          '<td>' + fmtDate(r.created_at) + '</td>' +
          '<td>' + actions + '</td>' +
          '</tr>';
      }).join('');
      tbody.querySelectorAll('button[data-fb]').forEach(function (btn) {
        btn.addEventListener('click', function () { moderateFeedback(btn.getAttribute('data-id'), btn.getAttribute('data-fb'), btn); });
      });
    }
    async function moderateFeedback(id, action, btn) {
      btn.disabled = true;
      try {
        var res = await fetch('/api/admin/feedback/' + id + '/moderate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: action })
        });
        if (!res.ok) throw new Error('moderate ' + res.status);
        await loadFeedback();
      } catch (e) { btn.disabled = false; $('feedbackStatusMsg').textContent = '操作失敗: ' + e.message; }
    }
    $('feedbackRefresh').addEventListener('click', loadFeedback);
    $('feedbackStatus').addEventListener('change', loadFeedback);

    // AI 負評 → reflection judge curation. Admin confirms real bad cases and
    // promotes them (with an admin-authored 問題說明) into the judge's examples.
    var DV_SURFACE_LABEL = { emotion_translation: '情緒翻譯', counselor: 'AI 諮商師' };
    async function loadDownvotes() {
      var surface = $('downvoteSurface').value;
      $('downvoteStatusMsg').textContent = '載入中…';
      try {
        var res = await fetch('/api/admin/ai-downvotes' + (surface ? '?surface=' + encodeURIComponent(surface) : ''));
        if (!res.ok) throw new Error('ai-downvotes ' + res.status);
        var body = await res.json();
        renderDownvotes(body.downvotes || []);
        $('downvoteStatusMsg').textContent = '更新於 ' + new Date().toLocaleTimeString('zh-TW');
      } catch (e) { $('downvoteStatusMsg').textContent = '載入失敗: ' + e.message; }
    }
    function renderDownvotes(rows) {
      var tbody = document.querySelector('#downvoteTable tbody');
      if (rows.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="muted">沒有資料</td></tr>'; return; }
      tbody.innerHTML = rows.map(function (r) {
        var curated = r.curated_negative === true;
        var noteAttr = esc(r.curated_note || '').replace(/"/g, '&quot;');
        var btn = curated
          ? '<button data-dv="off" data-id="' + r.id + '">取消負例</button>'
          : '<button data-dv="on" data-id="' + r.id + '">設為判官負例</button>';
        return '<tr' + (curated ? ' style="background:#f0fff4"' : '') + '>' +
          '<td>' + esc(DV_SURFACE_LABEL[r.surface] || r.surface) + '</td>' +
          '<td style="max-width:300px">' + esc(r.message_text || '—') + '</td>' +
          '<td style="max-width:220px">' + esc(r.feedback_text || '—') + '</td>' +
          '<td>' + fmtDate(r.created_at) + '</td>' +
          '<td><input type="text" data-note="' + r.id + '" value="' + noteAttr + '" placeholder="例如：把對方的話寫成我的" style="width:200px"></td>' +
          '<td>' + btn + '</td>' +
          '</tr>';
      }).join('');
      tbody.querySelectorAll('button[data-dv]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-id');
          var on = btn.getAttribute('data-dv') === 'on';
          var noteEl = document.querySelector('input[data-note="' + id + '"]');
          curateDownvote(id, on, noteEl ? noteEl.value : '', btn);
        });
      });
    }
    async function curateDownvote(id, curated, note, btn) {
      btn.disabled = true;
      try {
        var res = await fetch('/api/admin/ai-downvotes/' + id + '/curate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ curated: curated, note: note })
        });
        if (!res.ok) throw new Error('curate ' + res.status);
        await loadDownvotes();
      } catch (e) { btn.disabled = false; $('downvoteStatusMsg').textContent = '操作失敗: ' + e.message; }
    }
    $('downvoteRefresh').addEventListener('click', loadDownvotes);
    $('downvoteSurface').addEventListener('change', loadDownvotes);

    // ── 真實故事 moderation ────────────────────────────────────────────────
    async function loadStories() {
      $('storiesStatusMsg').textContent = '載入中…';
      try {
        var repRes = await fetch('/api/admin/stories/reports?status=pending');
        var flagRes = await fetch('/api/admin/stories/flagged');
        if (!repRes.ok || !flagRes.ok) throw new Error('stories ' + repRes.status + '/' + flagRes.status);
        var reports = (await repRes.json()).reports || [];
        var flagged = (await flagRes.json()).stories || [];
        renderStoryReports(reports);
        renderStoryFlagged(flagged);
        $('storiesStatusMsg').textContent = '更新於 ' + new Date().toLocaleTimeString('zh-TW');
      } catch (e) { $('storiesStatusMsg').textContent = '載入失敗: ' + e.message; }
    }
    function renderStoryReports(rows) {
      var tbody = document.querySelector('#storyReportsTable tbody');
      if (rows.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="muted">沒有待處理檢舉</td></tr>'; return; }
      var REASONS = { inappropriate: '不當內容', spam: '垃圾訊息', privacy: '洩露隱私', other: '其他' };
      tbody.innerHTML = rows.map(function (r) {
        var isStory = !!r.story_id;
        var excerpt = isStory ? (r.story_title || '') : (r.comment_body || '').slice(0, 80);
        var hideBtn = isStory
          ? '<button data-story-hide="' + r.story_id + '">隱藏故事</button>'
          : '<button data-comment-hide="' + r.comment_id + '">隱藏留言</button>';
        return '<tr>' +
          '<td>' + (isStory ? '故事' : '留言') + '</td>' +
          '<td style="max-width:300px">' + esc(excerpt) + '</td>' +
          '<td>' + esc(REASONS[r.reason] || r.reason) + (r.detail ? '：' + esc(r.detail) : '') + '</td>' +
          '<td>' + esc(r.reporter_email || '—') + '</td>' +
          '<td>' + fmtDate(r.created_at) + '</td>' +
          '<td>' + hideBtn + '</td>' +
          '</tr>';
      }).join('');
      wireStoryModeration(tbody);
    }
    function renderStoryFlagged(rows) {
      var tbody = document.querySelector('#storyFlaggedTable tbody');
      if (rows.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="muted">沒有 AI 標記的故事</td></tr>'; return; }
      tbody.innerHTML = rows.map(function (r) {
        return '<tr>' +
          '<td style="max-width:300px">' + esc(r.title) + '</td>' +
          '<td>' + (r.toxicity_flags || []).map(esc).join(', ') + '</td>' +
          '<td>' + fmtDate(r.created_at) + '</td>' +
          '<td><button data-story-hide="' + r.id + '">隱藏</button></td>' +
          '</tr>';
      }).join('');
      wireStoryModeration(tbody);
    }
    function wireStoryModeration(scope) {
      scope.querySelectorAll('button[data-story-hide]').forEach(function (btn) {
        btn.addEventListener('click', function () { moderateStory('/api/admin/stories/' + btn.getAttribute('data-story-hide') + '/moderate', btn); });
      });
      scope.querySelectorAll('button[data-comment-hide]').forEach(function (btn) {
        btn.addEventListener('click', function () { moderateStory('/api/admin/stories/comments/' + btn.getAttribute('data-comment-hide') + '/moderate', btn); });
      });
    }
    async function moderateStory(url, btn) {
      btn.disabled = true;
      try {
        var res = await fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'hide' })
        });
        if (!res.ok) throw new Error('moderate ' + res.status);
        await loadStories();
      } catch (e) { btn.disabled = false; $('storiesStatusMsg').textContent = '操作失敗: ' + e.message; }
    }
    $('storiesRefresh').addEventListener('click', loadStories);

    // ── 投票心聲 moderation ────────────────────────────────────────────────
    async function loadPollVoices() {
      $('pollsStatusMsg').textContent = '載入中…';
      try {
        var res = await fetch('/api/admin/polls/voice-reports?status=pending');
        if (!res.ok) throw new Error('polls ' + res.status);
        renderPollVoiceReports((await res.json()).reports || []);
        $('pollsStatusMsg').textContent = '更新於 ' + new Date().toLocaleTimeString('zh-TW');
      } catch (e) { $('pollsStatusMsg').textContent = '載入失敗: ' + e.message; }
    }
    function renderPollVoiceReports(rows) {
      var tbody = document.querySelector('#pollVoiceReportsTable tbody');
      if (rows.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="muted">沒有待處理檢舉</td></tr>'; return; }
      var REASONS = { inappropriate: '不當內容', spam: '垃圾訊息', privacy: '洩露隱私', other: '其他' };
      tbody.innerHTML = rows.map(function (r) {
        return '<tr>' +
          '<td style="max-width:200px">' + esc(r.question) + '</td>' +
          '<td style="max-width:280px">' + esc(r.voice_body) + '</td>' +
          '<td>' + esc(REASONS[r.reason] || r.reason) + '</td>' +
          '<td>' + esc(r.reporter_email || '—') + '</td>' +
          '<td>' + fmtDate(r.created_at) + '</td>' +
          '<td><button data-voice-hide="' + r.voice_id + '">隱藏</button></td>' +
          '</tr>';
      }).join('');
      tbody.querySelectorAll('button[data-voice-hide]').forEach(function (btn) {
        btn.addEventListener('click', function () { moderatePollVoice(btn.getAttribute('data-voice-hide'), btn); });
      });
    }
    async function moderatePollVoice(voiceId, btn) {
      btn.disabled = true;
      try {
        var res = await fetch('/api/admin/polls/voices/' + voiceId + '/moderate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'hide' })
        });
        if (!res.ok) throw new Error('moderate ' + res.status);
        await loadPollVoices();
      } catch (e) { btn.disabled = false; $('pollsStatusMsg').textContent = '操作失敗: ' + e.message; }
    }
    $('pollsRefresh').addEventListener('click', loadPollVoices);

    // ── Q&A revenue pool ───────────────────────────────────────────────────
    var POOL_STRATEGY = { even: '平均分配', volume: '依回覆量', engagement: '依參與度' };
    var POOL_STATUS = { draft: '草稿', computed: '已計算', finalized: '已結算', paid_out: '已撥款' };
    async function loadPools() {
      $('poolStatusMsg').textContent = '載入中…';
      try {
        var res = await fetch('/api/admin/therapists/qa/pools');
        if (!res.ok) throw new Error('pools ' + res.status);
        var body = await res.json();
        renderPools(body.pools || []);
        $('poolStatusMsg').textContent = '更新於 ' + new Date().toLocaleTimeString('zh-TW');
      } catch (e) { $('poolStatusMsg').textContent = '載入失敗: ' + e.message; }
    }
    function renderPools(rows) {
      var tbody = document.querySelector('#poolsTable tbody');
      if (rows.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="muted">尚無分潤池</td></tr>'; return; }
      tbody.innerHTML = rows.map(function (p) {
        var month = String(p.period_month).slice(0, 7);
        var actions = '<button data-pool="view" data-id="' + p.id + '">查看</button>';
        if (p.status === 'draft' || p.status === 'computed') actions += ' <button data-pool="compute" data-id="' + p.id + '">計算</button>';
        if (p.status === 'computed') actions += ' <button data-pool="finalize" data-id="' + p.id + '">結算</button>';
        return '<tr>' +
          '<td>' + esc(month) + '</td>' +
          '<td class="num">NT$' + (p.pool_twd || 0).toLocaleString() + '</td>' +
          '<td>' + esc(POOL_STRATEGY[p.split_strategy] || p.split_strategy) + '</td>' +
          '<td>' + esc(POOL_STATUS[p.status] || p.status) + '</td>' +
          '<td class="num">' + (p.recipient_count || 0) + '</td>' +
          '<td class="num">NT$' + Number(p.allocated_twd || 0).toLocaleString() + '</td>' +
          '<td>' + actions + '</td>' +
          '</tr>';
      }).join('');
      tbody.querySelectorAll('button[data-pool]').forEach(function (btn) {
        btn.addEventListener('click', function () { poolAction(btn.getAttribute('data-id'), btn.getAttribute('data-pool'), btn); });
      });
    }
    async function poolAction(id, action, btn) {
      if (action === 'view') return openPoolDetail(id);
      btn.disabled = true;
      try {
        var path = action === 'compute' ? '/compute' : '/finalize';
        var res = await fetch('/api/admin/therapists/qa/pools/' + id + path, { method: 'POST' });
        if (!res.ok) throw new Error(action + ' ' + res.status);
        await loadPools();
        if (action === 'compute') openPoolDetail(id);
      } catch (e) { btn.disabled = false; $('poolStatusMsg').textContent = '操作失敗: ' + e.message; }
    }
    var currentPoolId = null;
    async function openPoolDetail(id) {
      try {
        currentPoolId = id;
        var res = await fetch('/api/admin/therapists/qa/pools/' + id);
        if (!res.ok) throw new Error('detail ' + res.status);
        var body = await res.json();
        $('poolDetail').hidden = false;
        $('poolDetailTitle').textContent = '分潤明細 · ' + String(body.pool.period_month).slice(0, 7) + '（' + (POOL_STATUS[body.pool.status] || body.pool.status) + '）';
        renderShares(body.shares || []);
        $('poolDetail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (e) { $('poolStatusMsg').textContent = '載入明細失敗: ' + e.message; }
    }
    function renderShares(rows) {
      var tbody = document.querySelector('#sharesTable tbody');
      if (rows.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="muted">尚未計算分潤</td></tr>'; return; }
      tbody.innerHTML = rows.map(function (s) {
        var paid = s.payout_status === 'paid'
          ? '<span class="badge yes">已撥款</span>'
          : '<span class="badge no">未撥款</span>';
        var action = s.payout_status === 'paid' ? '—' : '<button data-share="' + s.id + '">標記已撥款</button>';
        return '<tr>' +
          '<td>' + esc(s.therapist_name) + '</td>' +
          '<td class="num">' + (s.message_count || 0) + '</td>' +
          '<td class="num">' + (s.published_count || 0) + '</td>' +
          '<td class="num">' + (s.vote_count || 0) + '</td>' +
          '<td class="num">' + Number(s.weight || 0) + '</td>' +
          '<td class="num">NT$' + Number(s.share_twd || 0).toLocaleString() + '</td>' +
          '<td>' + paid + '</td>' +
          '<td>' + action + '</td>' +
          '</tr>';
      }).join('');
      tbody.querySelectorAll('button[data-share]').forEach(function (btn) {
        btn.addEventListener('click', function () { markSharePaid(btn.getAttribute('data-share'), btn); });
      });
    }
    async function markSharePaid(id, btn) {
      var note = window.prompt('撥款備註（選填，例如銀行匯款編號）：') || undefined;
      btn.disabled = true;
      try {
        var res = await fetch('/api/admin/therapists/qa/shares/' + id + '/mark-paid', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: note })
        });
        if (!res.ok) throw new Error('mark-paid ' + res.status);
        await loadPools();
        if (currentPoolId) await openPoolDetail(currentPoolId);
      } catch (e) { btn.disabled = false; $('poolStatusMsg').textContent = '撥款標記失敗: ' + e.message; }
    }
    async function createPool() {
      var month = $('poolMonth').value; // YYYY-MM
      var amount = parseInt($('poolAmount').value, 10);
      if (!month || !(amount >= 0)) { $('poolStatusMsg').textContent = '請輸入月份與金額'; return; }
      $('poolCreate').disabled = true;
      try {
        var res = await fetch('/api/admin/therapists/qa/pools', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ periodMonth: month + '-01', poolTwd: amount, splitStrategy: $('poolStrategy').value })
        });
        if (!res.ok) { var b = await res.json().catch(function(){return {};}); throw new Error(b.message || ('create ' + res.status)); }
        await loadPools();
        $('poolStatusMsg').textContent = '已建立／更新';
      } catch (e) { $('poolStatusMsg').textContent = '建立失敗: ' + e.message; }
      finally { $('poolCreate').disabled = false; }
    }
    $('poolCreate').addEventListener('click', createPool);

    // ── Coupons ("優惠碼") ──────────────────────────────────────────────────
    var couponEditingId = null;
    async function loadCoupons() {
      $('couponStatusMsg').textContent = '載入中…';
      try {
        var res = await fetch('/api/admin/coupons');
        if (!res.ok) throw new Error('coupons ' + res.status);
        var body = await res.json();
        renderCoupons(body.coupons || []);
        $('couponStatusMsg').textContent = '更新於 ' + new Date().toLocaleTimeString('zh-TW');
      } catch (e) {
        $('couponStatusMsg').textContent = '載入失敗: ' + e.message;
      }
    }
    function couponStatusBadge(c) {
      if (!c.active) return '<span class="badge no">已停用</span>';
      if (c.expires_at && new Date(c.expires_at) < new Date()) return '<span class="badge no">已過期</span>';
      if (c.max_redemptions != null && c.redeemed_count >= c.max_redemptions) return '<span class="badge no">已兌換完畢</span>';
      return '<span class="badge yes">生效中</span>';
    }
    function renderCoupons(rows) {
      var tbody = document.querySelector('#couponsTable tbody');
      if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="muted">尚無優惠碼</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(function (c) {
        var maxLabel = c.max_redemptions == null ? '不限' : c.max_redemptions;
        var toggleLabel = c.active ? '停用' : '啟用';
        return '<tr>' +
          '<td><code>' + esc(c.code) + '</code></td>' +
          '<td class="num">' + c.days + '</td>' +
          '<td class="num">' + c.redeemed_count + ' / ' + maxLabel + '</td>' +
          '<td>' + (c.expires_at ? fmtDate(c.expires_at) : '永不過期') + '</td>' +
          '<td>' + couponStatusBadge(c) + '</td>' +
          '<td class="muted" style="font-size:12px;max-width:220px">' + esc(c.note || '') + '</td>' +
          '<td>' + fmtDate(c.created_at) + '</td>' +
          '<td>' +
            '<button data-coupon-edit="' + c.id + '">編輯</button> ' +
            '<button data-coupon-toggle="' + c.id + '" data-next="' + (!c.active) + '">' + toggleLabel + '</button> ' +
            '<button class="danger" data-coupon-del="' + c.id + '" data-code="' + esc(c.code) + '">刪除</button>' +
          '</td>' +
          '</tr>';
      }).join('');
      tbody.querySelectorAll('button[data-coupon-edit]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var target = btn.getAttribute('data-coupon-edit');
          startEditCoupon(rows.find(function (r) { return r.id === target; }));
        });
      });
      tbody.querySelectorAll('button[data-coupon-toggle]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          toggleCoupon(btn.getAttribute('data-coupon-toggle'), btn.getAttribute('data-next') === 'true', btn);
        });
      });
      tbody.querySelectorAll('button[data-coupon-del]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          deleteCoupon(btn.getAttribute('data-coupon-del'), btn.getAttribute('data-code'), btn);
        });
      });
    }
    function startEditCoupon(c) {
      if (!c) return;
      couponEditingId = c.id;
      $('couponCode').value = c.code;
      $('couponDays').value = c.days;
      $('couponMax').value = c.max_redemptions == null ? '' : c.max_redemptions;
      $('couponExpires').value = c.expires_at ? String(c.expires_at).slice(0, 10) : '';
      $('couponNote').value = c.note || '';
      $('couponSubmit').textContent = '更新';
      $('couponCancelEdit').hidden = false;
    }
    function resetCouponForm() {
      couponEditingId = null;
      $('couponCode').value = '';
      $('couponDays').value = '30';
      $('couponMax').value = '';
      $('couponExpires').value = '';
      $('couponNote').value = '';
      $('couponSubmit').textContent = '建立';
      $('couponCancelEdit').hidden = true;
    }
    $('couponCancelEdit').addEventListener('click', resetCouponForm);
    async function submitCoupon() {
      var payload = {
        code: $('couponCode').value.trim(),
        days: parseInt($('couponDays').value, 10),
        max_redemptions: $('couponMax').value === '' ? null : parseInt($('couponMax').value, 10),
        expires_at: $('couponExpires').value || null,
        note: $('couponNote').value.trim() || null,
      };
      if (!payload.code) { $('couponStatusMsg').textContent = '請輸入代碼'; return; }
      if (!(payload.days > 0)) { $('couponStatusMsg').textContent = '請輸入天數'; return; }
      $('couponSubmit').disabled = true;
      try {
        var url = couponEditingId ? '/api/admin/coupons/' + couponEditingId : '/api/admin/coupons';
        var method = couponEditingId ? 'PATCH' : 'POST';
        var res = await fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        var b = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(b.error || (method + ' ' + res.status));
        resetCouponForm();
        await loadCoupons();
        $('couponStatusMsg').textContent = '已儲存';
      } catch (e) {
        $('couponStatusMsg').textContent = '儲存失敗: ' + e.message;
      } finally {
        $('couponSubmit').disabled = false;
      }
    }
    $('couponSubmit').addEventListener('click', submitCoupon);
    async function toggleCoupon(id, next, btn) {
      btn.disabled = true;
      try {
        var res = await fetch('/api/admin/coupons/' + id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: next }),
        });
        if (!res.ok) throw new Error('toggle ' + res.status);
        await loadCoupons();
      } catch (e) {
        btn.disabled = false;
        $('couponStatusMsg').textContent = '更新失敗: ' + e.message;
      }
    }
    async function deleteCoupon(id, code, btn) {
      if (!confirm('永久刪除優惠碼「' + code + '」？\\n\\n已兌換的紀錄會一併刪除，但不影響已發放的 Premium 天數，且無法復原。')) return;
      btn.disabled = true;
      try {
        var res = await fetch('/api/admin/coupons/' + id, { method: 'DELETE' });
        if (!res.ok) throw new Error('delete ' + res.status);
        if (couponEditingId === id) resetCouponForm();
        await loadCoupons();
      } catch (e) {
        btn.disabled = false;
        $('couponStatusMsg').textContent = '刪除失敗: ' + e.message;
      }
    }

    // ── Roleplay invitations ────────────────────────────────────────────────
    var ROLEPLAY_LEVEL_LABEL = {
      normal: '普通', mild: '輕微', moderate: '中等', explicit: '露骨', intense: '最強烈'
    };
    var ROLEPLAY_CAT_LABEL = {
      romantic: '浪漫', adventurous: '冒險', school: '校園', bold: '大膽'
    };

    async function loadRoleplay() {
      try {
        var res = await fetch('/api/admin/roleplay-invitations?limit=100');
        if (!res.ok) throw new Error('roleplay ' + res.status);
        var body = await res.json();
        renderRoleplayScripts(body.scripts || []);
        renderRoleplayFeedback(body.feedback || []);
      } catch (e) {
        var tb = document.querySelector('#roleplayScriptsTable tbody');
        tb.innerHTML = '<tr><td colspan="7" class="error">載入失敗: ' + esc(e.message) + '</td></tr>';
      }
    }

    function renderRoleplayScripts(rows) {
      var tbody = document.querySelector('#roleplayScriptsTable tbody');
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="muted">尚無資料 — 等使用者開始生成劇本邀請後再回來看。</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(function (r) {
        return '<tr>' +
          '<td>' + esc(r.script_title || r.script_id || '—') + '</td>' +
          '<td>' + esc(ROLEPLAY_CAT_LABEL[r.category] || r.category || '—') + '</td>' +
          '<td class="num">' + (r.gen_count || 0) + '</td>' +
          '<td class="num">' + (r.ups || 0) + '</td>' +
          '<td class="num">' + (r.downs || 0) + '</td>' +
          '<td class="num">' + (r.comments || 0) + '</td>' +
          '<td>' + fmtDate(r.generated_at || r.last_feedback_at) + '</td>' +
        '</tr>';
      }).join('');
    }

    function renderRoleplayFeedback(rows) {
      var tbody = document.querySelector('#roleplayFeedbackTable tbody');
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="muted">尚無訊息回饋。</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(function (r) {
        var rating = r.rating === 'up' ? '👍' : (r.rating === 'down' ? '👎' : '—');
        var who = esc(r.nickname || r.email || '—');
        return '<tr>' +
          '<td>' + fmtDate(r.created_at) + '</td>' +
          '<td>' + esc(r.script_title || r.script_id || '—') + '</td>' +
          '<td>' + esc(ROLEPLAY_LEVEL_LABEL[r.level] || r.level || '—') + '</td>' +
          '<td>' + rating + '</td>' +
          '<td>' + esc(r.message_text || '—') + '</td>' +
          '<td>' + esc(r.feedback_text || '—') + '</td>' +
          '<td>' + who + '</td>' +
        '</tr>';
      }).join('');
    }

    async function loadAiUsage() {
      try {
        var qs = new URLSearchParams({ from: $('from').value, to: $('to').value });
        var res = await fetch('/api/admin/ai-usage?' + qs.toString());
        if (!res.ok) throw new Error('ai-usage ' + res.status);
        renderAiUsage(await res.json());
      } catch (e) {
        $('error').hidden = false;
        $('error').textContent = '載入失敗: ' + e.message;
      }
    }

    function renderAiUsage(d) {
      var t = d.totals || {};
      $('aiUsageCards').innerHTML = [
        ['總估算成本', fmtUsd(t.total_cost_usd)],
        ['AI 呼叫次數', (t.calls || 0).toLocaleString()],
        ['輸入 / 輸出 tokens', (t.input_tokens || 0).toLocaleString() + ' / ' + (t.output_tokens || 0).toLocaleString()],
        ['不重複使用者', (t.unique_users || 0).toLocaleString()],
      ].map(function (pair) {
        return '<div class="card"><div class="label">' + pair[0] + '</div>' +
          '<div class="value">' + pair[1] + '</div></div>';
      }).join('');

      var kindBody = document.querySelector('#aiUsageKindTable tbody');
      kindBody.innerHTML = (d.byKind || []).length === 0
        ? '<tr><td colspan="7" class="muted">沒有資料</td></tr>'
        : d.byKind.map(function (r) {
          return '<tr>' +
            '<td>' + esc(kindLabel(r.kind)) + '</td>' +
            '<td class="num">' + (r.calls || 0).toLocaleString() + '</td>' +
            '<td class="num">' + fmtUsd(r.total_cost_usd) + '</td>' +
            '<td class="num">' + (r.input_tokens || 0).toLocaleString() + '</td>' +
            '<td class="num">' + (r.output_tokens || 0).toLocaleString() + '</td>' +
            '<td class="num">' + (r.avg_duration_ms || 0).toLocaleString() + ' ms</td>' +
            '<td class="num">' + (r.unique_users || 0).toLocaleString() + '</td>' +
          '</tr>';
        }).join('');

      var modelBody = document.querySelector('#aiUsageModelTable tbody');
      modelBody.innerHTML = (d.byModel || []).length === 0
        ? '<tr><td colspan="4" class="muted">沒有資料</td></tr>'
        : d.byModel.map(function (r) {
          return '<tr>' +
            '<td>' + esc(r.provider || '—') + '</td>' +
            '<td>' + esc(r.model || '—') + '</td>' +
            '<td class="num">' + (r.calls || 0).toLocaleString() + '</td>' +
            '<td class="num">' + fmtUsd(r.total_cost_usd) + '</td>' +
          '</tr>';
        }).join('');

      var dailyBody = document.querySelector('#aiUsageDailyTable tbody');
      dailyBody.innerHTML = (d.daily || []).length === 0
        ? '<tr><td colspan="3" class="muted">沒有資料</td></tr>'
        : d.daily.map(function (r) {
          return '<tr>' +
            '<td>' + esc(String(r.day || '').slice(0, 10)) + '</td>' +
            '<td class="num">' + (r.calls || 0).toLocaleString() + '</td>' +
            '<td class="num">' + fmtUsd(r.daily_cost_usd) + '</td>' +
          '</tr>';
        }).join('');

      var usersBody = document.querySelector('#aiUsageUsersTable tbody');
      usersBody.innerHTML = (d.topUsers || []).length === 0
        ? '<tr><td colspan="4" class="muted">沒有資料</td></tr>'
        : d.topUsers.map(function (r) {
          return '<tr>' +
            '<td><div>' + esc(r.email || '—') + '</div>' +
              '<div class="muted" style="font-size:11px">' + esc(r.nickname || '') + '</div></td>' +
            '<td class="num">' + (r.calls || 0).toLocaleString() + '</td>' +
            '<td class="num">' + fmtUsd(r.total_cost_usd) + '</td>' +
            '<td>' + fmtDate(r.last_call) + '</td>' +
          '</tr>';
        }).join('');
    }

    // ── Feature flags ──────────────────────────────────────────────────────
    async function loadFlags() {
      $('flagsStatusMsg').textContent = '載入中…';
      try {
        var res = await fetch('/api/admin/feature-flags');
        if (!res.ok) throw new Error('flags ' + res.status);
        var body = await res.json();
        renderFlags(body.flags || []);
        $('flagsStatusMsg').textContent = '更新於 ' + new Date().toLocaleTimeString('zh-TW');
      } catch (e) {
        $('flagsStatusMsg').textContent = '載入失敗: ' + e.message;
      }
    }
    function renderFlags(rows) {
      var tbody = document.querySelector('#flagsTable tbody');
      if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="muted">沒有可設定的功能開關</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(function (f) {
        var badge = f.enabled
          ? '<span class="badge yes">已開啟</span>'
          : '<span class="badge no">已關閉</span>';
        var btnLabel = f.enabled ? '關閉' : '開啟';
        return '<tr>' +
          '<td><div>' + esc(f.label || f.key) + '</div>' +
            '<div class="muted" style="font-size:11px">' + esc(f.key) + '</div></td>' +
          '<td class="muted" style="font-size:12px;max-width:340px">' + esc(f.description || '') + '</td>' +
          '<td class="num">' + badge +
            ' <button data-flag-toggle data-key="' + esc(f.key) + '" data-next="' + (f.enabled ? '0' : '1') + '">' +
            btnLabel + '</button></td>' +
          '</tr>';
      }).join('');
      tbody.querySelectorAll('button[data-flag-toggle]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          toggleFlag(btn.getAttribute('data-key'), btn.getAttribute('data-next') === '1', btn);
        });
      });
    }
    async function toggleFlag(key, enabled, btn) {
      btn.disabled = true;
      btn.textContent = '處理中…';
      try {
        var res = await fetch('/api/admin/feature-flags/' + encodeURIComponent(key), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: enabled }),
        });
        if (!res.ok) throw new Error('toggle ' + res.status);
        loadFlags();
      } catch (e) {
        btn.disabled = false;
        btn.textContent = enabled ? '開啟' : '關閉';
        alert('更新失敗：' + e.message);
      }
    }

    // Lazy-load the reviews + pool + roleplay + ai-usage + flags tabs the first
    // time they're opened.
    var reviewsLoaded = false, feedbackLoaded = false, poolLoaded = false, couponsLoaded = false, roleplayLoaded = false, aiUsageLoaded = false, flagsLoaded = false, storiesLoaded = false, pollsLoaded = false, aiDownvotesLoaded = false;
    document.querySelectorAll('.tab').forEach(function (btn) {
      var panel = btn.getAttribute('data-panel');
      if (panel === 'reviews') btn.addEventListener('click', function () { if (!reviewsLoaded) { reviewsLoaded = true; loadReviews(); } });
      if (panel === 'feedback') btn.addEventListener('click', function () { if (!feedbackLoaded) { feedbackLoaded = true; loadFeedback(); } });
      if (panel === 'stories') btn.addEventListener('click', function () { if (!storiesLoaded) { storiesLoaded = true; loadStories(); } });
      if (panel === 'polls') btn.addEventListener('click', function () { if (!pollsLoaded) { pollsLoaded = true; loadPollVoices(); } });
      if (panel === 'pool') btn.addEventListener('click', function () { if (!poolLoaded) { poolLoaded = true; loadPools(); } });
      if (panel === 'coupons') btn.addEventListener('click', function () { if (!couponsLoaded) { couponsLoaded = true; loadCoupons(); } });
      if (panel === 'roleplay') btn.addEventListener('click', function () { if (!roleplayLoaded) { roleplayLoaded = true; loadRoleplay(); } });
      if (panel === 'ai-usage') btn.addEventListener('click', function () { if (!aiUsageLoaded) { aiUsageLoaded = true; loadAiUsage(); } });
      if (panel === 'ai-downvotes') btn.addEventListener('click', function () { if (!aiDownvotesLoaded) { aiDownvotesLoaded = true; loadDownvotes(); } });
      if (panel === 'flags') btn.addEventListener('click', function () { if (!flagsLoaded) { flagsLoaded = true; loadFlags(); } });
    });

    $('apply').addEventListener('click', function () {
      load();
      // Refresh the AI usage tab too if it's already been opened, so changing
      // the date range updates its numbers.
      if (aiUsageLoaded) loadAiUsage();
    });
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

// ADMIN_HTML is exported so scripts/check-admin-inline-script.js can validate
// the embedded <script> (which lives inside a template literal and is therefore
// invisible to eslint / `node --check` on this module).
module.exports = { publicRouter, adminApiRouter, htmlHandler, purgeOldLandingVisits, ADMIN_HTML };
