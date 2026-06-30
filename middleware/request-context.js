// Per-request context (request id + Cloud Trace id) carried via AsyncLocalStorage.
//
// App Engine already sets an `X-Cloud-Trace-Context` header on every inbound
// request (format: `TRACE_ID/SPAN_ID;o=1`). We extract TRACE_ID, mint our own
// `requestId`, stash both in an AsyncLocalStorage store, and expose them on the
// response as `X-Request-Id` / `X-Trace-Id`.
//
// lib/logger reads this store and auto-attaches `requestId` +
// `logging.googleapis.com/trace` to every log entry, so all logs for one
// request group under the same trace in Cloud Logging — and the frontend can
// echo the `X-Request-Id` back (client-log beacon) to link a UI failure to the
// exact backend execution.

const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

const storage = new AsyncLocalStorage();

// Returns the active request's { requestId, traceId } or undefined when outside
// a request (e.g. startup, background jobs).
function getRequestContext() {
  return storage.getStore();
}

function parseTraceId(header) {
  if (!header || typeof header !== 'string') return undefined;
  // `TRACE_ID/SPAN_ID;o=1` → `TRACE_ID`
  const traceId = header.split('/')[0].trim();
  return traceId || undefined;
}

const requestContext = (req, res, next) => {
  const traceId = parseTraceId(req.get('X-Cloud-Trace-Context'));
  const requestId = crypto.randomUUID();

  res.set('X-Request-Id', requestId);
  if (traceId) res.set('X-Trace-Id', traceId);

  storage.run({ requestId, traceId }, () => next());
};

module.exports = { requestContext, getRequestContext };
