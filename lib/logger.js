const PROD = process.env.NODE_ENV === 'production';
const QUIET = process.env.NODE_ENV === 'test' && process.env.LOG_VERBOSE !== '1';

function safeReplacer(_key, value) {
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length}B]`;
  if (typeof value === 'string' && /^Bearer\s+/i.test(value)) return '[REDACTED]';
  return value;
}

function requestCorrelation() {
  try {
    const { getRequestContext } = require('../middleware/request-context');
    const ctx = getRequestContext();
    if (!ctx) return undefined;
    const out = {};
    if (ctx.requestId) out.requestId = ctx.requestId;
    if (ctx.traceId && process.env.GOOGLE_CLOUD_PROJECT) {
      out['logging.googleapis.com/trace'] =
        `projects/${process.env.GOOGLE_CLOUD_PROJECT}/traces/${ctx.traceId}`;
    }
    return out;
  } catch {
    return undefined;
  }
}

function emit(severity, message, fields = {}) {
  if (QUIET && severity !== 'ERROR' && severity !== 'CRITICAL') return;

  const entry = {
    severity,
    message,
    time: new Date().toISOString(),
    ...requestCorrelation(),
    ...fields,
  };

  const line = PROD
    ? JSON.stringify(entry, safeReplacer)
    : `[${severity}] ${message} ${
        Object.keys(fields).length ? JSON.stringify(fields, safeReplacer) : ''
      }`.trimEnd();

  const stream =
    severity === 'ERROR' || severity === 'CRITICAL' || severity === 'WARNING'
      ? process.stderr
      : process.stdout;
  stream.write(line + '\n');
}

const logInfo = (message, fields) => emit('INFO', message, fields);
const logWarn = (message, fields) => emit('WARNING', message, fields);
const logError = (message, fields) => emit('ERROR', message, fields);

module.exports = { emit, logInfo, logWarn, logError };
