const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

const storage = new AsyncLocalStorage();

function getRequestContext() {
  return storage.getStore();
}

function parseTraceId(header) {
  if (!header || typeof header !== 'string') return undefined;
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
