# 0005. Structured logging & request correlation

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: `lib/logger.js`, `lib/db-errors.js`, `middleware/logging.js`, `middleware/request-context.js`

## Decisions

- **One JSON line per log call, with a `severity` field.** App Engine parses this
  natively, so each call becomes one Cloud Logging entry with its fields under
  `jsonPayload.<field>`. Raw `console.log(label, obj)` splits a multi-line object
  into N entries, which made errors hard to read in the past. WARNING and above
  go to stderr, the rest to stdout (GCP convention). Buffers are logged as
  `[Buffer nB]`, and `Bearer …` strings are redacted.
- **Request correlation via AsyncLocalStorage.** Every request gets a
  `requestId`. The trace id is taken from App Engine's `X-Cloud-Trace-Context`
  (`TRACE_ID/SPAN_ID;o=1`), and both are returned as `X-Request-Id` /
  `X-Trace-Id`. The logger attaches `requestId` and
  `logging.googleapis.com/trace` to every entry automatically, so one request's
  logs group under one trace. The client log beacon echoes `X-Request-Id` back
  to link a UI failure to its backend run. The logger requires the context lazily
  to avoid a require cycle.
- **Request bodies are summarized, not stored.** `content` / `scenario` /
  `script` are always replaced by a size placeholder, because they can carry
  large and sometimes explicit user content. Other long strings are cut at 200
  chars. The summary is shallow, since request bodies are flat.
- **`slow_request` fires at 1000 ms** (a warning), so Cloud Logging can list slow
  routes directly (docs/PERFORMANCE.md). **`Server-Timing: app;dur=`** lets
  `src/utils/perf.ts` split a slow call into server time vs. network, cold start
  and queueing.
- **Under `NODE_ENV=test`, everything below ERROR is silent**
  (`LOG_VERBOSE=1` turns it back on). Errors always print, so a failing test
  shows its cause.
- DB errors from upstream HTTP calls (Supabase Storage) also log `status` and
  `responseData`, so the real cause isn't hidden behind Postgres-shaped fields.
